"""Shared connection class for Smaran Agent Framework integrations.

Holds the Smaran client, user ID, conversation ID, and entity context —
shared across middleware, tools, and context providers.
"""

import uuid
from typing import Optional

from smaran import Smaran
from smaran import SmaranConfigurationError as _ClientConfigurationError

from .exceptions import SmaranConfigurationError


class AgentSmaran:
    """Shared Smaran connection for middleware, tools, and context providers.

    Centralizes API client creation, user ID, conversation ID, and entity
    context so that all integration points share the same session.

    Example:
        ```python
        from smaran_agent_framework import AgentSmaran

        conn = AgentSmaran(
            api_key="your-key",
            user_id="user-123",
            entity_context="The user is a Python developer who prefers async code.",
        )
        ```
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        user_id: str = "msft_agent_chat",
        entity_context: Optional[str] = None,
        conversation_id: Optional[str] = None,
    ) -> None:
        """Initialize the shared Smaran connection.

        Args:
            api_key: Smaran API key. Falls back to the SMARAN_API_KEY env var.
            base_url: Smaran API base URL. Falls back to the SMARAN_URL env var.
            user_id: Identifier memories are scoped to.
            entity_context: Custom context about the user/entity to prepend to memories.
            conversation_id: Conversation ID for grouping saved messages. Auto-generated if None.
        """
        try:
            self.client: Smaran = Smaran(api_key=api_key, base_url=base_url)
        except _ClientConfigurationError as e:
            raise SmaranConfigurationError(str(e), e) from e

        self.user_id: str = user_id
        self.conversation_id: str = conversation_id or str(uuid.uuid4())
        self.session_id: str = f"conversation_{self.conversation_id}"
        self.entity_context: Optional[str] = entity_context
