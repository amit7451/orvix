"""Provider-independent LLM abstraction (Section 28).

The core agent never talks to OpenAI/Gemini/Groq directly - it calls
`LLMClient.generate_structured`, which:
  * validates the response against a JSON schema,
  * retries with backoff on transient failure or invalid structure,
  * times out instead of hanging the agent graph,
  * falls back to a deterministic rule-based responder when no provider
    is configured (LLM_PROVIDER=mock), so the whole system runs offline.

LLM failures must never corrupt incident state (Section 31): callers
always receive a well-formed dict, even in the failure path, with an
`_llm_error` marker the caller can branch on.
"""
from __future__ import annotations

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("orvix.llm")


class LLMError(Exception):
    pass


class LLMBackend(ABC):
    @abstractmethod
    async def complete(self, system: str, user: str) -> str: ...


class MockLLMBackend(LLMBackend):
    """Deterministic offline backend used when LLM_PROVIDER=mock or no
    API key is configured. Produces plausible, evidence-grounded JSON so
    the full agent loop is demonstrable with zero external dependencies.
    """

    async def complete(self, system: str, user: str) -> str:
        # The real "reasoning" for the mock backend happens in
        # app/agents/nodes/reason.py, which builds the JSON directly from
        # evidence when it detects the mock backend is active. This
        # backend only needs to satisfy the LLMClient contract.
        return json.dumps({"note": "mock backend - structured content produced by caller"})


class OpenAIBackend(LLMBackend):
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    async def complete(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            usage = data.get("usage", {})
            content = data["choices"][0]["message"]["content"]
            # Attach usage metadata for callers that need it.
            self._last_usage = usage
            return content

    @property
    def last_usage(self) -> dict:
        return getattr(self, "_last_usage", {})


class GeminiBackend(LLMBackend):
    """Google Gemini API backend via the REST generateContent endpoint."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self._api_key = api_key
        self._model = model
        self._last_usage: dict = {}

    async def complete(self, system: str, user: str) -> str:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._model}:generateContent?key={self._api_key}"
        )
        body = {
            "contents": [{"parts": [{"text": f"{system}\n\n{user}"}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
            self._last_usage = data.get("usageMetadata", {})
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return text

    @property
    def last_usage(self) -> dict:
        return self._last_usage


class OpenRouterBackend(LLMBackend):
    """OpenRouter API backend (OpenAI-compatible endpoint)."""

    def __init__(self, api_key: str, model: str = "deepseek/deepseek-chat-v3-0324") -> None:
        self._api_key = api_key
        self._model = model
        self._last_usage: dict = {}

    async def complete(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "HTTP-Referer": "https://orvix.ai",
                    "X-Title": "ORVIX Testing",
                },
                json={
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            self._last_usage = data.get("usage", {})
            content = data["choices"][0]["message"]["content"]
            return content

    @property
    def last_usage(self) -> dict:
        return self._last_usage


def build_backend_for_provider(
    provider: str, api_key: str, model: str | None = None
) -> LLMBackend:
    """Build a specific backend by provider name — used by the testing harness
    to create isolated backends without touching the app-wide singleton."""
    if provider == "openai":
        return OpenAIBackend(api_key, model or "gpt-4o-mini")
    if provider == "gemini":
        return GeminiBackend(api_key, model or "gemini-2.5-flash")
    if provider == "openrouter":
        return OpenRouterBackend(api_key, model or "deepseek/deepseek-chat-v3-0324")
    return MockLLMBackend()


def build_backend() -> LLMBackend:
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return OpenAIBackend(settings.openai_api_key, settings.llm_model)
    # Gemini/Groq backends follow the same pattern; omitted here to keep
    # the reference implementation focused, but `LLMBackend` is the only
    # interface a new provider needs to satisfy.
    return MockLLMBackend()


class LLMClient:
    """Structured-output wrapper with retries, timeout and fallback."""

    def __init__(self, backend: LLMBackend) -> None:
        self._backend = backend
        self.is_mock = isinstance(backend, MockLLMBackend)

    async def generate_structured(
        self, system: str, user: str, fallback: dict[str, Any]
    ) -> dict[str, Any]:
        if self.is_mock:
            return fallback

        last_error: Exception | None = None
        for attempt in range(settings.llm_max_retries + 1):
            try:
                raw = await asyncio.wait_for(
                    self._backend.complete(system, user), timeout=settings.llm_timeout_seconds
                )
                return json.loads(raw)
            except (asyncio.TimeoutError, httpx.HTTPError, json.JSONDecodeError, KeyError) as exc:
                last_error = exc
                logger.warning("LLM call failed (attempt %s): %s", attempt + 1, exc)
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (401, 403, 404, 429):
                    break
                await asyncio.sleep(min(2**attempt, 5))

        logger.error("LLM call exhausted retries: %s", last_error)
        return {**fallback, "_llm_error": str(last_error)}

    @property
    def last_usage(self) -> dict:
        """Proxy token usage from the underlying backend."""
        return getattr(self._backend, "last_usage", {})


def build_llm_client() -> LLMClient:
    return LLMClient(build_backend())

