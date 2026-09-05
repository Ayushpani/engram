"""Smaran Agent Framework - Memory tools and middleware for Microsoft Agent Framework."""

from .connection import AgentSmaran
from .context_provider import SmaranContextProvider
from .exceptions import (
    SmaranAPIError,
    SmaranConfigurationError,
    SmaranError,
    SmaranMemoryOperationError,
    SmaranNetworkError,
    SmaranTimeoutError,
)
from .middleware import SmaranChatMiddleware, SmaranMiddlewareOptions
from .tools import MemoryAddResult, MemorySearchResult, SmaranTools
from .utils import Logger, create_logger, format_memories_to_text

__all__ = [
    "AgentSmaran",
    "SmaranTools",
    "MemorySearchResult",
    "MemoryAddResult",
    "SmaranChatMiddleware",
    "SmaranMiddlewareOptions",
    "SmaranContextProvider",
    "Logger",
    "create_logger",
    "format_memories_to_text",
    "SmaranError",
    "SmaranConfigurationError",
    "SmaranAPIError",
    "SmaranMemoryOperationError",
    "SmaranTimeoutError",
    "SmaranNetworkError",
]
