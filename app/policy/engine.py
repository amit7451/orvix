"""Policy engine (Section 12).

This is the single authority that decides whether a proposed action may
run. The LLM proposes; this module decides. It is pure, deterministic,
and has no dependency on the LLM layer at all - it can be unit tested in
complete isolation (Section 35).
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings
from app.core.enums import PolicyDecision, RiskLevel, UserRole
from app.policy.permissions import agent_may_use_tool, role_may_use_tool
from app.policy.risk import classify
from app.tools.registry import tool_registry

# Risk level -> whether human approval is required by default.
DEFAULT_APPROVAL_REQUIREMENT: dict[RiskLevel, bool] = {
    RiskLevel.LOW: False,
    RiskLevel.MEDIUM: True,
    RiskLevel.HIGH: True,
}


@dataclass
class PolicyEvaluation:
    decision: PolicyDecision
    risk_level: RiskLevel
    reasons: list[str]


class PolicyEngine:
    def evaluate_agent_action(
        self,
        tool_name: str,
        confidence: float,
        environment: str = "production",
        preconditions_met: bool = True,
    ) -> PolicyEvaluation:
        """Evaluate an action the autonomous agent itself wants to take."""
        reasons: list[str] = []

        if not tool_registry.exists(tool_name):
            return PolicyEvaluation(PolicyDecision.DENY, RiskLevel.HIGH, ["Unknown tool: fail closed."])

        if not agent_may_use_tool(tool_name):
            return PolicyEvaluation(
                PolicyDecision.DENY, RiskLevel.HIGH, [f"Agent identity is not permitted to use '{tool_name}'."]
            )

        risk = classify(tool_name, environment)

        if not preconditions_met:
            return PolicyEvaluation(PolicyDecision.DENY, risk, ["Preconditions for this action were not met."])

        if not settings.enable_auto_remediation:
            return PolicyEvaluation(
                PolicyDecision.REQUIRE_APPROVAL, risk, ["Auto-remediation is disabled by configuration."]
            )

        if settings.dry_run:
            reasons.append("DRY_RUN is enabled: action will be simulated, not executed.")

        requires_approval = DEFAULT_APPROVAL_REQUIREMENT.get(risk, True)

        if risk == RiskLevel.HIGH:
            reasons.append("High-risk action always requires explicit human approval.")
            return PolicyEvaluation(PolicyDecision.REQUIRE_APPROVAL, risk, reasons)

        if risk == RiskLevel.MEDIUM and requires_approval:
            reasons.append("Medium-risk action requires human approval by default policy.")
            return PolicyEvaluation(PolicyDecision.REQUIRE_APPROVAL, risk, reasons)

        if confidence < 0.6:
            reasons.append(f"Diagnosis confidence {confidence:.2f} below auto-execute threshold (0.60).")
            return PolicyEvaluation(PolicyDecision.REQUIRE_APPROVAL, risk, reasons)

        reasons.append("Low-risk, high-confidence action, auto-remediation enabled: allowed.")
        return PolicyEvaluation(PolicyDecision.ALLOW, risk, reasons)

    def evaluate_human_action(
        self, role: UserRole, tool_name: str, environment: str = "production"
    ) -> PolicyEvaluation:
        """Evaluate an action a human (via API) wants to take directly."""
        if not tool_registry.exists(tool_name):
            return PolicyEvaluation(PolicyDecision.DENY, RiskLevel.HIGH, ["Unknown tool: fail closed."])

        if not role_may_use_tool(role, tool_name):
            return PolicyEvaluation(
                PolicyDecision.DENY, RiskLevel.HIGH, [f"Role {role} is not permitted to use '{tool_name}'."]
            )

        risk = classify(tool_name, environment)
        if risk in (RiskLevel.MEDIUM, RiskLevel.HIGH) and role not in (UserRole.ADMIN, UserRole.SRE):
            return PolicyEvaluation(
                PolicyDecision.REQUIRE_APPROVAL, risk, ["Elevated risk action requires approver sign-off."]
            )
        return PolicyEvaluation(PolicyDecision.ALLOW, risk, ["Permitted for role."])


policy_engine = PolicyEngine()
