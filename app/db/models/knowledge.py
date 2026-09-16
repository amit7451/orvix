from __future__ import annotations

from sqlalchemy import JSON, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DocumentApprovalStatus
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class KnowledgeDocument(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "knowledge_documents"

    title: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(255), default="internal")
    document_type: Mapped[str] = mapped_column(String(60), default="runbook")
    service: Mapped[str] = mapped_column(String(120), default="")
    version: Mapped[str] = mapped_column(String(30), default="1.0")
    owner: Mapped[str] = mapped_column(String(120), default="")
    review_date: Mapped[str] = mapped_column(String(30), default="")
    approval_status: Mapped[DocumentApprovalStatus] = mapped_column(
        Enum(DocumentApprovalStatus), default=DocumentApprovalStatus.APPROVED
    )
    tags: Mapped[list] = mapped_column(JSON, default=list)
    content: Mapped[str] = mapped_column(Text)
