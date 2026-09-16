from app.core.enums import PolicyDecision, RiskLevel, UserRole
from app.policy.engine import policy_engine


def test_low_risk_high_confidence_auto_allowed():
    evaluation = policy_engine.evaluate_agent_action("check_service_health", confidence=0.9)
    assert evaluation.decision == PolicyDecision.ALLOW


def test_medium_risk_requires_approval_by_default():
    evaluation = policy_engine.evaluate_agent_action("scale_service", confidence=0.95)
    assert evaluation.decision == PolicyDecision.REQUIRE_APPROVAL


def test_high_risk_always_requires_approval_even_high_confidence():
    # scale_service in production environment is escalated to HIGH by risk.classify
    evaluation = policy_engine.evaluate_agent_action("scale_service", confidence=0.99, environment="production")
    assert evaluation.decision == PolicyDecision.REQUIRE_APPROVAL
    assert evaluation.risk_level == RiskLevel.HIGH


def test_low_confidence_low_risk_still_requires_approval():
    evaluation = policy_engine.evaluate_agent_action("restart_service", confidence=0.2)
    assert evaluation.decision == PolicyDecision.REQUIRE_APPROVAL


def test_unknown_tool_denied_fail_closed():
    evaluation = policy_engine.evaluate_agent_action("drop_database", confidence=0.99)
    assert evaluation.decision == PolicyDecision.DENY


def test_agent_cannot_use_tool_outside_identity_permissions(monkeypatch):
    import app.policy.engine as engine_mod

    monkeypatch.setattr(engine_mod, "agent_may_use_tool", lambda name: False)
    evaluation = policy_engine.evaluate_agent_action("check_service_health", confidence=0.9)
    assert evaluation.decision == PolicyDecision.DENY


def test_viewer_role_cannot_execute_write_tool():
    evaluation = policy_engine.evaluate_human_action(UserRole.VIEWER, "restart_service")
    assert evaluation.decision == PolicyDecision.DENY
