"""Exceptions for the Smaran Cartesia integration."""

from typing import Optional


class SmaranCartesiaError(Exception):
    """Base exception for all Smaran Cartesia errors."""

    def __init__(self, message: str, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.message = message
        self.original_error = original_error

    def __str__(self) -> str:
        if self.original_error:
            return f"{self.message}: {self.original_error}"
        return self.message


class ConfigurationError(SmaranCartesiaError):
    """Raised when there are configuration issues (e.g., missing API key)."""


class MemoryRetrievalError(SmaranCartesiaError):
    """Raised when memory recall fails."""


class MemoryStorageError(SmaranCartesiaError):
    """Raised when memory save fails."""
