"""Smaran Cartesia Line agent integration.

Provides a memory-enhanced agent wrapper for Cartesia Line voice agents:
recalls relevant Smaran memories before each turn and saves new memories
from the conversation after.
"""

import asyncio
import os
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from loguru import logger
from pydantic import BaseModel, Field

from smaran import Smaran, SmaranConfigurationError

from .exceptions import ConfigurationError, MemoryRetrievalError
from .utils import format_memories_to_text

try:
    from line.events import Event
except ImportError:
    Event = Any  # type: ignore

MEMORY_TAG_START = "<user_memories>"
MEMORY_TAG_END = "</user_memories>"


class SmaranCartesiaAgent:
    """Memory-enhanced wrapper for Cartesia Line agents.

    Intercepts UserTurnEnded events, recalls relevant memories from Smaran,
    and injects them into the wrapped agent's system prompt before it runs.

    Example:
        ```python
        from line.llm_agent import LlmAgent, LlmConfig
        from smaran_cartesia import SmaranCartesiaAgent

        base_agent = LlmAgent(
            model="anthropic/claude-haiku-4-5-20251001",
            config=LlmConfig(
                system_prompt="You are a helpful assistant.",
                introduction="Hello! How can I help you today?"
            )
        )

        memory_agent = SmaranCartesiaAgent(
            agent=base_agent,
            api_key=os.getenv("SMARAN_API_KEY"),
            user_id="user-123",
            session_id="conversation-456",
        )
        ```
    """

    class MemoryConfig(BaseModel):
        """Configuration for memory recall."""

        search_limit: int = Field(default=5, ge=1)
        system_prompt: str = Field(default="Based on previous conversations:\n\n")
        save_memory: bool = Field(default=True)

    def __init__(
        self,
        *,
        agent: Any,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        user_id: str,
        session_id: str,
        config: Optional[MemoryConfig] = None,
    ):
        """Initialize the Smaran Cartesia agent wrapper.

        Args:
            agent: The inner Cartesia Line agent to wrap.
            api_key: Smaran API key (or SMARAN_API_KEY env var).
            base_url: Smaran API base URL (or SMARAN_URL env var).
            user_id: User identifier memories are scoped to.
            session_id: Conversation/call ID, used to group saved turns.
            config: Memory recall configuration.

        Raises:
            ConfigurationError: If required configuration is missing.
        """
        self.agent = agent
        self.user_id = user_id
        self.session_id = session_id
        self.config = config or SmaranCartesiaAgent.MemoryConfig()

        if not user_id:
            raise ConfigurationError("user_id is required")
        if not session_id or not session_id.strip():
            raise ConfigurationError("session_id is required and must be non-empty")

        try:
            self._client: Optional[Smaran] = Smaran(
                api_key=api_key or os.getenv("SMARAN_API_KEY"),
                base_url=base_url or os.getenv("SMARAN_URL"),
            )
        except SmaranConfigurationError as e:
            raise ConfigurationError(str(e), e) from e

        self._messages_sent_count: int = 0
        self._last_query: Optional[str] = None
        self._background_tasks: set = set()

    async def _retrieve_memories_text(self, query: str) -> str:
        """Recall memories from Smaran and format them for injection."""
        try:
            logger.info(f"[Smaran] Recalling memories for query: {query[:50]}...")
            hits = await asyncio.wait_for(
                self._client.recall(
                    query=query,
                    user_id=self.user_id,
                    session_id=self.session_id,
                    top_k=self.config.search_limit,
                ),
                timeout=10.0,
            )
            logger.info(f"[Smaran] Recalled {len(hits)} memories")
            return format_memories_to_text(hits, system_prompt=self.config.system_prompt)
        except asyncio.TimeoutError:
            logger.warning("[Smaran] Recall timed out after 10s")
            raise MemoryRetrievalError("Recall timed out")
        except Exception as e:
            logger.error(f"[Smaran] Error recalling memories: {e}")
            raise MemoryRetrievalError("Failed to recall memories", e)

    async def _store_messages(self, messages: List[Dict[str, Any]]) -> None:
        """Save messages to Smaran as a new memory."""
        if not self.config.save_memory or not messages:
            return
        try:
            lines = []
            for msg in messages:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role == "user":
                    lines.append(f"User: {content}")
                elif role == "assistant":
                    lines.append(f"Assistant: {content}")

            text = "\n".join(lines)
            logger.info(f"[Smaran] Saving {len(messages)} messages for user={self.user_id}")
            await self._client.save(text=text, user_id=self.user_id, session_id=self.session_id)
        except Exception as e:
            logger.error(f"[Smaran] Error saving messages: {e}")

    def _build_memory_message(self, memory_text: str) -> Optional[str]:
        if not memory_text:
            return None
        return f"{MEMORY_TAG_START}\n{memory_text}\n{MEMORY_TAG_END}"

    def _extract_user_message(self, event: Any) -> Optional[str]:
        """Extract user text from a UserTurnEnded event."""
        if not hasattr(event, "content"):
            return None

        content = event.content

        if isinstance(content, str):
            return content

        if isinstance(content, list):
            texts = []
            for item in content:
                if hasattr(item, "content") and isinstance(item.content, str):
                    texts.append(item.content)
                elif isinstance(item, str):
                    texts.append(item)
            return " ".join(texts) if texts else None

        if hasattr(content, "content"):
            return str(content.content)

        return str(content)

    def _extract_conversation_from_history(self, history: list) -> List[Dict[str, str]]:
        """Extract messages from Cartesia event history."""
        messages = []
        seen = set()

        for item in history:
            if isinstance(item, dict):
                if item.get("role") in ("user", "assistant"):
                    content = item.get("content", "")
                    if content and content not in seen:
                        messages.append(item)
                        seen.add(content)
                continue

            event_type = getattr(item, "type", None) or type(item).__name__

            if event_type in ("user_turn_ended", "UserTurnEnded"):
                nested = getattr(item, "content", [])
                if isinstance(nested, list):
                    for n in nested:
                        if hasattr(n, "content") and isinstance(n.content, str):
                            if n.content not in seen:
                                messages.append({"role": "user", "content": n.content})
                                seen.add(n.content)

            elif event_type in ("agent_turn_ended", "AgentTurnEnded"):
                nested = getattr(item, "content", [])
                if isinstance(nested, list):
                    texts = [
                        n.content for n in nested if hasattr(n, "content") and isinstance(n.content, str)
                    ]
                    if texts:
                        content = " ".join(texts)
                        if content not in seen:
                            messages.append({"role": "assistant", "content": content})
                            seen.add(content)

            elif event_type in ("user_text_sent", "UserTextSent"):
                content = getattr(item, "content", "")
                if content and isinstance(content, str) and content not in seen:
                    messages.append({"role": "user", "content": content})
                    seen.add(content)

            elif event_type in ("agent_text_sent", "AgentTextSent"):
                content = getattr(item, "content", "")
                if content and isinstance(content, str) and content not in seen:
                    messages.append({"role": "assistant", "content": content})
                    seen.add(content)

        return messages

    async def _enrich_event_with_memories(self, event: Any) -> tuple[Any, Optional[str]]:
        """Recall memories relevant to this event.

        Returns:
            Tuple of (event, memory_context) — memory_context is None if no
            memories were found. The event is returned unchanged; injection
            happens at the agent level.
        """
        user_message = self._extract_user_message(event)

        if not user_message:
            logger.warning("[Smaran] Could not extract user message from event")
            return event, None

        if user_message == self._last_query:
            return event, None

        self._last_query = user_message
        logger.info(f"[Smaran] Processing user message: {user_message[:50]}...")

        try:
            memory_text = await self._retrieve_memories_text(user_message)
            memory_context = self._build_memory_message(memory_text)

            if not memory_context:
                logger.info("[Smaran] No memories found for context injection")
                return event, None

            return event, memory_context

        except MemoryRetrievalError as e:
            logger.warning(f"[Smaran] Memory retrieval failed: {e}")
            return event, None
        except Exception as e:
            logger.error(f"[Smaran] Error in memory enrichment: {e}")
            return event, None

    async def process(self, env: Any, event: Event) -> AsyncGenerator[Event, None]:
        """Process events with memory enrichment.

        Args:
            env: Turn environment from Cartesia Line.
            event: Input event to process.

        Yields:
            Output events from the wrapped agent.
        """
        try:
            if type(event).__name__ == "UserTurnEnded":
                event, memory_context = await self._enrich_event_with_memories(event)

                if hasattr(self.agent, "config"):
                    original_prompt = getattr(self.agent.config, "system_prompt", "")
                    if MEMORY_TAG_START in original_prompt:
                        original_prompt = re.sub(
                            rf"{re.escape(MEMORY_TAG_START)}.*?{re.escape(MEMORY_TAG_END)}\s*",
                            "",
                            original_prompt,
                            flags=re.DOTALL,
                        )

                    if memory_context:
                        self.agent.config.system_prompt = f"{memory_context}\n\n{original_prompt}"
                    else:
                        self.agent.config.system_prompt = original_prompt

                if hasattr(event, "history") and event.history:
                    messages = self._extract_conversation_from_history(event.history)
                    unsent = messages[self._messages_sent_count :]
                    if unsent:
                        task = asyncio.create_task(self._store_messages(unsent))
                        self._background_tasks.add(task)
                        task.add_done_callback(self._background_tasks.discard)
                        self._messages_sent_count = len(messages)
                else:
                    user_content = self._extract_user_message(event)
                    if user_content:
                        task = asyncio.create_task(
                            self._store_messages([{"role": "user", "content": user_content}])
                        )
                        self._background_tasks.add(task)
                        task.add_done_callback(self._background_tasks.discard)
                        self._messages_sent_count = 1

                async for output in self.agent.process(env, event):
                    yield output
            else:
                async for output in self.agent.process(env, event):
                    yield output

        except Exception as e:
            logger.error(f"[Smaran] Error in process: {e}")
            async for output in self.agent.process(env, event):
                yield output

    def reset_memory_tracking(self) -> None:
        """Reset memory tracking for a new conversation."""
        self._messages_sent_count = 0
        self._last_query = None
