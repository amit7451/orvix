"""Role-based tool permissions (Section 29).

Deterministic table: role -> set of tool names it may ever invoke (before
risk-based approval requirements are even considered).
"""
from __future__ import annotations

from app.core.enums import UserRole

READ_ONLY_TOOLS = {
    "check_service_health",
    "check_database_health",
    "get_recent_deployments",
    "get_service_logs",
    "get_metrics",
    "get_trace",
}

WRITE_TOOLS = {
    "restart_service",
    "restart_pod",
    "scale_service",
    "rollback_deployment",
    "send_engineer_notification",
    "verify_recovery",
}

ROLE_TOOL_PERMISSIONS: dict[UserRole, set[str]] = {
    UserRole.VIEWER: set(READ_ONLY_TOOLS),
    UserRole.ENGINEER: set(READ_ONLY_TOOLS) | {"send_engineer_notification", "verify_recovery"},
    UserRole.SRE: set(READ_ONLY_TOOLS) | set(WRITE_TOOLS),
    UserRole.APPROVER: set(READ_ONLY_TOOLS) | {"send_engineer_notification", "verify_recovery"},
    UserRole.ADMIN: set(READ_ONLY_TOOLS) | set(WRITE_TOOLS),
}

# The autonomous agent itself acts under a fixed service identity, distinct
# from any human role, so a compromised prompt cannot claim ADMIN.
AGENT_IDENTITY_PERMISSIONS: set[str] = set(READ_ONLY_TOOLS) | set(WRITE_TOOLS)


def role_may_use_tool(role: UserRole, tool_name: str) -> bool:
    return tool_name in ROLE_TOOL_PERMISSIONS.get(role, set())


def agent_may_use_tool(tool_name: str) -> bool:
    return tool_name in AGENT_IDENTITY_PERMISSIONS
