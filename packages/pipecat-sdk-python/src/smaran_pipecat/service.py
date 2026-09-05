"""Smaran Pipecat service integration.

Provides a Pipecat FrameProcessor that recalls relevant Smaran memories
before each LLM call and saves new memories from the conversation after.
"""

import asyncio
import os
import re
from typing import Any, Literal, Optional

from loguru import logger
from pydantic import BaseModel, Field

from pipecat.frames.frames import Frame, InputAudioRawFrame, LLMContextFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from smaran import Smaran, SmaranConfigurationError

from .exceptions import ConfigurationError, MemoryRetrievalError
from .utils import format_memories_to_text, get_last_user_message

# XML tags for memory injection (replacement instead of accumulation)
MEMORY_TAG_START = "<user_memories>"
MEMORY_TAG_END = "</user_memories>"
MEMORY_TAG_PATTERN = re.compile(r"<user_memories>.*?</user_memories>", re.DOTALL)


class SmaranPipecatService(FrameProcessor):
    """Memory service that integrates Smaran with Pipecat pipelines.

    Intercepts message frames in the pipeline, recalls relevant memories
    from Smaran, and injects them into the LLM context before generation.

    Example:
        ```python
        from smaran_pipecat import SmaranPipecatService

        memory = SmaranPipecatService(
            api_key=os.getenv("SMARAN_API_KEY"),
            base_url=os.getenv("SMARAN_URL"),
            user_id="user-123",
        )
        ```
    """

    class InputParams(BaseModel):
        """Configuration parameters for memory recall and injection."""

        search_limit: int = Field(default=5, ge=1)
        system_prompt: str = Field(default="Based on previous conversations, I recall:\n\n")
        inject_mode: Literal["auto", "system", "user"] = Field(default="auto")
        save_memory: bool = Field(default=True)

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        user_id: str,
        session_id: Optional[str] = None,
        params: Optional[InputParams] = None,
    ):
        """Initialize the Smaran Pipecat service.

        Args:
            api_key: Smaran API key. Falls back to the SMARAN_API_KEY env var.
            base_url: Smaran API base URL. Falls back to the SMARAN_URL env var.
            user_id: The user ID memories are scoped to.
            session_id: Optional session/conversation ID for grouping memories.
            params: Configuration parameters for memory retrieval.

        Raises:
            ConfigurationError: If required configuration is missing.
        """
        super().__init__()

        if not user_id:
            raise ConfigurationError("user_id is required")

        self.user_id = user_id
        self.session_id = session_id
        self.params = params or SmaranPipecatService.InputParams()

        try:
            self._client: Optional[Smaran] = Smaran(
                api_key=api_key or os.getenv("SMARAN_API_KEY"),
                base_url=base_url or os.getenv("SMARAN_URL"),
            )
        except SmaranConfigurationError as e:
            raise ConfigurationError(str(e), e) from e

        self._messages_sent_count: int = 0
        self._last_query: Optional[str] = None
        self._audio_frames_detected: bool = False

    async def _retrieve_memories_text(self, query: str) -> str:
        """Recall memories relevant to ``query`` and format them for injection."""
        try:
            hits = await self._client.recall(
                query=query,
                user_id=self.user_id,
                session_id=self.session_id,
                top_k=self.params.search_limit,
            )
        except Exception as e:
            logger.error(f"Error recalling memories from Smaran: {e}")
            raise MemoryRetrievalError("Failed to recall memories", e) from e

        return format_memories_to_text(hits, system_prompt=self.params.system_prompt)

    async def _store_message(self, text: str) -> None:
        """Save a message as a new memory (non-blocking, fire-and-forget)."""
        if not self.params.save_memory or not text:
            return
        try:
            await self._client.save(text=text, user_id=self.user_id, session_id=self.session_id)
        except Exception as e:
            logger.error(f"Error saving memory to Smaran: {e}")

    def _enhance_context_with_memories(
        self,
        context: LLMContext,
        query: str,
        memory_text: str,
    ) -> None:
        """Inject recalled memory text into the LLM context.

        Uses XML tags to wrap memories, allowing replacement on each turn
        instead of accumulation.
        """
        if self._last_query == query:
            return
        self._last_query = query

        if not memory_text:
            return

        tagged_memory = f"{MEMORY_TAG_START}\n{memory_text}\n{MEMORY_TAG_END}"

        inject_to_system = self.params.inject_mode == "system" or (
            self.params.inject_mode == "auto" and self._audio_frames_detected
        )

        messages = context.get_messages()

        if inject_to_system:
            system_idx = None
            for i, msg in enumerate(messages):
                if msg.get("role") == "system":
                    system_idx = i
                    break

            if system_idx is not None:
                existing_content = messages[system_idx].get("content", "")
                if MEMORY_TAG_PATTERN.search(existing_content):
                    messages[system_idx]["content"] = MEMORY_TAG_PATTERN.sub(
                        tagged_memory, existing_content
                    )
                else:
                    messages[system_idx]["content"] = f"{existing_content}\n\n{tagged_memory}"
            else:
                messages.insert(0, {"role": "system", "content": tagged_memory})
        else:
            for i in range(len(messages) - 1, -1, -1):
                msg = messages[i]
                if msg.get("role") == "user" and MEMORY_TAG_START in msg.get("content", ""):
                    messages.pop(i)
                    break

            context.add_message({"role": "user", "content": tagged_memory})

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        """Process frames, intercepting context frames for memory integration."""
        await super().process_frame(frame, direction)

        if isinstance(frame, InputAudioRawFrame):
            if not self._audio_frames_detected:
                self._audio_frames_detected = True
            await self.push_frame(frame, direction)
            return

        context = frame.context if isinstance(frame, LLMContextFrame) else None

        if context:
            try:
                context_messages = context.get_messages()
                latest_user_message = get_last_user_message(context_messages)

                if latest_user_message:
                    try:
                        memory_text = await self._retrieve_memories_text(latest_user_message)
                        self._enhance_context_with_memories(
                            context, latest_user_message, memory_text
                        )
                    except MemoryRetrievalError as e:
                        logger.warning(f"Memory retrieval failed: {e}")

                storable_messages = [
                    msg for msg in context_messages if msg["role"] in ("user", "assistant")
                ]
                unsent_messages = storable_messages[self._messages_sent_count :]

                if unsent_messages:
                    for msg in unsent_messages:
                        text = f"{msg['role']}: {msg['content']}"
                        asyncio.create_task(self._store_message(text))
                    self._messages_sent_count = len(storable_messages)

                await self.push_frame(frame)

            except Exception as e:
                logger.error(f"Error processing frame: {e}")
                await self.push_frame(frame)
        else:
            await self.push_frame(frame, direction)

    def reset_memory_tracking(self) -> None:
        """Reset memory tracking state for a new conversation."""
        self._messages_sent_count = 0
        self._last_query = None
        self._audio_frames_detected = False
