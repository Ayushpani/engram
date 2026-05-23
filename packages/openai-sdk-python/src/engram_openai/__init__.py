"""Engram OpenAI SDK - Memory tools and middleware for OpenAI function calling."""

from .tools import (
    EngramTools,
    EngramToolsConfig,
    MemoryObject,
    MemorySearchResult,
    MemoryAddResult,
    SearchMemoriesTool,
    AddMemoryTool,
    MEMORY_TOOL_SCHEMAS,
    create_engram_tools,
    get_memory_tool_definitions,
    execute_memory_tool_calls,
    create_search_memories_tool,
    create_add_memory_tool,
)

from .middleware import (
    with_engram,
    OpenAIMiddlewareOptions,
    EngramOpenAIWrapper,
)

from .utils import (
    Logger,
    create_logger,
    get_last_user_message,
    get_conversation_content,
    convert_profile_to_markdown,
    deduplicate_memories,
    DeduplicatedMemories,
)

from .exceptions import (
    EngramError,
    EngramConfigurationError,
    EngramAPIError,
    EngramMemoryOperationError,
    EngramTimeoutError,
    EngramNetworkError,
)

__all__ = [
    # Tools
    "EngramTools",
    "EngramToolsConfig",
    "MemoryObject",
    "MemorySearchResult",
    "MemoryAddResult",
    "SearchMemoriesTool",
    "AddMemoryTool",
    "MEMORY_TOOL_SCHEMAS",
    "create_engram_tools",
    "get_memory_tool_definitions",
    "execute_memory_tool_calls",
    "create_search_memories_tool",
    "create_add_memory_tool",
    # Middleware
    "with_engram",
    "OpenAIMiddlewareOptions",
    "EngramOpenAIWrapper",
    # Utils
    "Logger",
    "create_logger",
    "get_last_user_message",
    "get_conversation_content",
    "convert_profile_to_markdown",
    "deduplicate_memories",
    "DeduplicatedMemories",
    # Exceptions
    "EngramError",
    "EngramConfigurationError",
    "EngramAPIError",
    "EngramMemoryOperationError",
    "EngramTimeoutError",
    "EngramNetworkError",
]
