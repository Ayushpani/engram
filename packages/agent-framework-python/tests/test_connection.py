"""Tests for the AgentSmaran connection class."""

import os
from unittest.mock import patch

import pytest

from smaran_agent_framework import AgentSmaran, SmaranConfigurationError


class TestAgentSmaran:
    def test_requires_api_key(self) -> None:
        with patch.dict(os.environ, {"SMARAN_URL": "https://example.com"}, clear=True):
            with pytest.raises(SmaranConfigurationError):
                AgentSmaran()

    def test_requires_base_url(self) -> None:
        with patch.dict(os.environ, {"SMARAN_API_KEY": "test-key"}, clear=True):
            with pytest.raises(SmaranConfigurationError):
                AgentSmaran()

    def test_accepts_api_key_and_base_url_params(self) -> None:
        conn = AgentSmaran(api_key="test-key", base_url="https://example.com")
        assert conn.client is not None

    @patch.dict(os.environ, {"SMARAN_API_KEY": "env-key", "SMARAN_URL": "https://example.com"})
    def test_reads_env_config(self) -> None:
        conn = AgentSmaran()
        assert conn.client is not None

    def test_default_user_id(self) -> None:
        conn = AgentSmaran(api_key="test-key", base_url="https://example.com")
        assert conn.user_id == "msft_agent_chat"

    def test_custom_user_id(self) -> None:
        conn = AgentSmaran(api_key="test-key", base_url="https://example.com", user_id="user-123")
        assert conn.user_id == "user-123"

    def test_auto_generates_conversation_id(self) -> None:
        conn = AgentSmaran(api_key="test-key", base_url="https://example.com")
        assert conn.conversation_id
        assert conn.session_id == f"conversation_{conn.conversation_id}"

    def test_custom_conversation_id(self) -> None:
        conn = AgentSmaran(
            api_key="test-key", base_url="https://example.com", conversation_id="conv-abc"
        )
        assert conn.conversation_id == "conv-abc"
        assert conn.session_id == "conversation_conv-abc"

    def test_entity_context(self) -> None:
        conn = AgentSmaran(
            api_key="test-key",
            base_url="https://example.com",
            entity_context="User is a Python developer",
        )
        assert conn.entity_context == "User is a Python developer"

    def test_entity_context_default_none(self) -> None:
        conn = AgentSmaran(api_key="test-key", base_url="https://example.com")
        assert conn.entity_context is None
