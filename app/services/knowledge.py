"""Knowledge base service: persists `KnowledgeDocument` rows and mirrors
them into the vector store via the ingestion pipeline (Section 7/8)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.container import get_ingestion_pipeline, get_retriever
from app.db.models.knowledge import KnowledgeDocument
from app.schemas.common import KnowledgeDocumentIn, KnowledgeSearchResult


class KnowledgeService:
    async def ingest(self, db: AsyncSession, payload: KnowledgeDocumentIn) -> KnowledgeDocument:
        doc = KnowledgeDocument(
            title=payload.title,
            source=payload.source,
            document_type=payload.document_type,
            service=payload.service,
            version=payload.version,
            owner=payload.owner,
            tags=payload.tags,
            content=payload.content,
        )
        db.add(doc)
        await db.flush()
        await db.commit()
        await db.refresh(doc)

        pipeline = get_ingestion_pipeline()
        await pipeline.ingest(
            document_id=doc.id,
            title=doc.title,
            content=doc.content,
            metadata={
                "document_type": doc.document_type,
                "service": doc.service,
                "approval_status": doc.approval_status,
                "owner": doc.owner,
                "tags": doc.tags,
            },
        )
        return doc

    async def list(self, db: AsyncSession) -> list[KnowledgeDocument]:
        result = await db.execute(select(KnowledgeDocument).order_by(KnowledgeDocument.created_at.desc()))
        return list(result.scalars().all())

    async def search(self, query: str, service: str | None = None, document_type: str | None = None) -> list[KnowledgeSearchResult]:
        retriever = get_retriever()
        context = await retriever.retrieve(query, service=service, document_type=document_type)
        return [
            KnowledgeSearchResult(
                document_id=r.document_id, title=r.metadata.get("title", ""),
                document_type=r.metadata.get("document_type", ""), service=r.metadata.get("service", ""),
                score=round(r.score, 4), snippet=r.text[:280],
            )
            for r in context.results
        ]


knowledge_service = KnowledgeService()
