"""Engram Pipecat SDK - Memory-enhanced conversational AI pipelines.

This package provides seamless integration between Engram and Pipecat,
enabling persistent memory and context enhancement for voice AI applications.

Example:
    ```python
    from engram_pipecat import EngramPipecatService

    # Create memory service
    memory = EngramPipecatService(
        api_key=os.getenv("ENGRAM_API_KEY"),
        user_id="user-123",
    )

    # Add to Pipecat pipeline
    pipeline = Pipeline([
        transport.input(),
        stt,
        user_context,
        memory,  # Automatically retrieves and injects memories
        llm,
        transport.output(),
    ])
    ```
"""

from .exceptions import (
    APIError,
    ConfigurationError,
    MemoryRetrievalError,
    MemoryStorageError,
    NetworkError,
    EngramPipecatError,
)
from .service import EngramPipecatService
from .utils import (
    deduplicate_memories,
    format_memories_to_text,
    get_last_user_message,
)

__version__ = "0.1.1"

__all__ = [
    # Main service
    "EngramPipecatService",
    # Exceptions
    "EngramPipecatError",
    "ConfigurationError",
    "MemoryRetrievalError",
    "MemoryStorageError",
    "APIError",
    "NetworkError",
    # Utilities
    "get_last_user_message",
    "deduplicate_memories",
    "format_memories_to_text",
]
