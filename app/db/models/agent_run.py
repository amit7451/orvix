from __future__ import annotations

from sqlalchemy import JSON, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AgentStage
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.session import Base


class AgentRun(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One execution of the LangGraph-style ORVIX agent for an incident."""

    __tablename__ = "agent_runs"

    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    current_stage: Mapped[AgentStage] = mapped_column(Enum(AgentStage), default=AgentStage.OBSERVE)
    status: Mapped[str] = mapped_column(String(30), default="RUNNING")  # RUNNING/PAUSED/COMPLETED/FAILED
    state: Mapped[dict] = mapped_column(JSON, default=dict)  # full typed AgentState snapshot
    token_usage: Mapped[int] = mapped_column(default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(default=0.0)
