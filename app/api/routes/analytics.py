"""Analytics endpoints (Section 36)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import IncidentStatus, ToolResultStatus
from app.db.models.incident import Incident
from app.db.models.tool_call import ToolCall
from app.db.models.verification import VerificationResult
from app.db.session import get_db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count(Incident.id)))).scalar_one()
    active = (await db.execute(
        select(func.count(Incident.id)).where(Incident.status.notin_([IncidentStatus.RESOLVED, IncidentStatus.FAILED]))
    )).scalar_one()
    resolved = (await db.execute(select(func.count(Incident.id)).where(Incident.status == IncidentStatus.RESOLVED))).scalar_one()
    escalated = (await db.execute(select(func.count(Incident.id)).where(Incident.status == IncidentStatus.ESCALATED))).scalar_one()

    return {"total_incidents": total, "active_incidents": active, "resolved_incidents": resolved,
            "escalated_incidents": escalated}


@router.get("/incidents")
async def incident_analytics(db: AsyncSession = Depends(get_db)):
    resolved = (await db.execute(
        select(Incident).where(Incident.status == IncidentStatus.RESOLVED, Incident.resolved_at.is_not(None))
    )).scalars().all()

    if resolved:
        mttr_seconds = [
            (i.resolved_at - i.detected_at).total_seconds() for i in resolved if i.resolved_at and i.detected_at
        ]
        mttr_avg = round(sum(mttr_seconds) / len(mttr_seconds), 1) if mttr_seconds else None
        confidence_avg = round(sum(i.confidence for i in resolved) / len(resolved), 3)
    else:
        mttr_avg = None
        confidence_avg = None

    by_severity: dict[str, int] = {}
    for i in resolved:
        by_severity[i.severity] = by_severity.get(i.severity, 0) + 1

    return {
        "mttr_seconds_avg": mttr_avg,
        "diagnosis_confidence_avg": confidence_avg,
        "resolved_by_severity": by_severity,
        "sample_size": len(resolved),
    }


@router.get("/reliability")
async def reliability_analytics(db: AsyncSession = Depends(get_db)):
    tool_calls = (await db.execute(select(ToolCall))).scalars().all()
    total_tools = len(tool_calls)
    failed_tools = len([t for t in tool_calls if t.status == ToolResultStatus.FAILURE])
    tool_failure_rate = round(failed_tools / total_tools, 3) if total_tools else 0.0

    verifications = (await db.execute(select(VerificationResult))).scalars().all()
    total_verifications = len(verifications)
    failed_verifications = len([v for v in verifications if not v.passed])
    verification_failure_rate = round(failed_verifications / total_verifications, 3) if total_verifications else 0.0

    total_incidents = (await db.execute(select(func.count(Incident.id)))).scalar_one()
    auto_resolved = (await db.execute(
        select(func.count(Incident.id)).where(Incident.status == IncidentStatus.RESOLVED)
    )).scalar_one()
    automation_rate = round(auto_resolved / total_incidents, 3) if total_incidents else 0.0

    return {
        "tool_failure_rate": tool_failure_rate,
        "verification_failure_rate": verification_failure_rate,
        "automation_rate": automation_rate,
        "total_tool_calls": total_tools,
        "total_verifications": total_verifications,
    }
