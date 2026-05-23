"""Engram Agent Framework - Memory tools and middleware for Microsoft Agent Framework."""

from .connection import (
    AgentEngram,
)

from .tools import (
    EngramTools,
    MemorySearchResult,
    MemoryAddResult,
    ProfileResult,
)

from .middleware import (
    EngramChatMiddleware,
    EngramMiddlewareOptions,
)

from .context_provider import (
    EngramContextProvider,
)

from .utils import (
    Logger,
    create_logger,
    deduplicate_memories,
    DeduplicatedMemories,
    convert_profile_to_markdown,
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
    "AgentEngram",
    "EngramTools",
    "MemorySearchResult",
    "MemoryAddResult",
    "ProfileResult",
    "EngramChatMiddleware",
    "EngramMiddlewareOptions",
    "EngramContextProvider",
    "Logger",
    "create_logger",
    "deduplicate_memories",
    "DeduplicatedMemories",
    "convert_profile_to_markdown",
    "EngramError",
    "EngramConfigurationError",
    "EngramAPIError",
    "EngramMemoryOperationError",
    "EngramTimeoutError",
    "EngramNetworkError",
]