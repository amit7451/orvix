"""LEARN stage (Section 17): record the resolved incident into long-term
memory (it's simply a resolved `Incident` row, queryable by
`find_similar_incidents` for future incidents), notify engineers, and
close out the agent run."""
from __future__ import annotations

from app.core.enums import IncidentStatus
from app.db.session import SessionLocal
from app.incidents.service import incident_service
from app.notifications.service import notification_service


async def learn(state: dict) -> dict:
    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])
        if incident is not None:
            plan_summary = {
                "root_cause": state["diagnosis"],
                "confidence": state["confidence"],
                "actions": [
                    {"tool": a["tool"], "target": a["target"], "authorization": a.get("authorization")}
                    for a in state["proposed_actions"]
                ],
            }
            await incident_service.update_fields(db, incident, remediation_plan=plan_summary)
            if incident.status != IncidentStatus.RESOLVED:
                await incident_service.transition(db, incident, IncidentStatus.RESOLVED, actor="orvix-agent",
                                                    note="Independent verification passed; incident resolved.")
            await incident_service.add_event(
                db, incident, "LEARN",
                "Incident resolution consolidated into long-term organizational memory. Post-incident notifications dispatched.",
                data={"plan_summary": plan_summary, "status": "RESOLVED"}
            )
            await db.commit()

        await notification_service.notify(
            channel="console",
            subject=f"[ORVIX] Incident resolved: {incident.title if incident else state['incident_id']}",
            body=(
                f"Root cause: {state['diagnosis']}\n"
                f"Confidence: {state['confidence']:.2f}\n"
                f"Actions taken: {[a['tool'] for a in state['proposed_actions'] if a.get('authorization') == 'ALLOWED']}\n"
                f"Verification: PASSED"
            ),
            incident_id=state["incident_id"],
        )

    state["final_status"] = "RESOLVED"
    state["current_stage"] = "DONE"
    return state
