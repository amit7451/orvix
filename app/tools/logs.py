from __future__ import annotations

from typing import Any

from app.core.container import get_logs_provider
from app.core.enums import RiskLevel, ToolResultStatus
from app.tools.base import Tool, ToolResult


class GetServiceLogsTool(Tool):
    name = "get_service_logs"
    description = "Fetch recent structured application logs for a service."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}, "limit": {"type": "integer"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        provider = get_logs_provider()
        entries = await provider.get_recent_logs(arguments["service"], arguments.get("limit", 50))
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"logs": [{"level": e.level, "message": e.message, "timestamp": e.timestamp} for e in entries]},
            affected_resource=arguments["service"],
        )
