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


@router.get("/{service_id}", response_model=ServiceOut)
async def get_service(service_id: str, db: AsyncSession = Depends(get_db)) -> Service:
    service = await db.get(Service, service_id)
    if service is None:
        raise HTTPException(404, "Service not found")
    return service


@router.post("", response_model=ServiceOut, status_code=201)
async def create_service(payload: ServiceCreate, db: AsyncSession = Depends(get_db)) -> Service:
    service = Service(**payload.model_dump())
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return service
