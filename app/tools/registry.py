"""Typed tool registry.

This is the ONLY surface through which the agent (or the API) can invoke
an action. Every tool is registered here with its risk classification;
nothing outside this registry can execute anything (Section 15).
"""
from __future__ import annotations

from app.tools.base import Tool
from app.tools.health import CheckDatabaseHealthTool, CheckServiceHealthTool, GetRecentDeploymentsTool
from app.tools.logs import GetServiceLogsTool
from app.tools.metrics import GetMetricsTool
from app.tools.remediation import (
    RestartPodTool,
    RestartServiceTool,
    RollbackDeploymentTool,
    ScaleServiceTool,
    SendEngineerNotificationTool,
)
from app.tools.traces import GetTraceTool
from app.tools.verification import VerifyRecoveryTool


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}
        for tool_cls in (
            CheckServiceHealthTool,
            CheckDatabaseHealthTool,
            GetRecentDeploymentsTool,
            GetServiceLogsTool,
            GetMetricsTool,
            GetTraceTool,
            RestartServiceTool,
            RestartPodTool,
            ScaleServiceTool,
            RollbackDeploymentTool,
            SendEngineerNotificationTool,
            VerifyRecoveryTool,
        ):
            tool = tool_cls()
            self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def list(self) -> list[Tool]:
        return list(self._tools.values())

    def exists(self, name: str) -> bool:
        return name in self._tools


tool_registry = ToolRegistry()
