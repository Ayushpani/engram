"""Tests for Smaran OpenAI tools."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from smaran import MemoryHit

from smaran_openai import SmaranTools


@pytest.fixture
def tools() -> SmaranTools:
    return SmaranTools("sk_test", {"base_url": "https://example.com", "user_id": "user-123"})


class TestSmaranTools:
    @pytest.mark.asyncio
    async def test_search_memories_success(self, tools: SmaranTools) -> None:
        with patch.object(
            tools.client, "recall", AsyncMock(return_value=[MemoryHit(text="Likes Python", score=0.9)])
        ) as mock_recall:
            result = await tools.search_memories(information_to_get="favorite language")

        assert result["success"] is True
        assert result["count"] == 1
        assert result["results"][0]["text"] == "Likes Python"
        mock_recall.assert_awaited_once_with(
            query="favorite language", user_id="user-123", session_id=None, top_k=5
        )

    @pytest.mark.asyncio
    async def test_search_memories_handles_errors(self, tools: SmaranTools) -> None:
        with patch.object(tools.client, "recall", AsyncMock(side_effect=RuntimeError("boom"))):
            result = await tools.search_memories(information_to_get="anything")

        assert result["success"] is False
        assert "boom" in result["error"]

    @pytest.mark.asyncio
    async def test_add_memory_success(self, tools: SmaranTools) -> None:
        with patch.object(tools.client, "save", AsyncMock(return_value=True)) as mock_save:
            result = await tools.add_memory(memory="Likes Python")

        assert result["success"] is True
        assert result["saved"] is True
        mock_save.assert_awaited_once_with(text="Likes Python", user_id="user-123", session_id=None)

    @pytest.mark.asyncio
    async def test_execute_tool_call_routes_to_search(self, tools: SmaranTools) -> None:
        tool_call = type(
            "FakeToolCall",
            (),
            {
                "function": type(
                    "FakeFn",
                    (),
                    {"name": "search_memories", "arguments": json.dumps({"information_to_get": "x"})},
                )()
            },
        )()

        with patch.object(tools.client, "recall", AsyncMock(return_value=[])):
            result_json = await tools.execute_tool_call(tool_call)

        assert json.loads(result_json)["success"] is True

    def test_get_tool_definitions_returns_two_tools(self, tools: SmaranTools) -> None:
        defs = tools.get_tool_definitions()
        names = [d["function"]["name"] for d in defs]
        assert names == ["search_memories", "add_memory"]
