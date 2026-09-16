from app.core.enums import RiskLevel
from app.policy.risk import classify


def test_read_only_tool_is_low_risk():
    assert classify("check_service_health") == RiskLevel.LOW


def test_medium_risk_escalates_to_high_in_production():
    assert classify("scale_service", environment="production") == RiskLevel.HIGH


def test_medium_risk_stays_medium_in_staging():
    assert classify("scale_service", environment="staging") == RiskLevel.MEDIUM


def test_unknown_tool_is_high_risk_fail_closed():
    assert classify("nonexistent_tool") == RiskLevel.HIGH
