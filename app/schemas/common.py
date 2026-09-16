from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.enums import ApprovalDecision, RiskLevel, ToolResultStatus


class ServiceCreate(BaseModel):
    name: str
    description: str = ""
    owner_team: str = ""
    tier: str = "standard"
    tags: list[str] = []


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str
    owner_team: str
    tier: str
    tags: list[str]


class ApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    incident_id: str
    action_id: str
    risk_level: RiskLevel
    requested_action: dict
    decision: ApprovalDecision
    approver: str | None
    reason: str
    expires_at: datetime | None
    decided_at: datetime | None
    created_at: datetime


class ApprovalDecisionIn(BaseModel):
    approver: str
    reason: str = ""


class ToolOut(BaseModel):
    name: str
    description: str
    risk_level: RiskLevel
    input_schema: dict


class ToolExecuteIn(BaseModel):
    arguments: dict = {}
    requested_by: str = "api-user"
    incident_id: str | None = None


class ToolResultOut(BaseModel):
    status: ToolResultStatus
    evidence: dict
    timestamp: str
    affected_resource: str | None
    action_id: str
    error: str | None


class AgentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    incident_id: str
    current_stage: str
    status: str
    state: dict
    created_at: datetime
    updated_at: datetime


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    incident_id: str | None
    channel: str
    subject: str
    body: str
    status: str
    created_at: datetime


class KnowledgeDocumentIn(BaseModel):
    title: str
    source: str = "internal"
    document_type: str = "runbook"
    service: str = ""
    version: str = "1.0"
    owner: str = ""
    tags: list[str] = []
    content: str


class KnowledgeSearchResult(BaseModel):
    document_id: str
    title: str
    document_type: str
    service: str
    score: float
    snippet: str
