"""Tests for utility functions."""

from smaran import MemoryHit

from smaran_cartesia.utils import format_memories_to_text


def test_format_memories_to_text_empty():
    assert format_memories_to_text([]) == ""


def test_format_memories_to_text_with_hits():
    hits = [MemoryHit(text="lives in Powai"), MemoryHit(text="likes labradors")]
    text = format_memories_to_text(hits)
    assert "lives in Powai" in text
    assert "likes labradors" in text
