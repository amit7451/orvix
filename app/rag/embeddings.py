"""Embedding provider abstraction.

Local/offline default: a deterministic hashing-based bag-of-words embedder
(no external API calls, no API key required) so the whole RAG pipeline runs
fully offline for local development and demos. Swap in an OpenAI/Gemini
embedding provider in production by implementing the same interface.
"""
from __future__ import annotations

import hashlib
import re
from abc import ABC, abstractmethod

import numpy as np

_TOKEN_RE = re.compile(r"[a-z0-9]+")


class EmbeddingProvider(ABC):
    dim: int

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class HashingEmbeddingProvider(EmbeddingProvider):
    """Deterministic, dependency-free embedding for offline RAG.

    Each token is hashed into a fixed-size vector slot (feature hashing /
    the "hashing trick"), giving stable, comparable vectors without any
    network calls or pretrained weights. Good enough for local semantic
    retrieval over a small operational knowledge base; swap for a real
    embedding model in production.
    """

    def __init__(self, dim: int = 256) -> None:
        self.dim = dim

    def _tokenize(self, text: str) -> list[str]:
        return _TOKEN_RE.findall(text.lower())

    def _embed_one(self, text: str) -> list[float]:
        vec = np.zeros(self.dim, dtype=np.float32)
        tokens = self._tokenize(text)
        if not tokens:
            return vec.tolist()
        for tok in tokens:
            h = int(hashlib.sha256(tok.encode()).hexdigest(), 16)
            idx = h % self.dim
            sign = 1.0 if (h // self.dim) % 2 == 0 else -1.0
            vec[idx] += sign
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]
