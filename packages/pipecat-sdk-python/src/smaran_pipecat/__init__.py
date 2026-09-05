"""Smaran Pipecat SDK — memory-enhanced conversational AI pipelines.

Integrates Smaran's cross-session memory into Pipecat pipelines: recalls
relevant memories before each LLM call and saves new memories after.

Example:
    ```python
    from smaran_pipecat import SmaranPipecatService

    memory = SmaranPipecatService(
        api_key=os.getenv("SMARAN_API_KEY"),
        user_id="user-123",
    )

    pipeline = Pipeline([
        transport.input(),
        stt,
        user_context,
        memory,  # Recalls and injects relevant memories automatically
        llm,
        transport.output(),
    ])
    ```
"""

from .exceptions import ConfigurationError, MemoryRetrievalError, MemoryStorageError, SmaranPipecatError
from .service import SmaranPipecatService
from .utils import format_memories_to_text, get_last_user_message

__version__ = "0.1.0"

__all__ = [
    "SmaranPipecatService",
    "SmaranPipecatError",
    "ConfigurationError",
    "MemoryRetrievalError",
    "MemoryStorageError",
    "get_last_user_message",
    "format_memories_to_text",
]
