from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import IncidentStatus, Severity
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class Incident(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "incidents"

    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[Severity] = mapped_column(Enum(Severity), default=Severity.MEDIUM)
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus), default=IncidentStatus.DETECTED, index=True
    )

    affected_services: Mapped[list] = mapped_column(JSON, default=list)
    symptoms: Mapped[list] = mapped_column(JSON, default=list)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    probable_root_cause: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    alternative_causes: Mapped[list] = mapped_column(JSON, default=list)

    remediation_plan: Mapped[dict] = mapped_column(JSON, default=dict)
    verification: Mapped[dict] = mapped_column(JSON, default=dict)

    impact: Mapped[str] = mapped_column(Text, default="")
    owner: Mapped[str] = mapped_column(String(120), default="unassigned")
    correlation_key: Mapped[str] = mapped_column(String(255), default="", index=True)
    duplicate_of: Mapped[str | None] = mapped_column(String(36), nullable=True)

    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IncidentEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Append-only structured timeline entry for one incident (Section 25)."""

    __tablename__ = "incident_events"

    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    stage: Mapped[str] = mapped_column(String(60))
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
