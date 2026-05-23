"""Tests for Engram tools."""

import pytest

from engram_agent_framework import AgentEngram, EngramTools


def _make_conn(**kwargs):
    kwargs.setdefault("api_key", "test-key")
    kwargs.setdefault("container_tag", "msft_agent_chat")
    return AgentEngram(**kwargs)


class TestEngramTools:
    def test_create_tools_instance(self) -> None:
        conn = _make_conn()
        tools = EngramTools(conn)
        assert tools._connection.container_tag == "msft_agent_chat"

    def test_create_tools_with_custom_tag(self) -> None:
        conn = _make_conn(container_tag="custom-tag")
        tools = EngramTools(conn)
        assert tools._connection.container_tag == "custom-tag"

    def test_get_tools_returns_list(self) -> None:
        conn = _make_conn()
        tools = EngramTools(conn)
        result = tools.get_tools()
        assert isinstance(result, list)
        assert len(result) == 3

    def test_get_tools_names(self) -> None:
        conn = _make_conn()
        tools = EngramTools(conn)
        result = tools.get_tools()
        names = [t.name for t in result]
        assert "search_memories" in names
        assert "add_memory" in names
        assert "get_profile" in names

    def test_uses_connection_client(self) -> None:
        conn = _make_conn()
        tools = EngramTools(conn)
        assert tools._client is conn.client

    def test_shares_custom_id_with_connection(self) -> None:
        conn = _make_conn(conversation_id="conv-123")
        tools = EngramTools(conn)
        assert tools._connection.custom_id == "conversation_conv-123"
