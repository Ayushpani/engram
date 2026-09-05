"""Smaran middleware for Microsoft Agent Framework.

Provides ChatMiddleware that recalls relevant Smaran memories and injects
them into the system prompt before each LLM call, and optionally saves the
conversation after.
"""

import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from agent_framework import ChatMiddleware, Message

from smaran import Smaran

from .connection import AgentSmaran
from .exceptions import SmaranMemoryOperationError, SmaranNetworkError
from .utils import Logger, create_logger, format_memories_to_text, wrap_memory_injection


@dataclass
class SmaranMiddlewareOptions:
    """Configuration options for Smaran middleware."""

    verbose: bool = False
    search_limit: int = 5
    save_conversations: bool = False


def _get_last_user_message(messages: Any) -> str:
    """Extract the last user message from the messages sequence."""
    if not messages:
        return ""
    for msg in reversed(list(messages)):
        role = msg.role if hasattr(msg, "role") else msg.get("role") if isinstance(msg, dict) else None
        if role == "user":
            content = msg.text if hasattr(msg, "text") else msg.content if hasattr(msg, "content") else (
                msg.get("content", "") or msg.get("text", "") if isinstance(msg, dict) else ""
            )
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return " ".join(
                    p.get("text", "") if isinstance(p, dict) and p.get("type") == "text" else p
                    for p in content
                    if isinstance(p, (dict, str))
                )
    return ""


def _get_conversation_content(messages: Any) -> str:
    """Convert messages into a formatted conversation string."""
    parts = []
    for msg in messages:
        role = msg.role if hasattr(msg, "role") else msg.get("role") if isinstance(msg, dict) else None
        content = msg.text if hasattr(msg, "text") else msg.content if hasattr(msg, "content") else (
            msg.get("content", "") or msg.get("text", "") if isinstance(msg, dict) else ""
        )
        if not (role and content):
            continue
        display = {"user": "User", "assistant": "Assistant", "system": "System"}.get(
            role, role.capitalize() if isinstance(role, str) else str(role)
        )
        if isinstance(content, list):
            content = " ".join(
                p.get("text", "") if isinstance(p, dict) and p.get("type") == "text" else p
                for p in content
                if isinstance(p, (dict, str))
            )
        if content:
            parts.append(f"{display}: {content}")
    return "\n\n".join(parts)


async def _fetch_memories_text(client: Smaran, user_id: str, session_id: str, query: str, limit: int, logger: Logger) -> str:
    """Recall and format memories from Smaran."""
    hits = await client.recall(query=query, user_id=user_id, session_id=session_id, top_k=limit)
    logger.info("Memory recall completed", {"user_id": user_id, "hit_count": len(hits)})
    return format_memories_to_text(hits)


async def _save_memory(client: Smaran, user_id: str, session_id: str, content: str, logger: Logger) -> None:
    """Save a memory to Smaran."""
    try:
        saved = await client.save(text=content, user_id=user_id, session_id=session_id)
        logger.info("Memory save completed", {"user_id": user_id, "saved": saved})
    except (OSError, ConnectionError) as network_error:
        logger.error("Network error while saving memory", {"error": str(network_error)})
        raise SmaranNetworkError("Failed to save memory due to network error", network_error) from network_error
    except Exception as error:
        logger.error("Error saving memory", {"error": str(error)})
        raise SmaranMemoryOperationError("Failed to save memory", error) from error


class SmaranChatMiddleware(ChatMiddleware):
    """Chat middleware that injects Smaran memories into the system prompt.

    Intercepts chat requests before they reach the LLM, recalls relevant
    memories from Smaran, and injects them into the system prompt. Can
    also save conversations as memories.

    Example:
        ```python
        from agent_framework.openai import OpenAIResponsesClient
        from smaran_agent_framework import (
            AgentSmaran,
            SmaranChatMiddleware,
            SmaranMiddlewareOptions,
        )

        conn = AgentSmaran(api_key="your-key", user_id="user-123")

        middleware = SmaranChatMiddleware(
            conn,
            options=SmaranMiddlewareOptions(verbose=True, save_conversations=True),
        )

        agent = OpenAIResponsesClient().as_agent(
            name="MemoryAgent",
            instructions="You are a helpful assistant with memory.",
            middleware=[middleware],
        )

        response = await agent.run("What's my favorite language?")
        ```
    """

    def __init__(
        self,
        connection: AgentSmaran,
        options: Optional[SmaranMiddlewareOptions] = None,
    ) -> None:
        self._connection = connection
        self._options = options or SmaranMiddlewareOptions()
        self._logger = create_logger(self._options.verbose)
        self._client = connection.client
        self._background_tasks: set[asyncio.Task[None]] = set()

    async def process(self, context: Any, call_next: Callable[[], Awaitable[None]]) -> None:
        """Recall relevant memories, inject them, then optionally save the conversation."""
        messages = context.messages

        if self._options.save_conversations:
            user_message = _get_last_user_message(messages)
            if user_message and user_message.strip():
                content = _get_conversation_content(messages)
                task = asyncio.create_task(
                    _save_memory(
                        self._client,
                        self._connection.user_id,
                        self._connection.session_id,
                        content,
                        self._logger,
                    )
                )
                self._background_tasks.add(task)
                task.add_done_callback(self._background_tasks.discard)

        user_message = _get_last_user_message(messages)
        if not user_message:
            self._logger.debug("No user message found, skipping memory recall")
            await call_next()
            return

        try:
            memories = await _fetch_memories_text(
                self._client,
                self._connection.user_id,
                self._connection.session_id,
                user_message,
                self._options.search_limit,
                self._logger,
            )
        except Exception as e:
            self._logger.error("Failed to recall memories, proceeding without", {"error": str(e)})
            await call_next()
            return

        if memories:
            if self._connection.entity_context:
                memories = f"{self._connection.entity_context}\n\n{memories}"
            _inject_memories(context, memories)

        await call_next()

    async def wait_for_background_tasks(self, timeout: Optional[float] = 10.0) -> None:
        """Wait for all background memory-save tasks to complete."""
        if not self._background_tasks:
            return
        try:
            if timeout is not None:
                await asyncio.wait_for(
                    asyncio.gather(*self._background_tasks, return_exceptions=True), timeout=timeout
                )
            else:
                await asyncio.gather(*self._background_tasks, return_exceptions=True)
        except asyncio.TimeoutError:
            for task in self._background_tasks:
                if not task.done():
                    task.cancel()
            raise


def _inject_memories(context: Any, memories: str) -> None:
    """Inject memories into the chat context messages."""
    messages = context.messages
    memory_text = f"\n\n{wrap_memory_injection(memories)}"

    for msg in messages:
        role = msg.role if hasattr(msg, "role") else msg.get("role") if isinstance(msg, dict) else None
        if role == "system":
            if hasattr(msg, "text"):
                msg.text = (msg.text or "") + memory_text
            elif hasattr(msg, "content"):
                msg.content = (msg.content or "") + memory_text
            elif isinstance(msg, dict):
                msg["content"] = (msg.get("content", "") or "") + memory_text
            return

    try:
        if isinstance(messages, list):
            messages.insert(0, Message("system", [memories]))
    except Exception:
        pass
