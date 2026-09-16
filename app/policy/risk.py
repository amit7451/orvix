"""Risk classification (Section 13).

Risk is a property of the *tool* combined with the *target environment*,
never something the LLM self-assigns. The policy engine is the only
consumer of this module.
"""
from __future__ import annotations

from app.core.enums import RiskLevel
from app.tools.registry import tool_registry

# Environment multipliers: production actions are never safer than staging.
_ENV_ESCALATION = {"production": 1, "staging": 0, "local": 0}


def classify(tool_name: str, environment: str = "production") -> RiskLevel:
    tool = tool_registry.get(tool_name)
    if tool is None:
        return RiskLevel.HIGH  # unknown tool: fail closed
    base = tool.risk_level
    if environment == "production" and base == RiskLevel.MEDIUM:
        return RiskLevel.HIGH
    return base
