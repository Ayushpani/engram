from unittest.mock import AsyncMock, patch

import pytest
from smaran import MemoryHit

from smaran_pipecat import ConfigurationError, SmaranPipecatService
from smaran_pipecat.utils import format_memories_to_text, get_last_user_message


def test_requires_user_id(monkeypatch):
    monkeypatch.setenv("SMARAN_API_KEY", "sk_test")
    monkeypatch.setenv("SMARAN_URL", "https://example.com")
    with pytest.raises(ConfigurationError):
        SmaranPipecatService(user_id="")


def test_get_last_user_message():
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "reply"},
        {"role": "user", "content": "second"},
    ]
    assert get_last_user_message(messages) == "second"


def test_format_memories_to_text_empty():
    assert format_memories_to_text([]) == ""


def test_format_memories_to_text_with_hits():
    hits = [MemoryHit(text="lives in Powai", score=0.9), MemoryHit(text="likes Python", score=0.8)]
    text = format_memories_to_text(hits)
    assert "lives in Powai" in text
    assert "likes Python" in text


@pytest.mark.asyncio
async def test_retrieve_memories_text_calls_smaran_recall(monkeypatch):
    monkeypatch.setenv("SMARAN_API_KEY", "sk_test")
    monkeypatch.setenv("SMARAN_URL", "https://example.com")
    service = SmaranPipecatService(user_id="user-123", session_id="sess-1")

    with patch.object(
        service._client, "recall", AsyncMock(return_value=[MemoryHit(text="likes TypeScript")])
    ) as mock_recall:
        text = await service._retrieve_memories_text("what language do I like?")

    mock_recall.assert_awaited_once_with(
        query="what language do I like?",
        user_id="user-123",
        session_id="sess-1",
        top_k=service.params.search_limit,
    )
    assert "likes TypeScript" in text


@pytest.mark.asyncio
async def test_store_message_calls_smaran_save(monkeypatch):
    monkeypatch.setenv("SMARAN_API_KEY", "sk_test")
    monkeypatch.setenv("SMARAN_URL", "https://example.com")
    service = SmaranPipecatService(user_id="user-123")

    with patch.object(service._client, "save", AsyncMock(return_value=True)) as mock_save:
        await service._store_message("user: hello")

    mock_save.assert_awaited_once_with(text="user: hello", user_id="user-123", session_id=None)


@pytest.mark.asyncio
async def test_store_message_skipped_when_save_memory_disabled(monkeypatch):
    monkeypatch.setenv("SMARAN_API_KEY", "sk_test")
    monkeypatch.setenv("SMARAN_URL", "https://example.com")
    params = SmaranPipecatService.InputParams(save_memory=False)
    service = SmaranPipecatService(user_id="user-123", params=params)

    with patch.object(service._client, "save", AsyncMock()) as mock_save:
        await service._store_message("user: hello")

    mock_save.assert_not_awaited()
