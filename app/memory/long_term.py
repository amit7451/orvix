"""Long-term incident memory: historical incidents, diagnoses, remediation
outcomes, queryable for similarity against a new incident (Section 17)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import IncidentStatus
from app.db.models.incident import Incident


def _similarity(a_services: set[str], a_text: str, b: Incident) -> float:
    b_services = set(b.affected_services or [])
    service_overlap = len(a_services & b_services) / (len(a_services | b_services) or 1)

    a_tokens = set(a_text.lower().split())
    b_tokens = set((b.title + " " + b.description).lower().split())
    text_overlap = len(a_tokens & b_tokens) / (len(a_tokens | b_tokens) or 1)

    return round(0.6 * service_overlap + 0.4 * text_overlap, 3)


async def find_similar_incidents(
    db: AsyncSession, *, affected_services: list[str], text: str, limit: int = 3
) -> list[dict]:
    """Naive but effective similarity search over resolved incidents.
    Production would back this with the same vector store used for RAG."""
    result = await db.execute(
        select(Incident).where(Incident.status.in_([IncidentStatus.RESOLVED, IncidentStatus.ESCALATED]))
    )
    candidates = result.scalars().all()
    scored = [
        (_similarity(set(affected_services), text, c), c) for c in candidates
    ]
    scored = [s for s in scored if s[0] > 0.05]
    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {
            "incident_id": c.id,
            "title": c.title,
            "root_cause": c.probable_root_cause,
            "status": c.status,
            "similarity": score,
            "remediation_plan": c.remediation_plan,
        }
        for score, c in scored[:limit]
    ]
