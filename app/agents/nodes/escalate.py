"""ESCALATE stage: reached when verification keeps failing or an action is
denied without an alternative. Always notifies a human; never retries
silently."""
from __future__ import annotations

from app.core.enums import IncidentStatus
from app.db.session import SessionLocal
from app.incidents.service import incident_service
from app.notifications.service import notification_service


async def escalate(state: dict) -> dict:
    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])
        if incident is not None and incident.status != IncidentStatus.ESCALATED:
            await incident_service.transition(db, incident, IncidentStatus.ESCALATED, actor="orvix-agent",
                                                note="Automated remediation exhausted; escalating to human on-call.")

        await notification_service.notify(
            channel="console",
            subject=f"[ORVIX] ESCALATION required: {incident.title if incident else state['incident_id']}",
            body=(
                f"Diagnosis: {state.get('diagnosis', 'unknown')}\n"
                f"Confidence: {state.get('confidence', 0):.2f}\n"
                f"Verification retries exhausted or action denied. Human investigation required."
            ),
            incident_id=state["incident_id"],
        )

    state["final_status"] = "ESCALATED"
    state["current_stage"] = "DONE"
    return state
