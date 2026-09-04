"""
Unit tests for the Smaran memory hook (Assistant.on_user_turn_completed).

Unlike test_agent.py (which drives the full LLM pipeline via
AgentSession.run), these mock the smaran_recall/smaran_save HTTP calls
directly so they run fast, offline, and pin down the exact behavior we
debugged into place: recall happens before generation and gets injected as
a system message, save happens after, and SMARAN_ENABLED=false disables
both without touching anything else.
"""

from unittest.mock import AsyncMock, patch

import pytest
from livekit.agents import ChatContext, ChatMessage

import agent as agent_module
from agent import Assistant


def _user_message(text: str) -> ChatMessage:
    return ChatMessage(role="user", content=[text])


@pytest.mark.asyncio
async def test_recalled_memories_are_injected_as_system_message():
    assistant = Assistant(session_id="user-123")
    turn_ctx = ChatContext()

    with (
        patch.object(agent_module, "SMARAN_ENABLED", True),
        patch.object(
            agent_module, "smaran_recall", AsyncMock(return_value=["lives in Powai"])
        ) as mock_recall,
        patch.object(agent_module, "smaran_save", AsyncMock()) as mock_save,
    ):
        await assistant.on_user_turn_completed(
            turn_ctx, _user_message("what is my address?")
        )

    mock_recall.assert_awaited_once_with("user-123", "what is my address?")
    mock_save.assert_awaited_once_with("user-123", "what is my address?")

    system_messages = [
        m for m in turn_ctx.items if getattr(m, "role", None) == "system"
    ]
    assert len(system_messages) == 1
    assert "lives in Powai" in system_messages[0].text_content


@pytest.mark.asyncio
async def test_no_hits_means_no_injection():
    assistant = Assistant(session_id="user-123")
    turn_ctx = ChatContext()

    with (
        patch.object(agent_module, "SMARAN_ENABLED", True),
        patch.object(agent_module, "smaran_recall", AsyncMock(return_value=[])),
        patch.object(agent_module, "smaran_save", AsyncMock()) as mock_save,
    ):
        await assistant.on_user_turn_completed(turn_ctx, _user_message("hello"))

    mock_save.assert_awaited_once()
    assert turn_ctx.items == []


@pytest.mark.asyncio
async def test_smaran_disabled_skips_recall_and_save():
    assistant = Assistant(session_id="user-123")
    turn_ctx = ChatContext()

    with (
        patch.object(agent_module, "SMARAN_ENABLED", False),
        patch.object(agent_module, "smaran_recall", AsyncMock()) as mock_recall,
        patch.object(agent_module, "smaran_save", AsyncMock()) as mock_save,
    ):
        await assistant.on_user_turn_completed(turn_ctx, _user_message("hello"))

    mock_recall.assert_not_awaited()
    mock_save.assert_not_awaited()
    assert turn_ctx.items == []


@pytest.mark.asyncio
async def test_recall_response_shape_is_parsed_correctly():
    """Regression test: the API nests text at hit["memory"]["text"], not
    hit["text"]. A field-path mismatch here silently makes recall look empty
    even when the backend returns real hits — this bit us in production."""
    fake_response = AsyncMock()
    fake_response.status_code = 200
    fake_response.json = lambda: {
        "hits": [
            {"memory": {"text": "favorite language is TypeScript"}, "score": 0.9},
            {"memory": {"text": ""}, "score": 0.1},  # empty text must be filtered
        ]
    }

    with (
        patch.object(agent_module, "SMARAN_URL", "https://smaran.example"),
        patch("httpx.AsyncClient.post", AsyncMock(return_value=fake_response)),
    ):
        hits = await agent_module.smaran_recall("user-123", "what language do I like?")

    assert hits == ["favorite language is TypeScript"]
