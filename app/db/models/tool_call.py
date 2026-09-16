from __future__ import annotations

from sqlalchemy import JSON, Enum, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import RiskLevel, ToolResultStatus
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class ToolCall(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tool_calls"

    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    agent_run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    tool_name: Mapped[str] = mapped_column(String(80))
    arguments: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[ToolResultStatus] = mapped_column(Enum(ToolResultStatus))
    dry_run: Mapped[bool] = mapped_column(default=False)
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0)


class RemediationAction(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "remediation_actions"

    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    tool_name: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(255))
    reason: Mapped[str] = mapped_column(String(1000), default="")
    risk_level: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel))
    preconditions: Mapped[list] = mapped_column(JSON, default=list)
    expected_outcome: Mapped[str] = mapped_column(String(1000), default="")
    rollback: Mapped[str] = mapped_column(String(1000), default="")
    verification_criteria: Mapped[str] = mapped_column(String(1000), default="")
    executed: Mapped[bool] = mapped_column(default=False)
