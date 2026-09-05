"""Tests for utility functions."""

import pytest
from smaran import MemoryHit

from smaran_agent_framework.utils import (
    SimpleLogger,
    create_logger,
    format_memories_to_text,
    wrap_memory_injection,
)


class TestFormatMemoriesToText:
    def test_empty_hits(self) -> None:
        assert format_memories_to_text([]) == ""

    def test_formats_hits_as_bullets(self) -> None:
        hits = [MemoryHit(text="Likes Python"), MemoryHit(text="Lives in SF")]
        result = format_memories_to_text(hits)
        assert "- Likes Python" in result
        assert "- Lives in SF" in result


class TestWrapMemoryInjection:
    def test_wraps_in_smaran_tags(self) -> None:
        result = wrap_memory_injection("some memory text")
        assert result.startswith('<smaran context="user-memories" readonly>')
        assert result.endswith("</smaran>")
        assert "some memory text" in result

    def test_uses_custom_context_prompt(self) -> None:
        result = wrap_memory_injection("memory", context_prompt="Custom prompt")
        assert "Custom prompt" in result


class TestLogger:
    def test_verbose_logger(self, capsys: pytest.CaptureFixture[str]) -> None:
        logger = SimpleLogger(verbose=True)
        logger.info("test message")
        captured = capsys.readouterr()
        assert "[smaran] test message" in captured.out

    def test_silent_logger(self, capsys: pytest.CaptureFixture[str]) -> None:
        logger = SimpleLogger(verbose=False)
        logger.info("test message")
        captured = capsys.readouterr()
        assert captured.out == ""

    def test_error_prefix(self, capsys: pytest.CaptureFixture[str]) -> None:
        logger = SimpleLogger(verbose=True)
        logger.error("something failed")
        captured = capsys.readouterr()
        assert "ERROR:" in captured.out

    def test_create_logger(self) -> None:
        logger = create_logger(True)
        assert isinstance(logger, SimpleLogger)
