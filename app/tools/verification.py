"""Independent verification tool.

Verification is deliberately decoupled from whether a remediation tool
*reported* success (Section 16): it re-reads live telemetry and checks it
against recovery criteria.
"""
from __future__ import annotations

from typing import Any

from app.core.container import get_metrics_provider
from app.core.enums import RiskLevel, ToolResultStatus
from app.tools.base import Tool, ToolResult

RECOVERY_CRITERIA = {
    "latency_ms": 300.0,       # must be below
    "error_rate": 0.05,        # must be below
}


class VerifyRecoveryTool(Tool):
    name = "verify_recovery"
    description = "Independently verify that a service has recovered after remediation."
    risk_level = RiskLevel.LOW
    input_schema = {
        "type": "object",
        "properties": {"service": {"type": "string"}},
        "required": ["service"],
    }

    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult:
        provider = get_metrics_provider()
        service = arguments["service"]
        current = await provider.get_current_metrics(service)

        checks = {}
        for metric, limit in RECOVERY_CRITERIA.items():
            value = current[metric].value
            checks[metric] = {"value": value, "limit": limit, "passed": value < limit}

        db_used = current["db_connections_used"].value
        db_max = current["db_connections_max"].value
        checks["db_connection_pressure"] = {
            "value": db_used / db_max if db_max else 0,
            "limit": 0.9,
            "passed": (db_used / db_max if db_max else 0) < 0.9,
        }

        passed = all(c["passed"] for c in checks.values())
        return ToolResult(
            status=ToolResultStatus.SUCCESS,
            evidence={"passed": passed, "checks": checks},
            affected_resource=service,
        )
