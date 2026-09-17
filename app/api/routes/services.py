from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.service import Service
from app.db.session import get_db
from app.schemas.common import ServiceCreate, ServiceOut

router = APIRouter(prefix="/api/services", tags=["services"])


@router.get("", response_model=list[ServiceOut])
async def list_services(db: AsyncSession = Depends(get_db)) -> list[Service]:
    result = await db.execute(select(Service).order_by(Service.name))
    return list(result.scalars().all())


from app.core.container import get_simulation_registry


@router.get("/{service_identifier}")
async def get_service(service_identifier: str, db: AsyncSession = Depends(get_db)):
    service = await db.get(Service, service_identifier)
    if service is None:
        result = await db.execute(select(Service).where(Service.name == service_identifier))
        service = result.scalar_one_or_none()
    if service is None:
        sim = get_simulation_registry()
        if service_identifier in sim.services:
            return {
                "id": service_identifier,
                "name": service_identifier,
                "description": f"Core infrastructure service {service_identifier}",
                "owner_team": "platform",
                "tier": "tier-1" if service_identifier in ("payment-service", "auth-service") else "standard",
                "tags": ["production", "microservice"],
                "created_at": "2026-09-17T00:00:00Z",
                "updated_at": "2026-09-17T00:00:00Z",
            }
        raise HTTPException(404, f"Service '{service_identifier}' not found")
    return service


@router.get("/{service_identifier}/detail")
async def get_service_detail(service_identifier: str, db: AsyncSession = Depends(get_db)):
    service_record = await db.get(Service, service_identifier)
    if service_record is None:
        result = await db.execute(select(Service).where(Service.name == service_identifier))
        service_record = result.scalar_one_or_none()

    service_name = service_record.name if service_record else service_identifier
    sim = get_simulation_registry()
    sim_detail = sim.get_service_detail(service_name)

    metadata = {
        "id": service_record.id if service_record else service_name,
        "name": service_name,
        "description": service_record.description if service_record and service_record.description else f"Core microservice managing {service_name.replace('-service', '')} workflows.",
        "owner_team": service_record.owner_team if service_record and service_record.owner_team else "platform",
        "tier": service_record.tier if service_record and service_record.tier else ("tier-1" if service_name in ("payment-service", "auth-service") else "standard"),
        "tags": service_record.tags if service_record and service_record.tags else ["production", "telemetry-enabled"],
    }

    return {
        "service": metadata,
        "telemetry": {
            "healthy": sim_detail["healthy"],
            "latency_ms": sim_detail["latency_ms"],
            "error_rate": sim_detail["error_rate"],
            "throughput_rps": sim_detail["throughput_rps"],
            "cpu_percent": sim_detail["cpu_percent"],
            "memory_percent": sim_detail["memory_percent"],
            "db_connections_used": sim_detail["db_connections_used"],
            "db_connections_max": sim_detail["db_connections_max"],
            "queue_depth": sim_detail["queue_depth"],
        },
        "active_failures": sim_detail["active_failures"],
        "history": sim_detail["history"],
        "dependencies": sim_detail["dependencies"],
        "logs": sim_detail["logs"],
        "events": sim_detail["events"],
    }


@router.post("", response_model=ServiceOut, status_code=201)
async def create_service(payload: ServiceCreate, db: AsyncSession = Depends(get_db)) -> Service:
    service = Service(**payload.model_dump())
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return service
