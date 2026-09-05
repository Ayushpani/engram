"""Smaran middleware for OpenAI clients.

Wraps an OpenAI client's ``chat.completions.create`` so relevant memories
are recalled and injected into the system prompt automatically, and new
memories are saved from the conversation after.
"""

import asyncio
import inspect
from dataclasses import dataclass
from typing import Any, Optional, Union, cast

from openai import AsyncOpenAI, OpenAI
from openai.types.chat import ChatCompletionSystemMessageParam

from smaran import Smaran
from smaran import SmaranConfigurationError as _ClientConfigurationError

from .exceptions import SmaranConfigurationError, SmaranMemoryOperationError, SmaranNetworkError
from .utils import (
    Logger,
    create_logger,
    format_memories_to_text,
    get_conversation_content,
    get_last_user_message,
)


@dataclass
class OpenAIMiddlewareOptions:
    """Configuration options for the Smaran OpenAI middleware."""

    user_id: str  # Required: identifies who memories are scoped to
    session_id: Optional[str] = None  # Optional: groups messages into one conversation
    verbose: bool = False
    add_memory: bool = True
    search_limit: int = 5


async def _fetch_memories_text(
    client: Smaran,
    user_id: str,
    session_id: Optional[str],
    query_text: str,
    limit: int,
    logger: Logger,
) -> str:
    """Recall memories from Smaran and format them for system-prompt injection."""
    try:
        hits = await client.recall(
            query=query_text, user_id=user_id, session_id=session_id, top_k=limit
        )
    except Exception as e:
        raise SmaranNetworkError("Smaran recall failed", e) from e

    logger.info("Memory recall completed", {"user_id": user_id, "hit_count": len(hits)})
    return format_memories_to_text(hits)


async def _save_memory(
    client: Smaran,
    user_id: str,
    session_id: Optional[str],
    content: str,
    logger: Logger,
) -> None:
    """Save a memory to Smaran."""
    try:
        saved = await client.save(text=content, user_id=user_id, session_id=session_id)
        logger.info("Memory save completed", {"user_id": user_id, "saved": saved})
    except Exception as e:
        logger.error("Error saving memory", {"error": str(e)})
        raise SmaranMemoryOperationError("Failed to save memory", e) from e


class SmaranOpenAIWrapper:
    """Wrapper for an OpenAI client that adds Smaran memory recall/save."""

    def __init__(
        self,
        openai_client: Union[OpenAI, AsyncOpenAI],
        options: OpenAIMiddlewareOptions,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self._client: Union[OpenAI, AsyncOpenAI] = openai_client
        self._options: OpenAIMiddlewareOptions = options
        self._logger: Logger = create_logger(options.verbose)
        self._background_tasks: set[asyncio.Task] = set()

        try:
            self._smaran = Smaran(api_key=api_key, base_url=base_url)
        except _ClientConfigurationError as e:
            raise SmaranConfigurationError(str(e), e) from e

        self._wrap_chat_completions()

    def _wrap_chat_completions(self) -> None:
        original_create = self._client.chat.completions.create

        if inspect.iscoroutinefunction(original_create):

            async def create_with_memory(**kwargs: Any) -> Any:
                return await self._create_with_memory_async(original_create, **kwargs)

        else:

            def create_with_memory(**kwargs: Any) -> Any:
                return self._create_with_memory_sync(original_create, **kwargs)

        setattr(self._client.chat.completions, "create", create_with_memory)

    async def _create_with_memory_async(self, original_create: Any, **kwargs: Any) -> Any:
        messages = kwargs.get("messages", [])

        if self._options.add_memory:
            user_message = get_last_user_message(messages)
            if user_message and user_message.strip():
                content = (
                    get_conversation_content(messages)
                    if self._options.session_id
                    else user_message
                )
                task = asyncio.create_task(
                    _save_memory(
                        self._smaran,
                        self._options.user_id,
                        self._options.session_id,
                        content,
                        self._logger,
                    )
                )
                self._background_tasks.add(task)
                task.add_done_callback(self._background_tasks.discard)

        user_message = get_last_user_message(messages)
        if not user_message:
            return await original_create(**kwargs)

        try:
            memories = await _fetch_memories_text(
                self._smaran,
                self._options.user_id,
                self._options.session_id,
                user_message,
                self._options.search_limit,
                self._logger,
            )
        except Exception as e:
            self._logger.error("Failed to recall memories, proceeding without", {"error": str(e)})
            return await original_create(**kwargs)

        kwargs["messages"] = _inject_memories(messages, memories)
        return await original_create(**kwargs)

    def _create_with_memory_sync(self, original_create: Any, **kwargs: Any) -> Any:
        """Sync version — runs recall/save via asyncio.run(), same as async path."""
        messages = kwargs.get("messages", [])

        if self._options.add_memory:
            user_message = get_last_user_message(messages)
            if user_message and user_message.strip():
                content = (
                    get_conversation_content(messages)
                    if self._options.session_id
                    else user_message
                )
                try:
                    asyncio.run(
                        _save_memory(
                            self._smaran,
                            self._options.user_id,
                            self._options.session_id,
                            content,
                            self._logger,
                        )
                    )
                except Exception as e:
                    self._logger.warn("Failed to save memory synchronously", {"error": str(e)})

        user_message = get_last_user_message(messages)
        if not user_message:
            return original_create(**kwargs)

        try:
            memories = asyncio.run(
                _fetch_memories_text(
                    self._smaran,
                    self._options.user_id,
                    self._options.session_id,
                    user_message,
                    self._options.search_limit,
                    self._logger,
                )
            )
        except Exception as e:
            self._logger.error("Failed to recall memories, proceeding without", {"error": str(e)})
            return original_create(**kwargs)

        kwargs["messages"] = _inject_memories(messages, memories)
        return original_create(**kwargs)

    async def wait_for_background_tasks(self, timeout: Optional[float] = 10.0) -> None:
        """Wait for all background memory-save tasks to complete."""
        if not self._background_tasks:
            return
        try:
            await asyncio.wait_for(
                asyncio.gather(*self._background_tasks, return_exceptions=True), timeout=timeout
            )
        except asyncio.TimeoutError:
            for task in self._background_tasks:
                if not task.done():
                    task.cancel()
            raise

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        try:
            await self.wait_for_background_tasks(timeout=5.0)
        except asyncio.TimeoutError:
            self._logger.warn("Some background memory tasks did not complete on exit")

    def __getattr__(self, name: str) -> Any:
        """Delegate all other attributes to the wrapped client."""
        return getattr(self._client, name)


def _inject_memories(messages: list, memories: str) -> list:
    """Return a new messages list with recalled memories added to the system prompt."""
    if not memories:
        return messages

    has_system = any(msg.get("role") == "system" for msg in messages)
    if has_system:
        return [
            {**msg, "content": f"{msg.get('content', '')}\n\n{memories}"}
            if msg.get("role") == "system"
            else msg
            for msg in messages
        ]

    system_message: ChatCompletionSystemMessageParam = {"role": "system", "content": memories}
    return [system_message] + messages


def with_smaran(
    openai_client: Union[OpenAI, AsyncOpenAI],
    options: OpenAIMiddlewareOptions,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Union[OpenAI, AsyncOpenAI]:
    """Wrap an OpenAI client with Smaran memory middleware.

    Recalls relevant memories from Smaran before each call and injects them
    into the system prompt; optionally saves the conversation after.

    Example:
        ```python
        from smaran_openai import with_smaran, OpenAIMiddlewareOptions
        from openai import OpenAI

        openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        openai_with_memory = with_smaran(
            openai,
            OpenAIMiddlewareOptions(user_id="user-123", session_id="conversation-456"),
        )

        response = await openai_with_memory.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "What's my favorite programming language?"}],
        )
        ```
    """
    wrapper = SmaranOpenAIWrapper(openai_client, options, api_key=api_key, base_url=base_url)
    return cast(Union[OpenAI, AsyncOpenAI], wrapper)
