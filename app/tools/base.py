"""Typed tool base class shared by every ORVIX tool.

Hard safety rule (Section 15): tools are typed, schema-validated,
individually risk-classified, and NEVER give the model arbitrary shell or
command execution. Every tool call produces a structured, auditable
result - never raw stdout.
"""
from __future__ import annotations

import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.core.enums import RiskLevel, ToolResultStatus


@dataclass
class ToolResult:
    status: ToolResultStatus
    evidence: dict[str, Any]
    affected_resource: str | None
    action_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "evidence": self.evidence,
            "timestamp": self.timestamp,
            "affected_resource": self.affected_resource,
            "action_id": self.action_id,
            "error": self.error,
        }


class Tool(ABC):
    name: str
    description: str
    risk_level: RiskLevel
    input_schema: dict[str, Any]
    supports_dry_run: bool = False
    timeout_seconds: float = 10.0

    @abstractmethod
    async def _execute(self, arguments: dict[str, Any], *, dry_run: bool) -> ToolResult: ...

    def validate_arguments(self, arguments: dict[str, Any]) -> list[str]:
        """Minimal required-field validation against input_schema."""
        errors = []
        for field_name, spec in self.input_schema.get("properties", {}).items():
            if field_name in self.input_schema.get("required", []) and field_name not in arguments:
                errors.append(f"Missing required argument: {field_name}")
        return errors

    async def run(self, arguments: dict[str, Any], *, dry_run: bool = False) -> ToolResult:
        errors = self.validate_arguments(arguments)
        if errors:
            return ToolResult(
                status=ToolResultStatus.FAILURE,
                evidence={},
                affected_resource=arguments.get("service") or arguments.get("target"),
                error="; ".join(errors),
            )
        start = time.monotonic()
        try:
            result = await self._execute(arguments, dry_run=dry_run)
        except Exception as exc:  # noqa: BLE001 - tool failures must never crash the agent
            result = ToolResult(
                status=ToolResultStatus.FAILURE,
                evidence={},
                affected_resource=arguments.get("service") or arguments.get("target"),
                error=str(exc),
            )
        result.evidence.setdefault("duration_ms", round((time.monotonic() - start) * 1000, 2))
        return result
