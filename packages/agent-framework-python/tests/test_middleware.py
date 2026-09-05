"""Tests for SmaranChatMiddleware."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from smaran import MemoryHit

from smaran_agent_framework import AgentSmaran, SmaranChatMiddleware, SmaranMiddlewareOptions


@pytest.fixture
def connection() -> AgentSmaran:
    return AgentSmaran(api_key="test-key", base_url="https://example.com", user_id="user-123")


def _context_with_messages(messages: list[dict]) -> SimpleNamespace:
    return SimpleNamespace(messages=messages)


class TestSmaranChatMiddleware:
    @pytest.mark.asyncio
    async def test_process_injects_memories_into_system_message(
        self, connection: AgentSmaran
    ) -> None:
        middleware = SmaranChatMiddleware(connection)
        connection.client.recall = AsyncMock(
            return_value=[MemoryHit(text="Likes Python", score=0.9)]
        )
        context = _context_with_messages(
            [
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "what do I like?"},
            ]
        )
        call_next = AsyncMock()

        await middleware.process(context, call_next)

        call_next.assert_awaited_once()
        assert "Likes Python" in context.messages[0]["content"]

    @pytest.mark.asyncio
    async def test_process_skips_recall_when_no_user_message(
        self, connection: AgentSmaran
    ) -> None:
        middleware = SmaranChatMiddleware(connection)
        connection.client.recall = AsyncMock()
        context = _context_with_messages([{"role": "system", "content": "You are helpful."}])
        call_next = AsyncMock()

        await middleware.process(context, call_next)

        connection.client.recall.assert_not_awaited()
        call_next.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_process_saves_conversation_when_enabled(self, connection: AgentSmaran) -> None:
        middleware = SmaranChatMiddleware(
            connection, options=SmaranMiddlewareOptions(save_conversations=True)
        )
        connection.client.recall = AsyncMock(return_value=[])
        connection.client.save = AsyncMock(return_value=True)
        context = _context_with_messages([{"role": "user", "content": "my birthday is March 14"}])
        call_next = AsyncMock()

        await middleware.process(context, call_next)
        await middleware.wait_for_background_tasks()

        connection.client.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_process_continues_when_recall_fails(self, connection: AgentSmaran) -> None:
        middleware = SmaranChatMiddleware(connection)
        connection.client.recall = AsyncMock(side_effect=RuntimeError("network error"))
        context = _context_with_messages([{"role": "user", "content": "hello"}])
        call_next = AsyncMock()

        await middleware.process(context, call_next)

        call_next.assert_awaited_once()
