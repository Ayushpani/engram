"""Utility functions for the Smaran Cartesia integration."""

from typing import List

from smaran import MemoryHit


def format_memories_to_text(
    hits: List[MemoryHit],
    system_prompt: str = "Based on previous conversations:\n\n",
) -> str:
    """Format recalled memories into a text block for injection into a system prompt."""
    if not hits:
        return ""
    lines = "\n".join(f"- {hit.text}" for hit in hits)
    return f"{system_prompt}{lines}"
