"""Minimal async client for the Smaran memory API.

Wraps the two calls every Smaran integration needs — recall and save —
against the real, self-hosted Smaran API (``/v1/recall`` and
``/v1/memories``). Every framework/platform integration package in this
repo (smaran-pipecat, smaran-cartesia, smaran-openai, smaran-agent-framework)
depends on this client rather than talking to HTTP directly, so the request
shape only needs to be gotten right in one place.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from .exceptions import SmaranAPIError, SmaranConfigurationError, SmaranNetworkError

DEFAULT_TIMEOUT_S = 10.0


@dataclass
class MemoryHit:
    """A single recalled memory."""

    text: str
    score: float = 0.0
    tier: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


class Smaran:
    """Async client for the Smaran memory API.

    Args:
        api_key: Smaran API key. Falls back to the ``SMARAN_API_KEY`` env var.
        base_url: Base URL of the Smaran API (self-hosted or managed). Falls
            back to the ``SMARAN_URL`` env var.
        timeout: Per-request timeout in seconds.

    Raises:
        SmaranConfigurationError: If no API key or base URL is available.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self.api_key = api_key or os.getenv("SMARAN_API_KEY")
        if not self.api_key:
            raise SmaranConfigurationError(
                "Smaran API key is required. Pass api_key or set SMARAN_API_KEY."
            )

        resolved_base_url = base_url or os.getenv("SMARAN_URL")
        if not resolved_base_url:
            raise SmaranConfigurationError(
                "Smaran base URL is required. Pass base_url or set SMARAN_URL "
                "(e.g. your self-hosted deployment's URL)."
            )
        self.base_url = resolved_base_url.rstrip("/")
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def recall(
        self,
        query: str,
        user_id: str,
        session_id: Optional[str] = None,
        top_k: int = 5,
        include_cross_session: bool = True,
    ) -> list[MemoryHit]:
        """Recall memories relevant to ``query`` for ``user_id``.

        Returns an empty list (never raises) when ``query`` is blank, so
        callers can unconditionally call this before generating a reply.
        """
        if not query or not query.strip():
            return []

        payload: dict[str, Any] = {
            "query": query,
            "userId": user_id,
            "topK": top_k,
            "includeCrossSession": include_cross_session,
        }
        if session_id:
            payload["sessionId"] = session_id

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/v1/recall", headers=self._headers(), json=payload
                )
        except httpx.HTTPError as e:
            raise SmaranNetworkError("Smaran recall request failed", e) from e

        if resp.status_code >= 400:
            raise SmaranAPIError(
                "Smaran recall failed", status_code=resp.status_code, response_text=resp.text
            )

        data = resp.json()
        hits: list[MemoryHit] = []
        for h in data.get("hits", []):
            memory = h.get("memory") or {}
            text = memory.get("text")
            if text:
                hits.append(
                    MemoryHit(text=text, score=h.get("score", 0.0), tier=h.get("tier", ""), raw=h)
                )
        return hits

    async def save(
        self,
        text: str,
        user_id: str,
        session_id: Optional[str] = None,
    ) -> bool:
        """Save ``text`` as a new memory for ``user_id``.

        Returns whether a memory was actually created — the API silently
        skips near-empty or pure-question turns, which is not an error.
        Never raises for a skip; raises SmaranAPIError/SmaranNetworkError
        for real failures.
        """
        if not text or not text.strip():
            return False

        payload: dict[str, Any] = {"text": text, "userId": user_id}
        if session_id:
            payload["sessionId"] = session_id

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/v1/memories", headers=self._headers(), json=payload
                )
        except httpx.HTTPError as e:
            raise SmaranNetworkError("Smaran save request failed", e) from e

        if resp.status_code >= 400:
            raise SmaranAPIError(
                "Smaran save failed", status_code=resp.status_code, response_text=resp.text
            )

        data = resp.json()
        return bool(data.get("memories"))
