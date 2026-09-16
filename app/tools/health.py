from __future__ import annotations

from typing import Any

from app.core.container import get_events_provider, get_metrics_provider, get_simulation_registry
from app.core.enums import RiskLevel, ToolResultStatus
from app.tools.base import Tool, ToolResult


class CheckServiceHealthTool(Tool):
    name = "check_service_health"
    description = "Check current health status of a service."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        sim = get_simulation_registry()
        state = sim.get_service_state(arguments["service"])
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"healthy": state.healthy, "active_failures": [f.kind for f in state.active_failures]},
            affected_resource=arguments["service"],
        )


class CheckDatabaseHealthTool(Tool):
    name = "check_database_health"
    description = "Check database connection pool health for a service."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        metrics = get_metrics_provider()
        current = await metrics.get_current_metrics(arguments["service"])
        used = current["db_connections_used"].value
        maximum = current["db_connections_max"].value
        ratio = used / maximum if maximum else 0
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"connections_used": used, "connections_max": maximum, "utilization": round(ratio, 3)},
            affected_resource=arguments["service"],
        )


class GetRecentDeploymentsTool(Tool):
    name = "get_recent_deployments"
    description = "Fetch recent deployment events for a service."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}, "limit": {"type": "integer"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        events = get_events_provider()
        deployments = await events.get_recent_deployments(arguments["service"], arguments.get("limit", 5))
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"deployments": [
                {"description": d.description, "timestamp": d.timestamp} for d in deployments
            ]},
            affected_resource=arguments["service"],
        )
