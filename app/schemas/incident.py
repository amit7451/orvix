from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.enums import IncidentStatus, Severity


class IncidentCreate(BaseModel):
    title: str
    description: str = ""
    severity: Severity = Severity.MEDIUM
    affected_services: list[str] = []
    symptoms: list[str] = []
    evidence: dict = {}


class IncidentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    stage: str
    message: str
    data: dict
    created_at: datetime


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    severity: Severity
    status: IncidentStatus
    affected_services: list[str]
    symptoms: list[str]
    evidence: dict
    probable_root_cause: str
    confidence: float
    alternative_causes: list[str]
    remediation_plan: dict
    verification: dict
    impact: str
    owner: str
    correlation_key: str
    duplicate_of: str | None
    detected_at: datetime
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
