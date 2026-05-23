"""Engram Cartesia SDK - Memory-enhanced voice agents with Cartesia Line.

This package provides seamless integration between Engram and Cartesia Line,
enabling persistent memory and context enhancement for voice AI applications.

Example:
    ```python
    from engram_cartesia import EngramCartesiaAgent, MemoryConfig
    from line.llm_agent import LlmAgent, LlmConfig

    # Create base LLM agent
    base_agent = LlmAgent(
        model="gemini/gemini-2.5-flash-preview-09-2025",
        config=LlmConfig(
            system_prompt="You are a helpful assistant.",
            introduction="Hello!"
        )
    )

    # Wrap with Engram
    memory_agent = EngramCartesiaAgent(
        agent=base_agent,
        api_key=os.getenv("ENGRAM_API_KEY"),
        container_tag="user-123",
    )
    ```
"""

from .agent import EngramCartesiaAgent

# Export MemoryConfig as a top-level class for convenience
MemoryConfig = EngramCartesiaAgent.MemoryConfig

from .exceptions import (
    APIError,
    ConfigurationError,
    MemoryRetrievalError,
    MemoryStorageError,
    NetworkError,
    EngramCartesiaError,
)
from .utils import (
    deduplicate_memories,
    format_memories_to_text,
    format_relative_time,
    get_last_user_message,
)

__version__ = "0.1.0"

__all__ = [
    # Main agent
    "EngramCartesiaAgent",
    "MemoryConfig",
    # Exceptions
    "EngramCartesiaError",
    "ConfigurationError",
    "MemoryRetrievalError",
    "MemoryStorageError",
    "APIError",
    "NetworkError",
    # Utilities
    "get_last_user_message",
    "deduplicate_memories",
    "format_memories_to_text",
    "format_relative_time",
]
