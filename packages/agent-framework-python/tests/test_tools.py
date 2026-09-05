"""Tests for Smaran tools."""

import json
from unittest.mock import AsyncMock

import pytest
from smaran import MemoryHit

from smaran_agent_framework import AgentSmaran, SmaranTools


@pytest.fixture
def connection() -> AgentSmaran:
    return AgentSmaran(api_key="test-key", base_url="https://example.com", user_id="user-123")


class TestSmaranTools:
    @pytest.mark.asyncio
    async def test_search_memories_success(self, connection: AgentSmaran) -> None:
        tools = SmaranTools(connection)
        connection.client.recall = AsyncMock(
            return_value=[MemoryHit(text="Likes Python", score=0.9)]
        )

        result_json = await tools.search_memories(information_to_get="favorite language")
        result = json.loads(result_json)

        assert result["success"] is True
        assert result["count"] == 1
        assert result["results"][0]["text"] == "Likes Python"
        connection.client.recall.assert_awaited_once_with(
            query="favorite language", user_id="user-123", session_id=connection.session_id, top_k=5
        )

    @pytest.mark.asyncio
    async def test_search_memories_handles_errors(self, connection: AgentSmaran) -> None:
        tools = SmaranTools(connection)
        connection.client.recall = AsyncMock(side_effect=RuntimeError("boom"))

        result_json = await tools.search_memories(information_to_get="anything")
        result = json.loads(result_json)

        assert result["success"] is False
        assert "boom" in result["error"]

    @pytest.mark.asyncio
    async def test_add_memory_success(self, connection: AgentSmaran) -> None:
        tools = SmaranTools(connection)
        connection.client.save = AsyncMock(return_value=True)

        result_json = await tools.add_memory(memory="Likes Python")
        result = json.loads(result_json)

        assert result["success"] is True
        assert result["saved"] is True
        connection.client.save.assert_awaited_once_with(
            text="Likes Python", user_id="user-123", session_id=connection.session_id
        )

    def test_get_tools_returns_two_tools(self, connection: AgentSmaran) -> None:
        tools = SmaranTools(connection)
        result = tools.get_tools()
        assert len(result) == 2
