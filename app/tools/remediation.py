"""Controlled remediation tools.

Every tool here mutates only the *simulated* infrastructure - there is no
path from the LLM to a real shell, real Kubernetes API, or real database in
this reference implementation. Production versions of these tools would
call the Kubernetes API / cloud provider SDK behind the same interface.
"""
from __future__ import annotations

from typing import Any

from app.core.container import get_simulation_registry
from app.core.enums import RiskLevel, ToolResultStatus
from app.tools.base import Tool, ToolResult

_RESTART_CLEARS = {"service_down", "error_rate", "latency", "database"}
_SCALE_CLEARS = {"cpu", "memory", "queue"}
_ROLLBACK_CLEARS = {"deployment_error", "dependency", "latency", "error_rate"}


class RestartServiceTool(Tool):
    name = "restart_service"
    description = "Restart a service to clear a stuck/crashed process state."
    risk_level = RiskLevel.LOW
    supports_dry_run = True
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        sim = get_simulation_registry()
        service = arguments["service"]
        state = sim.get_service_state(service)
        cleared = [f.kind for f in state.active_failures if f.kind in _RESTART_CLEARS]
        if not dry_run:
            state.active_failures = [f for f in state.active_failures if f.kind not in _RESTART_CLEARS]
            state.tick()
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"cleared_failures": cleared, "dry_run": dry_run, "healthy_after": state.healthy},
            affected_resource=service,
        )


class RestartPodTool(Tool):
    name = "restart_pod"
    description = "Restart a single pod/instance of a service (finer-grained than a full service restart)."
    risk_level = RiskLevel.LOW
    supports_dry_run = True
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}, "pod_id": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        sim = get_simulation_registry()
        service = arguments["service"]
        state = sim.get_service_state(service)
        # Pod-level restart provides partial relief only.
        if not dry_run:
            for f in state.active_failures:
                f.severity = max(0.0, f.severity - 0.4)
            state.active_failures = [f for f in state.active_failures if f.severity > 0.05]
            state.tick()
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"pod_id": arguments.get("pod_id", "auto-selected"), "dry_run": dry_run},
            affected_resource=service,
        )


class ScaleServiceTool(Tool):
    name = "scale_service"
    description = "Scale a service's replica count to relieve resource pressure."
    risk_level = RiskLevel.MEDIUM
    supports_dry_run = True
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}, "replicas": {"type": "integer"}},
        "required": ["service", "replicas"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        sim = get_simulation_registry()
        service = arguments["service"]
        state = sim.get_service_state(service)
        cleared = [f.kind for f in state.active_failures if f.kind in _SCALE_CLEARS]
        if not dry_run:
            state.active_failures = [f for f in state.active_failures if f.kind not in _SCALE_CLEARS]
            state.tick()
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"replicas": arguments["replicas"], "cleared_failures": cleared, "dry_run": dry_run},
            affected_resource=service,
        )


class RollbackDeploymentTool(Tool):
    name = "rollback_deployment"
    description = "Roll back a service's most recent deployment."
    risk_level = RiskLevel.MEDIUM
    supports_dry_run = True
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        sim = get_simulation_registry()
        service = arguments["service"]
        state = sim.get_service_state(service)
        cleared = [f.kind for f in state.active_failures]
        if not dry_run:
            state.active_failures.clear()
            state.tick()
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"rolled_back_to": "previous_stable_version", "cleared_failures": cleared, "dry_run": dry_run},
            affected_resource=service,
        )


class SendEngineerNotificationTool(Tool):
    name = "send_engineer_notification"
    description = "Notify on-call engineers about an incident or action."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {
            "message": {"type": "string"},
            "incident_id": {"type": "string"},
            "channel": {"type": "string"},
        },
        "required": ["message"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        from app.notifications.service import notification_service  # lazy import: avoid cycle

        result = await notification_service.notify(
            channel=arguments.get("channel", "console"),
            subject=f"ORVIX incident {arguments.get('incident_id', '')}".strip(),
            body=arguments["message"],
            incident_id=arguments.get("incident_id"),
        )
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"channel": result["channel"], "delivered": True},
            affected_resource=arguments.get("incident_id"),
        )
