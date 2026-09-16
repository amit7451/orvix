"""PLAN stage (Section 11): turn a diagnosis into a structured remediation
plan of typed tool actions with rollback + verification criteria."""
from __future__ import annotations

from app.core.enums import RiskLevel
from app.policy.risk import classify
from app.tools.registry import tool_registry


def _plan_for_cause(cause_text: str, service: str) -> list[dict]:
    text = cause_text.lower()
    actions: list[dict] = []

    if "connection pool exhaustion" in text or "database" in text:
        actions.append({
            "tool": "restart_service", "target": service,
            "reason": "Restarting the service releases leaked/stuck database connections.",
            "preconditions": ["check_database_health confirms pool near saturation"],
            "expected_outcome": "Connection pool utilization drops below 90%.",
            "rollback": "If latency worsens post-restart, escalate to DBA for manual pool inspection.",
            "verification": "verify_recovery confirms latency and error_rate within recovery thresholds.",
        })
    elif "deployment regression" in text or "recent deployment" in text:
        actions.append({
            "tool": "rollback_deployment", "target": service,
            "reason": "Recent deployment correlates with the onset of anomalous behavior.",
            "preconditions": ["a previous stable deployment exists"],
            "expected_outcome": "Service returns to pre-deployment baseline latency/error rate.",
            "rollback": "Re-apply the deployment once root cause in code is fixed and tested.",
            "verification": "verify_recovery confirms recovery thresholds are met.",
        })
    elif "dependency failure" in text or "upstream dependency" in text:
        actions.append({
            "tool": "send_engineer_notification", "target": service,
            "reason": "Root cause is an unhealthy upstream dependency outside this service's control.",
            "preconditions": [],
            "expected_outcome": "On-call engineer is alerted to investigate the dependency directly.",
            "rollback": "N/A - notification only.",
            "verification": "Dependency health check reports healthy.",
        })
    elif "resource pressure" in text:
        actions.append({
            "tool": "scale_service", "target": service,
            "reason": "Resource pressure (CPU/memory/queue) indicates insufficient capacity.",
            "preconditions": ["current replica count below configured maximum"],
            "expected_outcome": "CPU/memory/queue metrics return under threshold after scale-out.",
            "rollback": "Scale back down once load normalizes to avoid overprovisioning cost.",
            "verification": "verify_recovery confirms recovery thresholds are met.",
            "arguments": {"replicas": 4},
        })
    else:
        actions.append({
            "tool": "restart_pod", "target": service,
            "reason": "Generic corrective action for an unclassified anomaly.",
            "preconditions": [],
            "expected_outcome": "Transient anomaly clears after pod restart.",
            "rollback": "Escalate to human investigation if anomaly persists.",
            "verification": "verify_recovery confirms recovery thresholds are met.",
        })

    return actions


async def plan(state: dict) -> dict:
    proposed_actions = []
    services = state["affected_services"] or [state["candidate_root_causes"][0]["service"]] if state["candidate_root_causes"] else []

    primary_service = None
    if state["candidate_root_causes"]:
        primary_service = state["candidate_root_causes"][0].get("service")
    primary_service = primary_service or (services[0] if services else "unknown-service")

    for action in _plan_for_cause(state["diagnosis"], primary_service):
        risk = classify(action["tool"], environment="production")
        proposed_actions.append({
            **action,
            "risk_level": risk,
            "confidence": state["confidence"],
        })

    state["proposed_actions"] = proposed_actions
    state["risk_level"] = max(
        (a["risk_level"] for a in proposed_actions), key=lambda r: list(RiskLevel).index(RiskLevel(r)), default=RiskLevel.LOW
    ) if proposed_actions else RiskLevel.LOW
    state["current_stage"] = "AUTHORIZE"
    return state
