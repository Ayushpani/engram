"""Tests for SmaranContextProvider."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from smaran import MemoryHit

from smaran_agent_framework import AgentSmaran, SmaranContextProvider


@pytest.fixture
def connection() -> AgentSmaran:
    return AgentSmaran(api_key="test-key", base_url="https://example.com", user_id="user-123")


def _context_with_messages(messages: list[dict]) -> SimpleNamespace:
    injected = []
    return SimpleNamespace(
        input_messages=messages,
        extend_instructions=lambda text, source: injected.append((text, source)),
        _injected=injected,
    )


class TestSmaranContextProvider:
    @pytest.mark.asyncio
    async def test_before_run_injects_recalled_memories(self, connection: AgentSmaran) -> None:
        provider = SmaranContextProvider(connection)
        connection.client.recall = AsyncMock(
            return_value=[MemoryHit(text="Likes Python", score=0.9)]
        )
        context = _context_with_messages([{"role": "user", "content": "what do I like?"}])

        await provider.before_run(agent=None, session=None, context=context, state={})

        connection.client.recall.assert_awaited_once()
        assert len(context._injected) == 1
        assert "Likes Python" in context._injected[0][0]

    @pytest.mark.asyncio
    async def test_before_run_skips_when_no_user_message(self, connection: AgentSmaran) -> None:
        provider = SmaranContextProvider(connection)
        connection.client.recall = AsyncMock()
        context = _context_with_messages([])

        await provider.before_run(agent=None, session=None, context=context, state={})

        connection.client.recall.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_before_run_no_injection_when_no_hits(self, connection: AgentSmaran) -> None:
        provider = SmaranContextProvider(connection)
        connection.client.recall = AsyncMock(return_value=[])
        context = _context_with_messages([{"role": "user", "content": "hello"}])

        await provider.before_run(agent=None, session=None, context=context, state={})

        assert context._injected == []

    @pytest.mark.asyncio
    async def test_after_run_does_nothing_when_store_conversations_false(
        self, connection: AgentSmaran
    ) -> None:
        provider = SmaranContextProvider(connection, store_conversations=False)
        connection.client.save = AsyncMock()
        context = _context_with_messages([{"role": "user", "content": "hello"}])

        await provider.after_run(agent=None, session=None, context=context, state={})

        connection.client.save.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_after_run_saves_conversation_when_enabled(self, connection: AgentSmaran) -> None:
        provider = SmaranContextProvider(connection, store_conversations=True)
        connection.client.save = AsyncMock(return_value=True)
        context = _context_with_messages([{"role": "user", "content": "hello"}])

        await provider.after_run(agent=None, session=None, context=context, state={})

        connection.client.save.assert_awaited_once()
