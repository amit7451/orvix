import pytest

from app.core.enums import DocumentApprovalStatus
from app.rag.chunking import chunk_text
from app.rag.embeddings import HashingEmbeddingProvider
from app.rag.ingestion import IngestionPipeline
from app.rag.retriever import OperationalRetriever
from app.rag.vector_store import InMemoryVectorStore


def test_chunking_splits_long_text():
    text = "\n\n".join([f"Paragraph {i} " + "word " * 50 for i in range(10)])
    chunks = chunk_text(text, chunk_size=300)
    assert len(chunks) > 1
    assert all(len(c) <= 320 for c in chunks)  # small overlap slack


@pytest.mark.asyncio
async def test_retrieval_finds_relevant_document():
    embedder = HashingEmbeddingProvider(dim=128)
    store = InMemoryVectorStore()
    pipeline = IngestionPipeline(embedder, store)

    await pipeline.ingest(
        "doc-1", "DB Pool Runbook",
        "Database connection pool exhaustion causes payment service latency spikes. Restart the service.",
        {"document_type": "runbook", "service": "payment-service", "approval_status": DocumentApprovalStatus.APPROVED},
    )
    await pipeline.ingest(
        "doc-2", "Unrelated Doc",
        "This document is about quarterly marketing budget planning and has nothing to do with databases.",
        {"document_type": "sop", "service": "", "approval_status": DocumentApprovalStatus.APPROVED},
    )

    retriever = OperationalRetriever(embedder, store)
    context = await retriever.retrieve("database connection pool exhaustion payment service")

    assert context.results
    assert context.results[0].document_id == "doc-1"


@pytest.mark.asyncio
async def test_unapproved_documents_excluded_by_default():
    embedder = HashingEmbeddingProvider(dim=128)
    store = InMemoryVectorStore()
    pipeline = IngestionPipeline(embedder, store)

    await pipeline.ingest(
        "doc-unapproved", "Draft Runbook", "This is a draft runbook about database exhaustion, not yet reviewed.",
        {"document_type": "runbook", "service": "", "approval_status": DocumentApprovalStatus.PENDING_REVIEW},
    )

    retriever = OperationalRetriever(embedder, store)
    context = await retriever.retrieve("database exhaustion", only_approved=True)
    assert all(r.document_id != "doc-unapproved" for r in context.results)
