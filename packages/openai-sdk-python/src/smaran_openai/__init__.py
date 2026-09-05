"""Smaran OpenAI SDK - Memory tools and middleware for OpenAI function calling."""

from .exceptions import (
    SmaranAPIError,
    SmaranConfigurationError,
    SmaranError,
    SmaranMemoryOperationError,
    SmaranNetworkError,
)
from .middleware import OpenAIMiddlewareOptions, SmaranOpenAIWrapper, with_smaran
from .tools import (
    MEMORY_TOOL_SCHEMAS,
    AddMemoryTool,
    MemoryAddResult,
    MemorySearchResult,
    SearchMemoriesTool,
    SmaranTools,
    SmaranToolsConfig,
    create_add_memory_tool,
    create_search_memories_tool,
    create_smaran_tools,
    execute_memory_tool_calls,
    get_memory_tool_definitions,
)
from .utils import (
    Logger,
    create_logger,
    format_memories_to_text,
    get_conversation_content,
    get_last_user_message,
)

__version__ = "0.1.0"

__all__ = [
    # Tools
    "SmaranTools",
    "SmaranToolsConfig",
    "MemorySearchResult",
    "MemoryAddResult",
    "SearchMemoriesTool",
    "AddMemoryTool",
    "MEMORY_TOOL_SCHEMAS",
    "create_smaran_tools",
    "get_memory_tool_definitions",
    "execute_memory_tool_calls",
    "create_search_memories_tool",
    "create_add_memory_tool",
    # Middleware
    "with_smaran",
    "OpenAIMiddlewareOptions",
    "SmaranOpenAIWrapper",
    # Utils
    "Logger",
    "create_logger",
    "get_last_user_message",
    "get_conversation_content",
    "format_memories_to_text",
    # Exceptions
    "SmaranError",
    "SmaranConfigurationError",
    "SmaranAPIError",
    "SmaranMemoryOperationError",
    "SmaranNetworkError",
]
