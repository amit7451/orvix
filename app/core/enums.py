"""Shared typed enums used across the ORVIX backend."""
from __future__ import annotations

from enum import StrEnum


class IncidentStatus(StrEnum):
    DETECTED = "DETECTED"
    INVESTIGATING = "INVESTIGATING"
    DIAGNOSED = "DIAGNOSED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    REMEDIATING = "REMEDIATING"
    VERIFYING = "VERIFYING"
    RESOLVED = "RESOLVED"
    ESCALATED = "ESCALATED"
    FAILED = "FAILED"


class Severity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class PolicyDecision(StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


class ApprovalDecision(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    SRE = "SRE"
    ENGINEER = "ENGINEER"
    APPROVER = "APPROVER"
    VIEWER = "VIEWER"


class ToolResultStatus(StrEnum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    DENIED = "DENIED"
    TIMEOUT = "TIMEOUT"


class DocumentApprovalStatus(StrEnum):
    APPROVED = "APPROVED"
    PENDING_REVIEW = "PENDING_REVIEW"
    DEPRECATED = "DEPRECATED"


class AgentStage(StrEnum):
    OBSERVE = "OBSERVE"
    UNDERSTAND = "UNDERSTAND"
    RETRIEVE = "RETRIEVE"
    REASON = "REASON"
    PLAN = "PLAN"
    AUTHORIZE = "AUTHORIZE"
    ACT = "ACT"
    VERIFY = "VERIFY"
    LEARN = "LEARN"
    ESCALATE = "ESCALATE"
    DONE = "DONE"
