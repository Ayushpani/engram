"""Utility functions for the Smaran Pipecat integration."""

from typing import Dict, List

from smaran import MemoryHit


def get_last_user_message(messages: List[Dict[str, str]]) -> str | None:
    """Extract the last user message content from a list of messages."""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return msg.get("content")
    return None


def format_memories_to_text(
    hits: List[MemoryHit],
    system_prompt: str = "Based on previous conversations, I recall:\n\n",
) -> str:
    """Format recalled memories into a text block for injection into an LLM prompt."""
    if not hits:
        return ""
    lines = "\n".join(f"- {hit.text}" for hit in hits)
    return f"{system_prompt}{lines}"
