"""Short-term memory: the strongly typed state carried through one agent
run (Section 42). Persisted as JSON on `AgentRun.state` so the LangGraph
workflow can pause/resume across an approval wait (Section 14)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from app.core.enums import AgentStage


@dataclass
class AgentState:
    incident_id: str
    affected_services: list[str] = field(default_factory=list)
    severity: str = "MEDIUM"
    symptoms: list[str] = field(default_factory=list)

    telemetry_evidence: dict = field(default_factory=dict)
    candidate_root_causes: list[dict] = field(default_factory=list)
    retrieved_documents: list[dict] = field(default_factory=list)

    diagnosis: str = ""
    confidence: float = 0.0

    proposed_actions: list[dict] = field(default_factory=list)
    risk_level: str = "LOW"
    approval_status: str = "NOT_REQUIRED"

    executed_tools: list[dict] = field(default_factory=list)
    verification_results: list[dict] = field(default_factory=list)

    final_status: str = "IN_PROGRESS"
    audit_events: list[str] = field(default_factory=list)
    current_stage: str = AgentStage.OBSERVE
    retry_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "AgentState":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})
