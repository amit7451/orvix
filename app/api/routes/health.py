from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": settings.app_name}


@router.get("/ready")
async def ready() -> dict:
    return {"status": "ready", "environment": settings.environment, "llm_provider": settings.llm_provider}
