"""Simulated backend environment control endpoints (Section 21)."""
from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.container import get_simulation_registry
from app.core.enums import IncidentStatus
from app.db.models.incident import Incident
from app.db.session import SessionLocal
from app.incidents.correlation import _OPEN_STATUSES
from app.simulation.engine import FAILURE_KINDS, SERVICE_NAMES

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class FailureIn(BaseModel):
    service: str
    kind: str
    severity: float = 0.7
    note: str = ""


@router.get("/services")
async def list_simulated_services():
    sim = get_simulation_registry()
    return sim.snapshot()


@router.post("/failures")
async def inject_failure(payload: FailureIn):
    sim = get_simulation_registry()
    if payload.service not in SERVICE_NAMES:
        raise HTTPException(404, f"Unknown simulated service: {payload.service}. Options: {SERVICE_NAMES}")
    if payload.kind not in FAILURE_KINDS:
        raise HTTPException(400, f"Unknown failure kind: {payload.kind}. Options: {sorted(FAILURE_KINDS)}")
    failure = sim.inject_failure(payload.service, payload.kind, payload.severity, payload.note)

    # Immediately trigger the watcher so an incident is detected and created synchronously
    from app.services.watcher import watcher
    incident = await watcher.trigger_service(payload.service, force=True)

    return {
        "service": payload.service,
        "kind": failure.kind,
        "severity": failure.severity,
        "injected_at": failure.injected_at,
        "incident_id": incident.id if incident else None,
    }


@router.post("/failures/latency")
async def inject_latency(service: str, severity: float = 0.7):
    return await inject_failure(FailureIn(service=service, kind="latency", severity=severity))


@router.post("/failures/database")
async def inject_database(service: str, severity: float = 0.8):
    return await inject_failure(FailureIn(service=service, kind="database", severity=severity))


@router.post("/failures/service-down")
async def inject_service_down(service: str):
    return await inject_failure(FailureIn(service=service, kind="service_down", severity=1.0))


@router.post("/failures/queue")
async def inject_queue(service: str, severity: float = 0.7):
    return await inject_failure(FailureIn(service=service, kind="queue", severity=severity))


@router.post("/reset")
async def reset_simulation(service: str | None = None):
    sim = get_simulation_registry()
    sim.clear_failures(service)

    # Auto-resolve open incidents for the reset service(s)
    async with SessionLocal() as db:
        stmt = select(Incident).where(Incident.status.in_(_OPEN_STATUSES))
        result = await db.execute(stmt)
        open_incidents = result.scalars().all()
        for inc in open_incidents:
            if not service or service in (inc.affected_services or []):
                inc.status = IncidentStatus.RESOLVED
                inc.resolved_at = datetime.now(timezone.utc)
        await db.commit()

    return {"reset": service or "all"}
