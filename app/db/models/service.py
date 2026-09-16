from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class Service(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "services"

    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(1000), default="")
    owner_team: Mapped[str] = mapped_column(String(120), default="")
    tier: Mapped[str] = mapped_column(String(20), default="standard")
    tags: Mapped[list] = mapped_column(JSON, default=list)


class ServiceDependency(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "service_dependencies"

    service_id: Mapped[str] = mapped_column(ForeignKey("services.id"), index=True)
    depends_on_service_id: Mapped[str] = mapped_column(ForeignKey("services.id"), index=True)
    dependency_type: Mapped[str] = mapped_column(String(50), default="network")
