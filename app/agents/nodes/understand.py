"""UNDERSTAND stage (Section 6): normalize the incident - affected
services/dependencies, symptoms, severity, impact, duplicate detection."""
from __future__ import annotations

from app.core.enums import IncidentStatus, Severity
from app.db.session import SessionLocal
from app.incidents.service import incident_service


def _derive_severity(anomalies: list[dict]) -> Severity:
    if not anomalies:
        return Severity.LOW
    max_score = max(a["anomaly_score"] for a in anomalies)
    if max_score >= 0.85:
        return Severity.CRITICAL
    if max_score >= 0.6:
        return Severity.HIGH
    if max_score >= 0.3:
        return Severity.MEDIUM
    return Severity.LOW


def _derive_symptoms(anomalies: list[dict]) -> list[str]:
    symptoms = []
    for a in anomalies:
        symptoms.append(f"{a['metric']} elevated on {a['service']} ({a['current_value']:.2f} vs baseline {a['baseline']:.2f})")
    return symptoms


async def understand(state: dict) -> dict:
    anomalies = state["telemetry_evidence"].get("anomalies", [])
    severity = _derive_severity(anomalies)
    symptoms = _derive_symptoms(anomalies) or state.get("symptoms", [])

    unhealthy_dependencies = []
    for service, data in state["telemetry_evidence"]["per_service"].items():
        for dep, healthy in data["dependency_health"].items():
            if not healthy:
                unhealthy_dependencies.append({"service": service, "dependency": dep})

    state["symptoms"] = symptoms
    state["severity"] = severity
    state["telemetry_evidence"]["unhealthy_dependencies"] = unhealthy_dependencies
    state["current_stage"] = "RETRIEVE"

    async with SessionLocal() as db:
        incident = await incident_service.get(db, state["incident_id"])
        if incident is not None:
            impact = (
                f"{len(state['affected_services'])} service(s) impacted; "
                f"{len(anomalies)} anomalous signal(s); "
                f"{len(unhealthy_dependencies)} unhealthy dependency link(s)."
            )
            await incident_service.update_fields(
                db, incident, severity=severity, symptoms=symptoms,
                evidence=state["telemetry_evidence"], impact=impact,
            )
            if incident.status == IncidentStatus.DETECTED:
                await incident_service.transition(db, incident, IncidentStatus.INVESTIGATING, actor="orvix-agent",
                                                    note="Evidence normalized; investigation started.")
            await incident_service.add_event(db, incident, "UNDERSTAND",
                                              f"Normalized incident: severity={severity}, symptoms={len(symptoms)}.")
            await db.commit()

    return state
