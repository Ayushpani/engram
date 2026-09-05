"""Smaran context provider for Microsoft Agent Framework.

A BaseContextProvider subclass that recalls relevant memories before LLM
invocation and optionally saves the conversation after — the idiomatic way
to add persistent memory to Agent Framework agents.
"""

from typing import Any, Optional

from agent_framework import ContextProvider

from .connection import AgentSmaran
from .utils import create_logger, format_memories_to_text


class SmaranContextProvider(ContextProvider):
    """Context provider that integrates Smaran into the agent pipeline.

    Recalls relevant memories before the model is invoked and optionally
    stores the conversation after the model responds.

    Example:
        ```python
        from agent_framework import Agent, AgentSession
        from agent_framework.openai import OpenAIResponsesClient
        from smaran_agent_framework import AgentSmaran, SmaranContextProvider

        conn = AgentSmaran(api_key="your-key", user_id="user-123")

        provider = SmaranContextProvider(conn, store_conversations=True)

        agent = OpenAIResponsesClient().as_agent(
            name="MemoryAgent",
            instructions="You are a helpful assistant with memory.",
            context_providers=[provider],
        )

        session = AgentSession()
        response = await agent.run(
            "What's my favorite programming language?",
            session=session,
        )
        ```
    """

    def __init__(
        self,
        connection: AgentSmaran,
        *,
        search_limit: int = 5,
        store_conversations: bool = False,
        context_prompt: str = "",
        verbose: bool = False,
        source_id: str = "smaran",
    ) -> None:
        """Initialize the Smaran context provider.

        Args:
            connection: Shared AgentSmaran connection.
            search_limit: Maximum memories to recall per turn.
            store_conversations: Whether to save conversations after each run.
            context_prompt: Header text prepended to memory content.
            verbose: Enable detailed logging.
            source_id: Unique identifier for this provider instance.
        """
        super().__init__(source_id=source_id)

        self._connection = connection
        self._search_limit = search_limit
        self._store_conversations = store_conversations
        self._context_prompt = context_prompt
        self._logger = create_logger(verbose)
        self._client = connection.client

    async def before_run(
        self, *, agent: Any, session: Any, context: Any, state: dict[str, Any]
    ) -> None:
        """Recall relevant memories from Smaran and inject them into the context."""
        query_text = self._extract_query_from_context(context)
        if not query_text:
            self._logger.debug("No user message found, skipping memory recall")
            return

        self._logger.info(
            "Recalling memories from Smaran",
            {"user_id": self._connection.user_id, "query_preview": query_text[:100]},
        )

        try:
            hits = await self._client.recall(
                query=query_text,
                user_id=self._connection.user_id,
                session_id=self._connection.session_id,
                top_k=self._search_limit,
            )
        except Exception as e:
            self._logger.error("Failed to recall memories, proceeding without", {"error": str(e)})
            return

        memories_text = format_memories_to_text(hits)
        if not memories_text:
            self._logger.debug("No memories found")
            return

        if self._connection.entity_context:
            memories_text = f"{self._connection.entity_context}\n\n{memories_text}"

        full_text = f"{self._context_prompt}\n{memories_text}".strip() if self._context_prompt else memories_text

        if hasattr(context, "extend_instructions"):
            context.extend_instructions(full_text, source=self.source_id)
        elif hasattr(context, "extend_messages"):
            context.extend_messages([{"role": "system", "content": full_text}], source=self.source_id)

    async def after_run(
        self, *, agent: Any, session: Any, context: Any, state: dict[str, Any]
    ) -> None:
        """Save the conversation to Smaran for future recall."""
        if not self._store_conversations:
            return

        conversation_text = self._extract_conversation_from_context(context)
        if not conversation_text:
            self._logger.debug("No conversation content to store")
            return

        try:
            self._logger.info(
                "Saving conversation to Smaran",
                {"user_id": self._connection.user_id, "content_length": len(conversation_text)},
            )
            await self._client.save(
                text=conversation_text,
                user_id=self._connection.user_id,
                session_id=self._connection.session_id,
            )
        except Exception as e:
            self._logger.error("Failed to save conversation", {"error": str(e)})

    def _extract_query_from_context(self, context: Any) -> str:
        """Extract the last user message from the session context."""
        messages: Optional[Any] = None
        if hasattr(context, "input_messages"):
            messages = context.input_messages
        elif hasattr(context, "messages"):
            messages = context.messages

        if not messages:
            return ""

        for msg in reversed(list(messages)):
            role = msg.role if hasattr(msg, "role") else msg.get("role") if isinstance(msg, dict) else None
            if role != "user":
                continue

            content = None
            if hasattr(msg, "text"):
                content = msg.text
            elif hasattr(msg, "content"):
                content = msg.content
            elif isinstance(msg, dict):
                content = msg.get("content", "") or msg.get("text", "")

            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        parts.append(part.get("text", ""))
                    elif isinstance(part, str):
                        parts.append(part)
                return " ".join(parts)
        return ""

    def _extract_conversation_from_context(self, context: Any) -> str:
        """Extract conversation text from context for storage."""
        messages: list[Any] = []

        if hasattr(context, "input_messages"):
            messages.extend(context.input_messages or [])
        elif hasattr(context, "messages"):
            messages.extend(context.messages or [])

        if hasattr(context, "response") and context.response:
            resp = context.response
            if hasattr(resp, "text") and resp.text:
                messages.append({"role": "assistant", "content": resp.text})
            elif hasattr(resp, "messages"):
                messages.extend(resp.messages or [])

        if not messages:
            return ""

        parts = []
        for msg in messages:
            role = msg.role if hasattr(msg, "role") else msg.get("role") if isinstance(msg, dict) else None
            if role not in ("user", "assistant", "system"):
                continue

            content = None
            if hasattr(msg, "text"):
                content = msg.text
            elif hasattr(msg, "content"):
                content = msg.content
            elif isinstance(msg, dict):
                content = msg.get("content", "") or msg.get("text", "")

            if isinstance(content, str) and content.strip():
                display = {"user": "User", "assistant": "Assistant", "system": "System"}.get(role, str(role))
                parts.append(f"{display}: {content}")

        return "\n\n".join(parts)
