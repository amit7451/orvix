"""OBSERVE stage (Section 5): gather metrics, logs, traces, health,
deployments and dependency status into an evidence package."""
from __future__ import annotations

import asyncio
import logging

from app.db.session import SessionLocal
from app.incidents.service import incident_service

from app.core.container import (
    get_anomaly_detector,
    get_events_provider,
    get_logs_provider,
    get_metrics_provider,
    get_simulation_registry,
    get_traces_provider,
)
from app.core.events import EventType, event_bus

logger = logging.getLogger("orvix.agent.observe")


async def observe(state: dict) -> dict:
    services = state["affected_services"] or []
    metrics_provider = get_metrics_provider()
    logs_provider = get_logs_provider()
    traces_provider = get_traces_provider()
    events_provider = get_events_provider()
    detector = get_anomaly_detector()
    sim = get_simulation_registry()

    evidence: dict = {}
    anomalies: list[dict] = []

    for service in services:
        current = await metrics_provider.get_current_metrics(service)
        metric_values = {}
        for name, point in current.items():
            metric_values[name] = point.value
            if name in ("latency_ms", "error_rate", "cpu_percent", "memory_percent", "queue_depth"):
                baseline = await metrics_provider.get_baseline(service, name)
                anomaly = detector.evaluate(service, name, point.value, baseline)
                if anomaly:
                    anomalies.append(
                        {
                            "service": service,
                            "metric": name,
                            "current_value": anomaly.current_value,
                            "baseline": anomaly.baseline,
                            "anomaly_score": anomaly.anomaly_score,
                            "confidence": anomaly.confidence,
                            "explanation": anomaly.explanation,
                        }
                    )

        logs = await logs_provider.get_recent_logs(service, limit=20)
        trace = await traces_provider.get_recent_trace(service)
        deployments = await events_provider.get_recent_deployments(service, limit=3)
        dependencies = sim.dependencies_of(service)
        dependency_health = {dep: sim.get_service_state(dep).healthy for dep in dependencies}

        evidence[service] = {
            "metrics": metric_values,
            "logs": [{"level": l.level, "message": l.message} for l in logs],
            "trace_status": trace.status,
            "trace_duration_ms": trace.duration_ms,
            "recent_deployments": [d.description for d in deployments],
            "dependencies": dependencies,
            "dependency_health": dependency_health,
        }

    state["telemetry_evidence"] = {"per_service": evidence, "anomalies": anomalies}
    state["current_stage"] = "UNDERSTAND"

    await event_bus.publish(
        EventType.EVIDENCE_COLLECTED,
        incident_id=state["incident_id"],
        services=services,
        anomaly_count=len(anomalies),
    )
    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])
        if incident:
            await incident_service.add_event(
                db, 
                incident, 
                "OBSERVE", 
                "I am gathering live telemetry (metrics, logs, traces) for the affected services.", 
                data=evidence
            )
            
    await asyncio.sleep(1.5)
    return state
