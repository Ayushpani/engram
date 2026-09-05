"""Tests for the Smaran OpenAI middleware."""

from unittest.mock import AsyncMock, Mock, patch

import pytest
from openai import AsyncOpenAI
from smaran import MemoryHit

from smaran_openai import OpenAIMiddlewareOptions, SmaranConfigurationError, with_smaran


@pytest.fixture
def mock_async_openai_client():
    client = Mock(spec=AsyncOpenAI)
    client.chat = Mock()
    client.chat.completions = Mock()
    client.chat.completions.create = AsyncMock(return_value="fake-response")
    return client


class TestWithSmaran:
    def test_requires_configuration(self, mock_async_openai_client) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(SmaranConfigurationError):
                with_smaran(mock_async_openai_client, OpenAIMiddlewareOptions(user_id="user-1"))

    @pytest.mark.asyncio
    async def test_injects_recalled_memories_into_system_prompt(
        self, mock_async_openai_client
    ) -> None:
        original_create = mock_async_openai_client.chat.completions.create
        wrapped = with_smaran(
            mock_async_openai_client,
            OpenAIMiddlewareOptions(user_id="user-123", add_memory=False),
            api_key="sk_test",
            base_url="https://example.com",
        )

        with patch.object(
            wrapped._smaran, "recall", AsyncMock(return_value=[MemoryHit(text="Likes Python")])
        ):
            await wrapped.chat.completions.create(
                model="gpt-4", messages=[{"role": "user", "content": "what do I like?"}]
            )

        call_kwargs = original_create.call_args.kwargs
        assert any(
            m["role"] == "system" and "Likes Python" in m["content"] for m in call_kwargs["messages"]
        )

    @pytest.mark.asyncio
    async def test_proceeds_without_memories_on_recall_failure(
        self, mock_async_openai_client
    ) -> None:
        original_create = mock_async_openai_client.chat.completions.create
        wrapped = with_smaran(
            mock_async_openai_client,
            OpenAIMiddlewareOptions(user_id="user-123", add_memory=False),
            api_key="sk_test",
            base_url="https://example.com",
        )

        with patch.object(wrapped._smaran, "recall", AsyncMock(side_effect=RuntimeError("boom"))):
            result = await wrapped.chat.completions.create(
                model="gpt-4", messages=[{"role": "user", "content": "hello"}]
            )

        assert result == "fake-response"
        original_create.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_saves_conversation_when_add_memory_enabled(
        self, mock_async_openai_client
    ) -> None:
        wrapped = with_smaran(
            mock_async_openai_client,
            OpenAIMiddlewareOptions(user_id="user-123", add_memory=True),
            api_key="sk_test",
            base_url="https://example.com",
        )

        with (
            patch.object(wrapped._smaran, "recall", AsyncMock(return_value=[])),
            patch.object(wrapped._smaran, "save", AsyncMock(return_value=True)) as mock_save,
        ):
            await wrapped.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": "my birthday is March 14"}],
            )
            await wrapped.wait_for_background_tasks()

        mock_save.assert_awaited_once()
