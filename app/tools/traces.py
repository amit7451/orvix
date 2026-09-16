from __future__ import annotations

from typing import Any

from app.core.container import get_traces_provider
from app.core.enums import RiskLevel, ToolResultStatus
from app.tools.base import Tool, ToolResult


def _span_to_dict(span) -> dict:
    return {
        "name": span.name,
        "service": span.service,
        "duration_ms": span.duration_ms,
        "status": span.status,
        "children": [_span_to_dict(c) for c in span.children],
    }


class GetTraceTool(Tool):
    name = "get_trace"
    description = "Fetch a recent distributed trace for a service."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        provider = get_traces_provider()
        span = await provider.get_recent_trace(arguments["service"])
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"trace": _span_to_dict(span)},
            affected_resource=arguments["service"],
        )
