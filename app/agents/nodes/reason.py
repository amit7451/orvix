"""REASON stage (Section 10): evidence-driven root cause analysis.

Deterministic candidate generation always runs first (Section 41: use
deterministic systems for anything that can be deterministic). The result
is handed to the LLM abstraction as the `fallback` - with LLM_PROVIDER=mock
this deterministic analysis *is* the diagnosis; with a real provider
configured, the LLM refines/re-ranks the same evidence but can never
introduce a cause with zero supporting evidence.
"""
from __future__ import annotations

import json

from app.agents.prompts.reasoning import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
from app.core.container import get_llm_client
from app.core.events import EventType, event_bus
from app.db.session import SessionLocal
from app.incidents.service import incident_service


def _generate_candidates(state: dict) -> list[dict]:
    evidence = state["telemetry_evidence"]
    anomalies = evidence.get("anomalies", [])
    unhealthy_deps = evidence.get("unhealthy_dependencies", [])
    per_service = evidence.get("per_service", {})

    candidates: list[dict] = []

    for service, data in per_service.items():
        metrics = data["metrics"]
        used = metrics.get("db_connections_used", 0)
        maximum = metrics.get("db_connections_max", 1) or 1
        if used / maximum > 0.85:
            candidates.append({
                "cause": f"Database connection pool exhaustion on {service} ({used}/{maximum} connections in use).",
                "confidence": round(min(0.95, 0.55 + (used / maximum - 0.85) * 3), 2),
                "supporting_evidence": [f"db_connections_used/max = {used}/{maximum} on {service}"],
                "service": service,
            })
        if data["recent_deployments"] and any(
            a["service"] == service and a["metric"] in ("latency_ms", "error_rate") for a in anomalies
        ):
            candidates.append({
                "cause": f"Recent deployment regression on {service}: {data['recent_deployments'][0]}",
                "confidence": 0.6,
                "supporting_evidence": [f"Recent deployment: {data['recent_deployments'][0]}",
                                          "Anomalous latency/error_rate correlates with deploy time."],
                "service": service,
            })

    for dep in unhealthy_deps:
        candidates.append({
            "cause": f"Upstream dependency failure: {dep['dependency']} is unhealthy, impacting {dep['service']}.",
            "confidence": 0.75,
            "supporting_evidence": [f"{dep['dependency']} health check failing"],
            "service": dep["service"],
        })

    for a in anomalies:
        if a["metric"] in ("cpu_percent", "memory_percent", "queue_depth"):
            candidates.append({
                "cause": f"Resource pressure ({a['metric']}) on {a['service']} causing degraded performance.",
                "confidence": round(min(0.9, a["confidence"]), 2),
                "supporting_evidence": [a["explanation"]],
                "service": a["service"],
            })

    if not candidates and anomalies:
        top = max(anomalies, key=lambda a: a["anomaly_score"])
        candidates.append({
            "cause": f"Unclassified anomaly in {top['metric']} on {top['service']}.",
            "confidence": round(top["confidence"] * 0.7, 2),
            "supporting_evidence": [top["explanation"]],
            "service": top["service"],
        })

    candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates


async def reason(state: dict) -> dict:
    candidates = _generate_candidates(state)
    top = candidates[0] if candidates else None

    fallback = {
        "root_cause": top["cause"] if top else "No clear anomaly detected; insufficient evidence for diagnosis.",
        "confidence": top["confidence"] if top else 0.0,
        "supporting_evidence": top["supporting_evidence"] if top else [],
        "contradictory_evidence": [
            c["cause"] for c in candidates[1:3]
        ] if len(candidates) > 1 else [],
        "alternative_causes": [{"cause": c["cause"], "confidence": c["confidence"]} for c in candidates[1:4]],
        "affected_services": state["affected_services"],
    }

    llm = get_llm_client()
    evidence_block = json.dumps(state["telemetry_evidence"], indent=2)[:4000]
    knowledge_block = "\n".join(f"- {d['title']}: {d['text'][:200]}" for d in state["retrieved_documents"]) or "None"
    history_block = "\n".join(
        f"- {h['title']} (similarity={h['similarity']}): {h['root_cause']}" for h in state.get("similar_incidents", [])
    ) or "None"
    user_prompt = USER_PROMPT_TEMPLATE.format(
        evidence_block=evidence_block, knowledge_block=knowledge_block, history_block=history_block
    )
    diagnosis = await llm.generate_structured(SYSTEM_PROMPT, user_prompt, fallback)

    state["candidate_root_causes"] = candidates
    state["diagnosis"] = diagnosis.get("root_cause", fallback["root_cause"])
    state["confidence"] = float(diagnosis.get("confidence", fallback["confidence"]))
    state["diagnosis_detail"] = diagnosis
    state["current_stage"] = "PLAN"

    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])
        if incident is not None:
            await incident_service.update_fields(
                db, incident,
                probable_root_cause=state["diagnosis"],
                confidence=state["confidence"],
                alternative_causes=[c["cause"] for c in diagnosis.get("alternative_causes", [])],
            )
            from app.core.enums import IncidentStatus
            if incident.status.value == "INVESTIGATING":
                await incident_service.transition(db, incident, IncidentStatus.DIAGNOSED, actor="orvix-agent",
                                                    note=f"Diagnosis: {state['diagnosis']}")
            await db.commit()

    await event_bus.publish(
        EventType.DIAGNOSIS_COMPLETED,
        incident_id=state["incident_id"],
        root_cause=state["diagnosis"],
        confidence=state["confidence"],
    )
    return state
