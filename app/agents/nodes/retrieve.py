"""RETRIEVE stage (Section 7): operational RAG retrieval plus historical
incident similarity search."""
from __future__ import annotations

from app.core.container import get_retriever
from app.core.events import EventType, event_bus
from app.db.session import SessionLocal
from app.memory.long_term import find_similar_incidents


async def retrieve(state: dict) -> dict:
    retriever = get_retriever()
    services = state["affected_services"]
    query = f"{' '.join(state['symptoms'])} services: {', '.join(services)}".strip()
    if not query:
        query = "service degradation troubleshooting"

    retrieved_documents: list[dict] = []
    for service in services or [None]:
        context = await retriever.retrieve(query, service=service)
        for r in context.results:
            retrieved_documents.append(
                {
                    "document_id": r.document_id,
                    "title": r.metadata.get("title"),
                    "document_type": r.metadata.get("document_type"),
                    "service": r.metadata.get("service"),
                    "score": round(r.score, 4),
                    "text": r.text,
                }
            )
    # de-dup by document/chunk, keep best score, cap list
    seen: dict[str, dict] = {}
    for doc in retrieved_documents:
        key = doc["document_id"] + str(doc["text"][:40])
        if key not in seen or doc["score"] > seen[key]["score"]:
            seen[key] = doc
    retrieved_documents = sorted(seen.values(), key=lambda d: d["score"], reverse=True)[:8]

    async with SessionLocal() as db:
        similar_incidents = await find_similar_incidents(db, affected_services=services, text=query)

    state["retrieved_documents"] = retrieved_documents
    state["similar_incidents"] = similar_incidents
    state["current_stage"] = "REASON"

    await event_bus.publish(
        EventType.RAG_RETRIEVAL_COMPLETED,
        incident_id=state["incident_id"],
        documents_retrieved=len(retrieved_documents),
        similar_incidents=len(similar_incidents),
    )
    return state
