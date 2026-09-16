"""VERIFY stage (Section 16): verification is independent of whether the
tool reported success. Failure routes to retry-diagnosis / alt-remediation
/ escalate rather than silently marking the incident resolved."""
from __future__ import annotations

from app.core.enums import IncidentStatus
from app.core.events import EventType, event_bus
from app.db.models.verification import VerificationResult
from app.db.session import SessionLocal
from app.incidents.service import incident_service
from app.tools.registry import tool_registry


async def verify(state: dict) -> dict:
    services = state["affected_services"]
    verification_results = []

    await event_bus.publish(EventType.VERIFICATION_STARTED, incident_id=state["incident_id"], services=services)

    tool = tool_registry.get("verify_recovery")

    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])
        if incident is not None and incident.status == IncidentStatus.REMEDIATING:
            await incident_service.transition(db, incident, IncidentStatus.VERIFYING, actor="orvix-agent",
                                                note="Independently verifying recovery.")

        all_passed = True if services else False
        for service in services:
            result = await tool.run({"service": service})
            passed = bool(result.evidence.get("passed", False))
            all_passed = all_passed and passed

            row = VerificationResult(
                incident_id=state["incident_id"],
                action_id=result.action_id,
                passed=passed,
                checks=result.evidence.get("checks", {}),
                evidence=result.evidence,
            )
            db.add(row)
            verification_results.append({"service": service, "passed": passed, "checks": result.evidence.get("checks", {})})

        await db.flush()
        await db.commit()

        incident = await incident_service.get(db, state["incident_id"])
        if incident is not None:
            await incident_service.update_fields(db, incident, verification={"results": verification_results, "passed": all_passed})

    state["verification_results"] = verification_results
    state["retry_count"] = state.get("retry_count", 0)

    if all_passed:
        state["final_status"] = "RESOLVED"
        state["current_stage"] = "LEARN"
    else:
        state["retry_count"] += 1
        if state["retry_count"] >= 2:
            state["final_status"] = "ESCALATED"
            state["current_stage"] = "ESCALATE"
        else:
            state["final_status"] = "IN_PROGRESS"
            state["current_stage"] = "OBSERVE"  # retry diagnosis loop

    await event_bus.publish(
        EventType.VERIFICATION_COMPLETED, incident_id=state["incident_id"], passed=all_passed,
        retry_count=state["retry_count"],
    )
    return state
