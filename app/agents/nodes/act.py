"""ACT stage (Section 15): execute only actions the policy engine allowed.
Denied/rejected actions never silently retry (Section 14)."""
from __future__ import annotations

from app.core.config import settings
from app.core.enums import IncidentStatus, RiskLevel, ToolResultStatus
from app.core.events import EventType, event_bus
from app.db.models.tool_call import RemediationAction, ToolCall
from app.db.session import SessionLocal
from app.incidents.service import incident_service
from app.memory.audit import record as audit_record
from app.tools.registry import tool_registry


async def act(state: dict) -> dict:
    executed_tools = []

    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])
        any_executed = False

        for action in state["proposed_actions"]:
            remediation_row = RemediationAction(
                incident_id=state["incident_id"],
                tool_name=action["tool"],
                target=action["target"],
                reason=action.get("reason", ""),
                risk_level=RiskLevel(action.get("risk_level", RiskLevel.LOW)),
                preconditions=action.get("preconditions", []),
                expected_outcome=action.get("expected_outcome", ""),
                rollback=action.get("rollback", ""),
                verification_criteria=action.get("verification", ""),
                executed=False,
            )
            db.add(remediation_row)
            await db.flush()

            if action.get("authorization") != "ALLOWED":
                await audit_record(db, actor="orvix-agent", action="action.skipped", entity_type="remediation_action",
                                    entity_id=remediation_row.id, details={"reasons": action.get("reasons", [])})
                executed_tools.append({**action, "tool_status": "SKIPPED"})
                continue

            tool = tool_registry.get(action["tool"])
            if tool is None:
                executed_tools.append({**action, "tool_status": "FAILURE", "error": "Tool not found"})
                continue

            await event_bus.publish(EventType.TOOL_STARTED, incident_id=state["incident_id"], tool=action["tool"],
                                      target=action["target"])

            arguments = {"service": action["target"], **action.get("arguments", {})}
            result = await tool.run(arguments, dry_run=settings.dry_run)
            any_executed = any_executed or result.status == ToolResultStatus.SUCCESS

            tool_call_row = ToolCall(
                incident_id=state["incident_id"],
                agent_run_id=state.get("agent_run_id", ""),
                tool_name=action["tool"],
                arguments=arguments,
                result=result.to_dict(),
                status=result.status,
                dry_run=settings.dry_run,
                duration_ms=result.evidence.get("duration_ms", 0.0),
            )
            db.add(tool_call_row)
            remediation_row.executed = result.status == ToolResultStatus.SUCCESS
            await db.flush()

            await audit_record(db, actor="orvix-agent", action="tool.executed", entity_type="tool_call",
                                entity_id=tool_call_row.id,
                                details={"tool": action["tool"], "status": result.status})

            await event_bus.publish(EventType.TOOL_COMPLETED, incident_id=state["incident_id"], tool=action["tool"],
                                      status=result.status, action_id=result.action_id)

            executed_tools.append({**action, "tool_status": result.status, "result": result.to_dict()})

        if incident is not None and any_executed and incident.status in (
            IncidentStatus.AWAITING_APPROVAL, IncidentStatus.DIAGNOSED
        ):
            await incident_service.transition(db, incident, IncidentStatus.REMEDIATING, actor="orvix-agent",
                                                note="Remediation actions executing.")
        await db.commit()

    state["executed_tools"] = executed_tools
    if state["proposed_actions"] and not any_executed:
        # Every proposed action was denied or skipped (e.g. rejected by a
        # human approver). Never silently proceed as if remediation
        # happened - go straight to escalation instead of "verifying"
        # against ambient metrics that were never actually touched.
        state["current_stage"] = "ESCALATE"
    else:
        state["current_stage"] = "VERIFY"
    return state
