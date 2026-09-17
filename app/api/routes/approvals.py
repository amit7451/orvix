from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ApprovalDecision
from app.core.events import EventType, event_bus
from app.db.models.agent_run import AgentRun
from app.db.models.approval import ApprovalRequest
from app.db.session import get_db
from app.memory.audit import record as audit_record
from app.schemas.common import ApprovalDecisionIn, ApprovalOut
from app.services.agent_runner import resume_run

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("", response_model=list[ApprovalOut])
async def list_approvals(
    decision: ApprovalDecision | None = None,
    incident_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc())
    if decision:
        stmt = stmt.where(ApprovalRequest.decision == decision)
    if incident_id:
        stmt = stmt.where(ApprovalRequest.incident_id == incident_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{approval_id}", response_model=ApprovalOut)
async def get_approval(approval_id: str, db: AsyncSession = Depends(get_db)):
    approval = await db.get(ApprovalRequest, approval_id)
    if approval is None:
        raise HTTPException(404, "Approval request not found")
    return approval


async def _decide(approval_id: str, approved: bool, payload: ApprovalDecisionIn, db: AsyncSession) -> ApprovalRequest:
    approval = await db.get(ApprovalRequest, approval_id)
    if approval is None:
        raise HTTPException(404, "Approval request not found")
    if approval.decision != ApprovalDecision.PENDING:
        raise HTTPException(409, f"Approval already decided: {approval.decision}")

    if approval.expires_at and approval.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        approval.decision = ApprovalDecision.EXPIRED
        await db.commit()
        raise HTTPException(410, "Approval request has expired")

    approval.decision = ApprovalDecision.APPROVED if approved else ApprovalDecision.REJECTED
    approval.approver = payload.approver
    approval.reason = payload.reason
    approval.decided_at = datetime.now(timezone.utc)
    await db.flush()

    await audit_record(db, actor=payload.approver, action=f"approval.{approval.decision.lower()}",
                        entity_type="approval_request", entity_id=approval.id,
                        details={"reason": payload.reason, "tool": approval.requested_action.get("tool")})
    await db.commit()
    await db.refresh(approval)

    await event_bus.publish(
        EventType.APPROVAL_APPROVED if approved else EventType.APPROVAL_REJECTED,
        approval_id=approval.id, incident_id=approval.incident_id, approver=payload.approver,
    )

    # Resume the paused agent run for this incident, if one exists.
    result = await db.execute(
        select(AgentRun).where(AgentRun.incident_id == approval.incident_id, AgentRun.status == "PAUSED")
        .order_by(AgentRun.created_at.desc())
    )
    run = result.scalars().first()
    if run is not None:
        await resume_run(db, run, {"approved": approved, "reason": payload.reason})

    return approval


@router.post("/{approval_id}/approve", response_model=ApprovalOut)
async def approve(approval_id: str, payload: ApprovalDecisionIn, db: AsyncSession = Depends(get_db)):
    return await _decide(approval_id, True, payload, db)


@router.post("/{approval_id}/reject", response_model=ApprovalOut)
async def reject(approval_id: str, payload: ApprovalDecisionIn, db: AsyncSession = Depends(get_db)):
    return await _decide(approval_id, False, payload, db)
