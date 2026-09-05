"""Exceptions raised by the Smaran Python client."""

from typing import Optional


class SmaranError(Exception):
    """Base exception for all Smaran client errors."""

    def __init__(self, message: str, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.message = message
        self.original_error = original_error

    def __str__(self) -> str:
        if self.original_error:
            return f"{self.message}: {self.original_error}"
        return self.message


class SmaranConfigurationError(SmaranError):
    """Raised when the client is missing required configuration (API key, base URL)."""


class SmaranAPIError(SmaranError):
    """Raised when the Smaran API returns an error response."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response_text: Optional[str] = None,
        original_error: Optional[Exception] = None,
    ):
        super().__init__(message, original_error)
        self.status_code = status_code
        self.response_text = response_text

    def __str__(self) -> str:
        parts = [self.message]
        if self.status_code:
            parts.append(f"status={self.status_code}")
        if self.response_text:
            parts.append(f"response={self.response_text[:300]}")
        if self.original_error:
            parts.append(f"cause={self.original_error}")
        return " | ".join(parts)


class SmaranNetworkError(SmaranError):
    """Raised when a request to the Smaran API fails at the network level."""
