"""Incident status lifecycle (Section 18): validated transitions only."""
from __future__ import annotations

from app.core.enums import IncidentStatus

ALLOWED_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    IncidentStatus.DETECTED: {IncidentStatus.INVESTIGATING, IncidentStatus.ESCALATED},
    IncidentStatus.INVESTIGATING: {IncidentStatus.DIAGNOSED, IncidentStatus.ESCALATED, IncidentStatus.FAILED},
    IncidentStatus.DIAGNOSED: {
        IncidentStatus.AWAITING_APPROVAL,
        IncidentStatus.REMEDIATING,
        IncidentStatus.ESCALATED,
    },
    IncidentStatus.AWAITING_APPROVAL: {
        IncidentStatus.REMEDIATING,
        IncidentStatus.ESCALATED,
        IncidentStatus.FAILED,
    },
    IncidentStatus.REMEDIATING: {IncidentStatus.VERIFYING, IncidentStatus.ESCALATED, IncidentStatus.FAILED},
    IncidentStatus.VERIFYING: {
        IncidentStatus.RESOLVED,
        IncidentStatus.INVESTIGATING,  # verification failed -> retry diagnosis
        IncidentStatus.REMEDIATING,    # verification failed -> try approved alt remediation
        IncidentStatus.ESCALATED,
    },
    IncidentStatus.RESOLVED: set(),
    IncidentStatus.ESCALATED: {IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED},
    IncidentStatus.FAILED: {IncidentStatus.INVESTIGATING, IncidentStatus.ESCALATED},
}


class InvalidTransitionError(Exception):
    pass


def validate_transition(current: IncidentStatus, target: IncidentStatus) -> None:
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise InvalidTransitionError(f"Cannot transition incident from {current} to {target}.")
