from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import IncidentStatus
from app.core.events import EventType, event_bus
from app.db.models.incident import Incident, IncidentEvent
from app.incidents.correlation import build_correlation_key, find_open_duplicate
from app.incidents.lifecycle import validate_transition
from app.memory.audit import record as audit_record
from app.schemas.incident import IncidentCreate


class IncidentService:
    async def create(self, db: AsyncSession, payload: IncidentCreate, actor: str = "orvix-agent") -> Incident:
        correlation_key = build_correlation_key(payload.affected_services, payload.symptoms)
        duplicate = await find_open_duplicate(db, correlation_key)

        incident = Incident(
            title=payload.title,
            description=payload.description,
            severity=payload.severity,
            affected_services=payload.affected_services,
            symptoms=payload.symptoms,
            evidence=payload.evidence,
            correlation_key=correlation_key,
            duplicate_of=duplicate.id if duplicate else None,
            status=IncidentStatus.DETECTED,
            detected_at=datetime.now(timezone.utc),
        )
        db.add(incident)
        await db.flush()

        await self.add_event(db, incident, "DETECTED", "Incident detected." if not duplicate
                              else f"Incident detected; correlated with open incident {duplicate.id}.")
        await audit_record(db, actor=actor, action="incident.create", entity_type="incident",
                            entity_id=incident.id, details={"correlation_key": correlation_key})
        await db.commit()
        await db.refresh(incident)

        await event_bus.publish(EventType.INCIDENT_CREATED, incident_id=incident.id, title=incident.title,
                                  severity=incident.severity, duplicate_of=incident.duplicate_of)
        return incident

    async def get(self, db: AsyncSession, incident_id: str) -> Incident | None:
        return await db.get(Incident, incident_id)

    async def list(self, db: AsyncSession, status: IncidentStatus | None = None, limit: int = 100) -> list[Incident]:
        stmt = select(Incident).order_by(Incident.created_at.desc()).limit(limit)
        if status:
            stmt = stmt.where(Incident.status == status)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def add_event(self, db: AsyncSession, incident: Incident, stage: str, message: str, data: dict | None = None) -> IncidentEvent:
        event = IncidentEvent(incident_id=incident.id, stage=stage, message=message, data=data or {})
        db.add(event)
        await db.flush()
        return event

    async def transition(
        self, db: AsyncSession, incident: Incident, target: IncidentStatus, actor: str, note: str = ""
    ) -> Incident:
        validate_transition(incident.status, target)
        previous = incident.status
        incident.status = target
        if target == IncidentStatus.RESOLVED:
            incident.resolved_at = datetime.now(timezone.utc)

        await self.add_event(db, incident, target, note or f"Status changed {previous} -> {target}.")
        await audit_record(db, actor=actor, action="incident.transition", entity_type="incident",
                            entity_id=incident.id, details={"from": previous, "to": target, "note": note})
        await db.flush()
        await db.commit()
        await db.refresh(incident)

        event_type = {
            IncidentStatus.RESOLVED: EventType.INCIDENT_RESOLVED,
            IncidentStatus.ESCALATED: EventType.INCIDENT_ESCALATED,
        }.get(target, EventType.INCIDENT_UPDATED)
        await event_bus.publish(event_type, incident_id=incident.id, status=target, note=note)
        return incident

    async def update_fields(self, db: AsyncSession, incident: Incident, **fields) -> Incident:
        for key, value in fields.items():
            setattr(incident, key, value)
        await db.flush()
        await db.commit()
        await db.refresh(incident)
        await event_bus.publish(EventType.INCIDENT_UPDATED, incident_id=incident.id, fields=list(fields.keys()))
        return incident


incident_service = IncidentService()
