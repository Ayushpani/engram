"""Utility functions for the Smaran OpenAI integration."""

import json
from typing import Any, Optional, Protocol

from openai.types.chat import ChatCompletionMessageParam

from smaran import MemoryHit


class Logger(Protocol):
    """Logger protocol for type safety."""

    def debug(self, message: str, data: Optional[dict[str, Any]] = None) -> None: ...
    def info(self, message: str, data: Optional[dict[str, Any]] = None) -> None: ...
    def warn(self, message: str, data: Optional[dict[str, Any]] = None) -> None: ...
    def error(self, message: str, data: Optional[dict[str, Any]] = None) -> None: ...


class SimpleLogger:
    """Simple logger implementation."""

    def __init__(self, verbose: bool = False):
        self.verbose: bool = verbose

    def _log(self, level: str, message: str, data: Optional[dict[str, Any]] = None) -> None:
        if not self.verbose:
            return
        log_message = f"[smaran] {message}"
        if data:
            log_message += f" {json.dumps(data, indent=2)}"
        if level == "error":
            print(f"ERROR: {log_message}", flush=True)
        elif level == "warn":
            print(f"WARN: {log_message}", flush=True)
        else:
            print(log_message, flush=True)

    def debug(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        self._log("debug", message, data)

    def info(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        self._log("info", message, data)

    def warn(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        self._log("warn", message, data)

    def error(self, message: str, data: Optional[dict[str, Any]] = None) -> None:
        self._log("error", message, data)


def create_logger(verbose: bool) -> Logger:
    """Create a logger instance."""
    return SimpleLogger(verbose)


def get_last_user_message(messages: list[ChatCompletionMessageParam]) -> str:
    """Extract the last user message's text content from a messages array."""
    for message in reversed(messages):
        if message.get("role") == "user":
            content = message.get("content", "")
            if isinstance(content, str):
                return content
            elif isinstance(content, list):
                text_parts = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text_parts.append(part.get("text", ""))
                    elif isinstance(part, str):
                        text_parts.append(part)
                return " ".join(text_parts)
    return ""


def get_conversation_content(messages: list[ChatCompletionMessageParam]) -> str:
    """Convert a messages array into a formatted "Role: content" transcript string."""
    conversation_parts = []

    for message in messages:
        role = message.get("role", "")
        content = message.get("content", "")

        role_display = {"user": "User", "assistant": "Assistant", "system": "System"}.get(
            role, role.capitalize() if isinstance(role, str) else str(role)
        )

        if isinstance(content, str):
            content_text = content
        elif isinstance(content, list):
            text_parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
                elif isinstance(part, str):
                    text_parts.append(part)
            content_text = " ".join(text_parts)
        else:
            content_text = str(content)

        if content_text:
            conversation_parts.append(f"{role_display}: {content_text}")

    return "\n\n".join(conversation_parts)


def format_memories_to_text(
    hits: list[MemoryHit],
    system_prompt: str = "Based on previous conversations, I recall:\n\n",
) -> str:
    """Format recalled memories into a text block for injection into a system prompt."""
    if not hits:
        return ""
    lines = "\n".join(f"- {hit.text}" for hit in hits)
    return f"{system_prompt}{lines}"
