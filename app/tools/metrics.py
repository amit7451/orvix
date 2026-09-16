from __future__ import annotations

from typing import Any

from app.core.container import get_metrics_provider
from app.core.enums import RiskLevel, ToolResultStatus
from app.tools.base import Tool, ToolResult


class GetMetricsTool(Tool):
    name = "get_metrics"
    description = "Fetch current metric snapshot for a service."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        provider = get_metrics_provider()
        metrics = await provider.get_current_metrics(arguments["service"])
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={k: v.value for k, v in metrics.items()},
            affected_resource=arguments["service"],
        )
