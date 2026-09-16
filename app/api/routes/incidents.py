from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import IncidentStatus
from app.db.models.incident import IncidentEvent
from app.db.session import get_db
from app.incidents.service import incident_service
from app.schemas.incident import IncidentCreate, IncidentEventOut, IncidentOut
from app.services.agent_runner import start_run

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=list[IncidentOut])
async def list_incidents(status: IncidentStatus | None = None, db: AsyncSession = Depends(get_db)):
    return await incident_service.list(db, status=status)


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(incident_id: str, db: AsyncSession = Depends(get_db)):
    incident = await incident_service.get(db, incident_id)
    if incident is None:
        raise HTTPException(404, "Incident not found")
    return incident


@router.get("/{incident_id}/timeline", response_model=list[IncidentEventOut])
async def get_incident_timeline(incident_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(IncidentEvent).where(IncidentEvent.incident_id == incident_id).order_by(IncidentEvent.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(payload: IncidentCreate, db: AsyncSession = Depends(get_db)):
    return await incident_service.create(db, payload, actor="api-user")


@router.post("/{incident_id}/investigate", response_model=IncidentOut)
async def investigate_incident(incident_id: str, db: AsyncSession = Depends(get_db)):
    """Manually trigger the full ORVIX agent loop for an existing incident."""
    incident = await incident_service.get(db, incident_id)
    if incident is None:
        raise HTTPException(404, "Incident not found")
    await start_run(db, incident)
    await db.refresh(incident)
    return incident
