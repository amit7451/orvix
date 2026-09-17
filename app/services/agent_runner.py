"""Bridges persistent `AgentRun` rows with the in-memory LangGraph engine.

The graph's own checkpointer (MemorySaver) holds the authoritative
mid-run state for pause/resume; this service mirrors a snapshot of that
state into Postgres/SQLite on every start/resume so the state is visible
through the API and survives being queried between runs (Section 26).
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import resume_agent, run_agent
from app.core.enums import AgentStage
from app.core.events import EventType, event_bus
from app.db.models.agent_run import AgentRun
from app.db.models.incident import Incident
from app.memory.audit import record as audit_record

logger = logging.getLogger("orvix.agent.runner")


async def start_run(db: AsyncSession, incident: Incident) -> AgentRun:
    run = AgentRun(incident_id=incident.id, current_stage=AgentStage.OBSERVE, status="RUNNING", state={})
    db.add(run)
    await db.flush()
    await db.commit()
    await db.refresh(run)

    await event_bus.publish(EventType.AGENT_STARTED, incident_id=incident.id, agent_run_id=run.id)

    initial_state = {
        "incident_id": incident.id,
        "agent_run_id": run.id,
        "affected_services": incident.affected_services or [],
        "severity": incident.severity,
        "symptoms": incident.symptoms or [],
        "telemetry_evidence": {},
        "candidate_root_causes": [],
        "retrieved_documents": [],
        "similar_incidents": [],
        "diagnosis": "",
        "confidence": 0.0,
        "proposed_actions": [],
        "risk_level": "LOW",
        "approval_status": "NOT_REQUIRED",
        "executed_tools": [],
        "verification_results": [],
        "final_status": "IN_PROGRESS",
        "audit_events": [],
        "current_stage": AgentStage.OBSERVE,
        "retry_count": 0,
    }

    result = await run_agent(initial_state, thread_id=run.id)
    await _sync_run_from_result(db, run, result)
    return run


async def resume_run(db: AsyncSession, run: AgentRun, decision: dict) -> AgentRun:
    result = await resume_agent(run.id, decision)
    await _sync_run_from_result(db, run, result)
    return run


async def _sync_run_from_result(db: AsyncSession, run: AgentRun, result: dict) -> None:
    interrupts = result.get("__interrupt__")
    if interrupts:
        run.status = "PAUSED"
        run.current_stage = AgentStage.AUTHORIZE
        # `result` here is the state as of the last completed node before the
        # interrupt; merge in the interrupt payload for visibility. Drop the
        # raw `__interrupt__` key - it holds non-JSON-serializable
        # `Interrupt` objects that must never reach the DB column.
        clean_state = {k: v for k, v in result.items() if k != "__interrupt__"}
        run.state = {**clean_state, "pending_interrupt": [i.value for i in interrupts]}
        await audit_record(db, actor="orvix-agent", action="agent_run.paused", entity_type="agent_run",
                            entity_id=run.id, details={"reason": "awaiting_approval"})
    else:
        run.state = result
        run.current_stage = result.get("current_stage", AgentStage.DONE)
        run.status = "COMPLETED" if result.get("final_status") in ("RESOLVED", "ESCALATED") else "RUNNING"
        await audit_record(db, actor="orvix-agent", action="agent_run.updated", entity_type="agent_run",
                            entity_id=run.id, details={"final_status": result.get("final_status")})

    await db.flush()
    await db.commit()
    await db.refresh(run)

    if run.status == "COMPLETED":
        await event_bus.publish(
            EventType.AGENT_COMPLETED,
            incident_id=run.incident_id,
            agent_run_id=run.id,
            status=result.get("final_status", run.status),
            final_stage=run.current_stage,
        )
