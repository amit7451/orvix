from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.common import KnowledgeDocumentIn, KnowledgeSearchResult
from app.services.knowledge import knowledge_service

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("/documents", status_code=201)
async def create_document(payload: KnowledgeDocumentIn, db: AsyncSession = Depends(get_db)):
    doc = await knowledge_service.ingest(db, payload)
    return {"document_id": doc.id, "title": doc.title, "status": "ingested"}


@router.post("/ingest", status_code=201)
async def ingest_documents(payloads: list[KnowledgeDocumentIn], db: AsyncSession = Depends(get_db)):
    ingested = []
    for payload in payloads:
        doc = await knowledge_service.ingest(db, payload)
        ingested.append({"document_id": doc.id, "title": doc.title})
    return {"ingested": ingested, "count": len(ingested)}


@router.get("/search", response_model=list[KnowledgeSearchResult])
async def search_knowledge(q: str, service: str | None = None, document_type: str | None = None):
    return await knowledge_service.search(q, service=service, document_type=document_type)
