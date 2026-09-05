"""Smaran tools for Microsoft Agent Framework.

Provides FunctionTool-compatible tools that can be passed to Agent.run(tools=[...]).
"""

import json
from typing import Annotated, Any, TypedDict

from agent_framework import FunctionTool, tool

from .connection import AgentSmaran


class MemorySearchResult(TypedDict, total=False):
    """Result type for memory search operations."""

    success: bool
    results: list[Any] | None
    count: int | None
    error: str | None


class MemoryAddResult(TypedDict, total=False):
    """Result type for memory add operations."""

    success: bool
    saved: bool | None
    error: str | None


class SmaranTools:
    """Memory tools for Microsoft Agent Framework.

    Creates FunctionTool instances that can be passed to Agent.run(tools=[...]).

    Example:
        ```python
        from smaran_agent_framework import AgentSmaran, SmaranTools

        conn = AgentSmaran(api_key="your-key", user_id="user-123")
        tools = SmaranTools(conn)
        agent_tools = tools.get_tools()

        response = await agent.run(
            "What do you remember about me?",
            tools=agent_tools,
        )
        ```
    """

    def __init__(self, connection: AgentSmaran) -> None:
        self._connection = connection
        self._client = connection.client

    async def search_memories(
        self,
        information_to_get: Annotated[str, "Terms to search for in the user's memories"],
        limit: Annotated[int, "Maximum number of results to return"] = 5,
    ) -> str:
        """Search (recall) memories/details/information about the user or other facts or entities. Run when explicitly asked or when context about the user's past choices would be helpful."""
        try:
            hits = await self._client.recall(
                query=information_to_get,
                user_id=self._connection.user_id,
                session_id=self._connection.session_id,
                top_k=limit,
            )
            result: MemorySearchResult = {
                "success": True,
                "results": [{"text": h.text, "score": h.score} for h in hits],
                "count": len(hits),
            }
            return json.dumps(result, default=str)
        except Exception as error:
            return json.dumps({"success": False, "error": str(error)})

    async def add_memory(
        self,
        memory: Annotated[
            str,
            "The text content of the memory to add. Should be a single sentence or short paragraph.",
        ],
    ) -> str:
        """Add (remember) memories/details/information about the user or other facts or entities. Run when explicitly asked or when the user mentions any information generalizable beyond the current conversation."""
        try:
            saved = await self._client.save(
                text=memory,
                user_id=self._connection.user_id,
                session_id=self._connection.session_id,
            )
            result: MemoryAddResult = {"success": True, "saved": saved}
            return json.dumps(result, default=str)
        except Exception as error:
            return json.dumps({"success": False, "error": str(error)})

    def get_tools(self) -> list[FunctionTool]:
        """Get all Smaran tools as FunctionTool instances.

        Returns:
            List of FunctionTool instances ready to pass to Agent.run(tools=...)
        """
        return [
            tool(
                name="search_memories",
                description=(
                    "Search (recall) memories/details/information about the user or other "
                    "facts or entities. Run when explicitly asked or when context about "
                    "the user's past choices would be helpful."
                ),
            )(self.search_memories),
            tool(
                name="add_memory",
                description=(
                    "Add (remember) memories/details/information about the user or other "
                    "facts or entities. Run when explicitly asked or when the user mentions "
                    "any information generalizable beyond the current conversation."
                ),
            )(self.add_memory),
        ]
