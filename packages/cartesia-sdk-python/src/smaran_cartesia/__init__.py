"""Smaran Cartesia SDK — memory-enhanced voice agents with Cartesia Line.

Example:
    ```python
    from smaran_cartesia import SmaranCartesiaAgent
    from line.llm_agent import LlmAgent, LlmConfig

    base_agent = LlmAgent(
        model="gemini/gemini-2.5-flash-preview-09-2025",
        config=LlmConfig(
            system_prompt="You are a helpful assistant.",
            introduction="Hello!"
        )
    )

    memory_agent = SmaranCartesiaAgent(
        agent=base_agent,
        api_key=os.getenv("SMARAN_API_KEY"),
        user_id="user-123",
        session_id="call-456",
    )
    ```
"""

from .agent import SmaranCartesiaAgent

MemoryConfig = SmaranCartesiaAgent.MemoryConfig

from .exceptions import (
    ConfigurationError,
    MemoryRetrievalError,
    MemoryStorageError,
    SmaranCartesiaError,
)
from .utils import format_memories_to_text

__version__ = "0.1.0"

__all__ = [
    "SmaranCartesiaAgent",
    "MemoryConfig",
    "SmaranCartesiaError",
    "ConfigurationError",
    "MemoryRetrievalError",
    "MemoryStorageError",
    "format_memories_to_text",
]
