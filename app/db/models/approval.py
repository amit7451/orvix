from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ApprovalDecision, RiskLevel
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class ApprovalRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "approval_requests"

    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    action_id: Mapped[str] = mapped_column(String(36))
    risk_level: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel))
    requested_action: Mapped[dict] = mapped_column(JSON, default=dict)
    decision: Mapped[ApprovalDecision] = mapped_column(
        Enum(ApprovalDecision), default=ApprovalDecision.PENDING, index=True
    )
    approver: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reason: Mapped[str] = mapped_column(String(1000), default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
