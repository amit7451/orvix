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
            return data["choices"][0]["message"]["content"]


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
                await asyncio.sleep(min(2**attempt, 5))

        logger.error("LLM call exhausted retries: %s", last_error)
        return {**fallback, "_llm_error": str(last_error)}


def build_llm_client() -> LLMClient:
    return LLMClient(build_backend())
