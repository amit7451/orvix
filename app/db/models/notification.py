from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notifications"

    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(30))  # console/webhook/email/slack/teams
    subject: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(String(4000))
    status: Mapped[str] = mapped_column(String(20), default="SENT")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
