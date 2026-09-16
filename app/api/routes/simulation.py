"""Simulated backend environment control endpoints (Section 21)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.container import get_simulation_registry
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
    return {"service": payload.service, "kind": failure.kind, "severity": failure.severity, "injected_at": failure.injected_at}


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
    return {"reset": service or "all"}
