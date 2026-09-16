"""Ingestion pipeline: Documents -> Parsing -> Normalization -> Chunking ->
Metadata -> Embeddings -> Vector Store (Section 7)."""
from __future__ import annotations

from app.rag.chunking import chunk_text, normalize
from app.rag.embeddings import EmbeddingProvider
from app.rag.vector_store import VectorRecord, VectorStore


class IngestionPipeline:
    def __init__(self, embedder: EmbeddingProvider, store: VectorStore) -> None:
        self._embedder = embedder
        self._store = store

    async def ingest(self, document_id: str, title: str, content: str, metadata: dict) -> int:
        normalized = normalize(content)
        chunks = chunk_text(normalized)
        if not chunks:
            return 0

        embeddings = await self._embedder.embed(chunks)
        records = [
            VectorRecord(
                chunk_id=f"{document_id}::chunk-{i}",
                document_id=document_id,
                text=chunk,
                embedding=emb,
                metadata={**metadata, "title": title, "chunk_index": i},
            )
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
        ]
        await self._store.upsert(records)
        return len(records)
