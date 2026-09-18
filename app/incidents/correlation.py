"""Incident deduplication / correlation (Section 18, Section 6)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import IncidentStatus
from app.db.models.incident import Incident

_OPEN_STATUSES = [
    IncidentStatus.DETECTED,
    IncidentStatus.INVESTIGATING,
    IncidentStatus.DIAGNOSED,
    IncidentStatus.AWAITING_APPROVAL,
    IncidentStatus.REMEDIATING,
    IncidentStatus.VERIFYING,
    IncidentStatus.ESCALATED,
]


def build_correlation_key(affected_services: list[str], symptoms: list[str]) -> str:
    services = "+".join(sorted(set(affected_services)))
    symptom_bucket = "+".join(sorted({s.lower().split()[0] for s in symptoms if s})) if symptoms else "generic"
    return f"{services}::{symptom_bucket}"


async def find_open_duplicate(db: AsyncSession, correlation_key: str, within_minutes: int | None = 15) -> Incident | None:
    result = await db.execute(
        select(Incident).where(
            Incident.correlation_key == correlation_key,
            Incident.status.in_(_OPEN_STATUSES),
        ).order_by(Incident.detected_at.desc())
    )
    incident = result.scalars().first()
    if not incident:
        return None
    if within_minutes is not None and incident.detected_at:
        dt = incident.detected_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if (now - dt) > timedelta(minutes=within_minutes):
            return None
    return incident
