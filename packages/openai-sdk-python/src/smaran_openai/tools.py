"""Smaran tools for OpenAI function calling."""

import json
from typing import Dict, List, Optional, TypedDict

from openai.types.chat import (
    ChatCompletionFunctionToolParam,
    ChatCompletionMessageToolCall,
    ChatCompletionToolMessageParam,
    ChatCompletionToolParam,
)

from smaran import Smaran


class SmaranToolsConfig(TypedDict, total=False):
    """Configuration for Smaran tools."""

    base_url: Optional[str]
    user_id: str
    session_id: Optional[str]


class MemorySearchResult(TypedDict, total=False):
    """Result type for memory search operations."""

    success: bool
    results: Optional[List[Dict[str, object]]]
    count: Optional[int]
    error: Optional[str]


class MemoryAddResult(TypedDict, total=False):
    """Result type for memory add operations."""

    success: bool
    saved: Optional[bool]
    error: Optional[str]


MEMORY_TOOL_SCHEMAS: Dict[str, ChatCompletionFunctionToolParam] = {
    "search_memories": {
        "name": "search_memories",
        "description": (
            "Search (recall) memories/details/information about the user or other facts "
            "or entities. Run when explicitly asked or when context about the user's past "
            "choices would be helpful."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "information_to_get": {
                    "type": "string",
                    "description": "Terms to search for in the user's memories",
                },
                "limit": {
                    "type": "number",
                    "description": "Maximum number of results to return",
                    "default": 5,
                },
            },
            "required": ["information_to_get"],
        },
    },
    "add_memory": {
        "name": "add_memory",
        "description": (
            "Add (remember) memories/details/information about the user or other facts or "
            "entities. Run when explicitly asked or when the user mentions any information "
            "generalizable beyond the context of the current conversation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "memory": {
                    "type": "string",
                    "description": (
                        "The text content of the memory to add. This should be a single "
                        "sentence or a short paragraph."
                    ),
                },
            },
            "required": ["memory"],
        },
    },
}


class SmaranTools:
    """Create memory tool handlers for OpenAI function calling."""

    def __init__(self, api_key: str, config: Optional[SmaranToolsConfig] = None):
        """Initialize SmaranTools.

        Args:
            api_key: Smaran API key.
            config: Required ``user_id`` plus optional ``session_id``/``base_url``.
        """
        config = config or {}

        self.client = Smaran(api_key=api_key, base_url=config.get("base_url"))
        self.user_id = config.get("user_id") or "default"
        self.session_id = config.get("session_id")

    def get_tool_definitions(self) -> List[ChatCompletionFunctionToolParam]:
        """Get OpenAI function definitions for all memory tools."""
        return [
            {"type": "function", "function": MEMORY_TOOL_SCHEMAS["search_memories"]},
            {"type": "function", "function": MEMORY_TOOL_SCHEMAS["add_memory"]},
        ]

    async def execute_tool_call(self, tool_call: ChatCompletionMessageToolCall) -> str:
        """Execute a tool call based on the function name and arguments."""
        function_name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        if function_name == "search_memories":
            result = await self.search_memories(**args)
        elif function_name == "add_memory":
            result = await self.add_memory(**args)
        else:
            result = {"success": False, "error": f"Unknown function: {function_name}"}

        return json.dumps(result)

    async def search_memories(
        self,
        information_to_get: str,
        limit: int = 5,
    ) -> MemorySearchResult:
        """Search memories relevant to ``information_to_get``."""
        try:
            hits = await self.client.recall(
                query=information_to_get,
                user_id=self.user_id,
                session_id=self.session_id,
                top_k=limit,
            )
            return MemorySearchResult(
                success=True,
                results=[{"text": h.text, "score": h.score} for h in hits],
                count=len(hits),
            )
        except Exception as error:
            return MemorySearchResult(success=False, error=f"Memory search failed: {error}")

    async def add_memory(self, memory: str) -> MemoryAddResult:
        """Add a memory."""
        try:
            saved = await self.client.save(
                text=memory, user_id=self.user_id, session_id=self.session_id
            )
            return MemoryAddResult(success=True, saved=saved)
        except Exception as error:
            return MemoryAddResult(success=False, error=f"Memory add failed: {error}")


def create_smaran_tools(api_key: str, config: Optional[SmaranToolsConfig] = None) -> SmaranTools:
    """Helper function to create a SmaranTools instance."""
    return SmaranTools(api_key, config)


def get_memory_tool_definitions() -> List[ChatCompletionFunctionToolParam]:
    """Get OpenAI function definitions for memory tools."""
    return [
        {"type": "function", "function": MEMORY_TOOL_SCHEMAS["search_memories"]},
        {"type": "function", "function": MEMORY_TOOL_SCHEMAS["add_memory"]},
    ]


async def execute_memory_tool_calls(
    api_key: str,
    tool_calls: List[ChatCompletionMessageToolCall],
    config: Optional[SmaranToolsConfig] = None,
) -> List[ChatCompletionToolMessageParam]:
    """Execute tool calls from OpenAI function calling."""
    import asyncio

    tools = SmaranTools(api_key, config)

    async def execute_single_call(
        tool_call: ChatCompletionMessageToolCall,
    ) -> ChatCompletionToolMessageParam:
        result = await tools.execute_tool_call(tool_call)
        return ChatCompletionToolMessageParam(tool_call_id=tool_call.id, role="tool", content=result)

    return await asyncio.gather(*[execute_single_call(tc) for tc in tool_calls])


class SearchMemoriesTool:
    """Individual search memories tool."""

    def __init__(self, api_key: str, config: Optional[SmaranToolsConfig] = None):
        self.tools = SmaranTools(api_key, config)
        self.definition: ChatCompletionToolParam = {
            "type": "function",
            "function": MEMORY_TOOL_SCHEMAS["search_memories"],
        }

    async def execute(self, information_to_get: str, limit: int = 5) -> MemorySearchResult:
        return await self.tools.search_memories(information_to_get=information_to_get, limit=limit)


class AddMemoryTool:
    """Individual add memory tool."""

    def __init__(self, api_key: str, config: Optional[SmaranToolsConfig] = None):
        self.tools = SmaranTools(api_key, config)
        self.definition: ChatCompletionToolParam = {
            "type": "function",
            "function": MEMORY_TOOL_SCHEMAS["add_memory"],
        }

    async def execute(self, memory: str) -> MemoryAddResult:
        return await self.tools.add_memory(memory=memory)


def create_search_memories_tool(
    api_key: str, config: Optional[SmaranToolsConfig] = None
) -> SearchMemoriesTool:
    """Create an individual search memories tool."""
    return SearchMemoriesTool(api_key, config)


def create_add_memory_tool(api_key: str, config: Optional[SmaranToolsConfig] = None) -> AddMemoryTool:
    """Create an individual add memory tool."""
    return AddMemoryTool(api_key, config)
