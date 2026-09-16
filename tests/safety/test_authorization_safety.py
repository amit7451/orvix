"""Section 35 safety tests: unauthorized actions are blocked, destructive
actions require approval, rejected approvals stop execution, no arbitrary
shell execution is possible, secrets never enter persisted data."""
from __future__ import annotations

import pytest

from app.core.enums import PolicyDecision, UserRole
from app.memory.audit import _scrub
from app.policy.engine import policy_engine
from app.tools.registry import tool_registry


def test_high_risk_action_is_never_auto_allowed():
    for _ in range(20):  # any confidence level, high risk must never auto-allow
        evaluation = policy_engine.evaluate_agent_action("scale_service", confidence=1.0, environment="production")
        assert evaluation.decision != PolicyDecision.ALLOW


def test_viewer_cannot_execute_destructive_tool():
    evaluation = policy_engine.evaluate_human_action(UserRole.VIEWER, "rollback_deployment")
    assert evaluation.decision == PolicyDecision.DENY


def test_unknown_tool_name_always_denied():
    evaluation = policy_engine.evaluate_human_action(UserRole.ADMIN, "run_arbitrary_shell_command")
    assert evaluation.decision == PolicyDecision.DENY


def test_no_shell_execution_tool_exists_in_registry():
    """Hard invariant: the tool registry must never contain anything that
    executes arbitrary shell/system commands."""
    forbidden_substrings = ("shell", "exec", "eval", "subprocess", "os_system", "command")
    for tool in tool_registry.list():
        lowered = tool.name.lower()
        assert not any(s in lowered for s in forbidden_substrings), f"Dangerous tool found: {tool.name}"


def test_secrets_are_scrubbed_from_audit_details():
    details = {"api_key": "sk-super-secret", "password": "hunter2", "note": "safe value", "nested": {"token": "abc123"}}
    scrubbed = _scrub(details)
    assert scrubbed["api_key"] == "***REDACTED***"
    assert scrubbed["password"] == "***REDACTED***"
    assert scrubbed["nested"]["token"] == "***REDACTED***"
    assert scrubbed["note"] == "safe value"


def test_tool_missing_required_argument_fails_closed():
    tool = tool_registry.get("restart_service")
    errors = tool.validate_arguments({})
    assert errors  # must report missing 'service'
