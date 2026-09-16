import pytest

from app.core.enums import IncidentStatus
from app.incidents.correlation import build_correlation_key
from app.incidents.lifecycle import InvalidTransitionError, validate_transition


def test_valid_transition_passes():
    validate_transition(IncidentStatus.DETECTED, IncidentStatus.INVESTIGATING)


def test_invalid_transition_raises():
    with pytest.raises(InvalidTransitionError):
        validate_transition(IncidentStatus.DETECTED, IncidentStatus.RESOLVED)


def test_resolved_is_terminal():
    with pytest.raises(InvalidTransitionError):
        validate_transition(IncidentStatus.RESOLVED, IncidentStatus.INVESTIGATING)


def test_correlation_key_stable_for_same_service_and_symptom_type():
    key1 = build_correlation_key(["payment-service"], ["latency_ms elevated on payment-service (600 vs 120)"])
    key2 = build_correlation_key(["payment-service"], ["latency_ms elevated on payment-service (720 vs 120)"])
    assert key1 == key2


def test_correlation_key_differs_for_different_services():
    key1 = build_correlation_key(["payment-service"], ["latency_ms elevated"])
    key2 = build_correlation_key(["auth-service"], ["latency_ms elevated"])
    assert key1 != key2
