"""Optional lexical reranking stage.

Applied on top of vector search results to boost precision using exact
keyword overlap and document-quality signals (approval status, recency),
without requiring a hosted cross-encoder model.
"""
from __future__ import annotations

import re

from app.rag.vector_store import VectorSearchResult

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(text.lower()))


def rerank(query: str, results: list[VectorSearchResult]) -> list[VectorSearchResult]:
    if not results:
        return results
    query_tokens = _tokens(query)

    def score(r: VectorSearchResult) -> float:
        overlap = len(query_tokens & _tokens(r.text)) / (len(query_tokens) or 1)
        approval_boost = 0.05 if r.metadata.get("approval_status") == "APPROVED" else -0.15
        return r.score + 0.25 * overlap + approval_boost

    return sorted(results, key=score, reverse=True)
