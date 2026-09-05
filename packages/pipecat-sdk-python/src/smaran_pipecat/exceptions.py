"""Exceptions for the Smaran Pipecat integration."""

from typing import Optional


class SmaranPipecatError(Exception):
    """Base exception for all Smaran Pipecat errors."""

    def __init__(self, message: str, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.message = message
        self.original_error = original_error

    def __str__(self) -> str:
        if self.original_error:
            return f"{self.message}: {self.original_error}"
        return self.message


class ConfigurationError(SmaranPipecatError):
    """Raised when there are configuration issues (e.g., missing API key)."""


class MemoryRetrievalError(SmaranPipecatError):
    """Raised when memory recall fails."""


class MemoryStorageError(SmaranPipecatError):
    """Raised when memory save fails."""
