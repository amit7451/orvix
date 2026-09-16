"""AUTHORIZE stage (Section 12, Section 14).

The policy engine - not the LLM - decides ALLOW / DENY / REQUIRE_APPROVAL
for every proposed action. When approval is required, this node creates an
`ApprovalRequest` row and calls `interrupt()`, which pauses the LangGraph
run. A human decision later resumes the graph via `Command(resume=...)`
(see `app/agents/graph.py` and `app/api/routes/approvals.py`).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from langgraph.types import interrupt
from sqlalchemy import select

from app.core.config import settings
from app.core.enums import ApprovalDecision, IncidentStatus, PolicyDecision
from app.core.events import EventType, event_bus
from app.db.models.approval import ApprovalRequest
from app.db.session import SessionLocal
from app.incidents.service import incident_service
from app.memory.audit import record as audit_record
from app.policy.engine import policy_engine


async def authorize(state: dict) -> dict:
    decided_actions = []

    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])

        for action in state["proposed_actions"]:
            evaluation = policy_engine.evaluate_agent_action(
                tool_name=action["tool"],
                confidence=action.get("confidence", state["confidence"]),
                environment="production",
                preconditions_met=True,
            )

            if evaluation.decision == PolicyDecision.DENY:
                decided_actions.append({**action, "authorization": "DENIED", "reasons": evaluation.reasons})
                continue

            if evaluation.decision == PolicyDecision.ALLOW:
                decided_actions.append({**action, "authorization": "ALLOWED", "reasons": evaluation.reasons})
                continue

            # REQUIRE_APPROVAL: find-or-create the approval request (idempotent,
            # since interrupt() re-runs this node from the top on resume).
            existing = await db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.incident_id == state["incident_id"],
                    ApprovalRequest.action_id == action.get("action_id", action["tool"] + ":" + action["target"]),
                )
            )
            row = existing.scalars().first()

            if row is None:
                approval = ApprovalRequest(
                    incident_id=state["incident_id"],
                    action_id=action.get("action_id", action["tool"] + ":" + action["target"]),
                    risk_level=evaluation.risk_level,
                    requested_action=action,
                    decision=ApprovalDecision.PENDING,
                    expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.approval_timeout_seconds),
                )
                db.add(approval)
                await db.flush()
                await audit_record(db, actor="orvix-policy-engine", action="approval.requested",
                                    entity_type="approval_request", entity_id=approval.id,
                                    details={"tool": action["tool"], "risk": evaluation.risk_level})
                if incident is not None and incident.status != IncidentStatus.AWAITING_APPROVAL:
                    await incident_service.transition(db, incident, IncidentStatus.AWAITING_APPROVAL,
                                                        actor="orvix-agent", note="Awaiting human approval.")
                await db.commit()
                approval_id = approval.id
                await event_bus.publish(
                    EventType.APPROVAL_REQUESTED, incident_id=state["incident_id"],
                    approval_id=approval_id, tool=action["tool"], risk_level=evaluation.risk_level,
                )
            else:
                approval_id = row.id

            # Pause the graph here. Resuming with Command(resume=decision_dict)
            # makes `interrupt()` return that dict on the re-run of this node.
            decision = interrupt(
                {
                    "type": "approval_required",
                    "incident_id": state["incident_id"],
                    "approval_id": approval_id,
                    "tool": action["tool"],
                    "target": action["target"],
                    "risk_level": evaluation.risk_level,
                    "reasons": evaluation.reasons,
                }
            )

            approved = bool(decision and decision.get("approved"))
            decided_actions.append({
                **action,
                "authorization": "ALLOWED" if approved else "DENIED",
                "reasons": [decision.get("reason", "")] if decision else ["No decision recorded."],
                "approval_id": approval_id,
            })

    state["proposed_actions"] = decided_actions
    state["approval_status"] = "RESOLVED"
    state["current_stage"] = "ACT"
    return state
