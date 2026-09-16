from __future__ import annotations

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.mixins import UUIDPrimaryKeyMixin, utcnow
from app.db.session import Base


class AuditLog(Base, UUIDPrimaryKeyMixin):
    """Append-only audit trail. Never updated, never deleted."""

    __tablename__ = "audit_logs"

    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(120))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str] = mapped_column(String(36))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
