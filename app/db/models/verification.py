from __future__ import annotations

from sqlalchemy import JSON, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class VerificationResult(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "verification_results"

    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    action_id: Mapped[str] = mapped_column(String(36))
    passed: Mapped[bool] = mapped_column(Boolean)
    checks: Mapped[dict] = mapped_column(JSON, default=dict)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
