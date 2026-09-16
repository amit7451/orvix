"""Vector store abstraction.

Local development uses an in-memory numpy cosine-similarity index (zero
extra services to run). The interface is intentionally narrow so it can be
backed by Chroma or pgvector in production without touching retriever code
(Section 9).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np


@dataclass
class VectorRecord:
    chunk_id: str
    document_id: str
    text: str
    embedding: list[float]
    metadata: dict = field(default_factory=dict)


@dataclass
class VectorSearchResult:
    chunk_id: str
    document_id: str
    text: str
    score: float
    metadata: dict


class VectorStore(ABC):
    @abstractmethod
    async def upsert(self, records: list[VectorRecord]) -> None: ...

    @abstractmethod
    async def search(
        self, query_embedding: list[float], top_k: int = 5, metadata_filter: dict | None = None
    ) -> list[VectorSearchResult]: ...

    @abstractmethod
    async def delete_document(self, document_id: str) -> None: ...


class InMemoryVectorStore(VectorStore):
    """Reference implementation. Swap for `ChromaVectorStore` or a future
    `PgVectorStore` by implementing the same abstract interface."""

    def __init__(self) -> None:
        self._records: dict[str, VectorRecord] = {}

    async def upsert(self, records: list[VectorRecord]) -> None:
        for r in records:
            self._records[r.chunk_id] = r

    async def delete_document(self, document_id: str) -> None:
        to_remove = [cid for cid, r in self._records.items() if r.document_id == document_id]
        for cid in to_remove:
            del self._records[cid]

    def _matches_filter(self, metadata: dict, metadata_filter: dict | None) -> bool:
        if not metadata_filter:
            return True
        for key, value in metadata_filter.items():
            if value is None:
                continue
            if metadata.get(key) != value:
                return False
        return True

    async def search(
        self, query_embedding: list[float], top_k: int = 5, metadata_filter: dict | None = None
    ) -> list[VectorSearchResult]:
        if not self._records:
            return []
        q = np.array(query_embedding, dtype=np.float32)
        q_norm = np.linalg.norm(q) or 1.0

        scored: list[tuple[float, VectorRecord]] = []
        for record in self._records.values():
            if not self._matches_filter(record.metadata, metadata_filter):
                continue
            v = np.array(record.embedding, dtype=np.float32)
            v_norm = np.linalg.norm(v) or 1.0
            score = float(np.dot(q, v) / (q_norm * v_norm))
            scored.append((score, record))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]
        return [
            VectorSearchResult(
                chunk_id=r.chunk_id, document_id=r.document_id, text=r.text, score=s, metadata=r.metadata
            )
            for s, r in top
        ]
