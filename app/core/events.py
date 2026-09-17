"""In-process real-time event bus.

Every meaningful backend transition publishes an event here. WebSocket/SSE
connections subscribe to the bus and forward events to connected frontends.
This decouples domain logic from transport concerns.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any


class EventType(StrEnum):
    INCIDENT_CREATED = "incident.created"
    INCIDENT_UPDATED = "incident.updated"
    INCIDENT_RESOLVED = "incident.resolved"
    INCIDENT_ESCALATED = "incident.escalated"
    AGENT_STARTED = "agent.started"
    AGENT_STATE_CHANGED = "agent.state_changed"
    AGENT_COMPLETED = "agent.completed"
    EVIDENCE_COLLECTED = "evidence.collected"
    RAG_RETRIEVAL_COMPLETED = "rag.retrieval_completed"
    DIAGNOSIS_COMPLETED = "diagnosis.completed"
    APPROVAL_REQUESTED = "approval.requested"
    APPROVAL_APPROVED = "approval.approved"
    APPROVAL_REJECTED = "approval.rejected"
    TOOL_STARTED = "tool.started"
    TOOL_COMPLETED = "tool.completed"
    VERIFICATION_STARTED = "verification.started"
    VERIFICATION_COMPLETED = "verification.completed"
    NOTIFICATION_SENT = "notification.sent"
    WATCHER_ANOMALY = "watcher.anomaly"


@dataclass
class Event:
    type: EventType
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    id: str = field(
        default_factory=lambda: f"evt_{uuid.uuid4().hex[:12]}"
    )

    def to_json(self) -> str:
        return json.dumps({
            "id": self.id,
            "type": self.type,
            "timestamp": self.timestamp,
            "payload": self.payload,
        })


class EventBus:
    """Simple async pub/sub. One queue per subscriber (e.g. per WebSocket)."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[Event]] = set()
        self._history: list[Event] = []
        self._history_limit = 500

    def subscribe(self) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=1000)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[Event]) -> None:
        self._subscribers.discard(q)

    async def publish(self, event_type: EventType, **payload: Any) -> Event:
        event = Event(type=event_type, payload=payload)
        self._history.append(event)
        if len(self._history) > self._history_limit:
            self._history.pop(0)
        for q in list(self._subscribers):
            if q.full():
                continue
            await q.put(event)
        return event

    def recent(self, limit: int = 50) -> list[Event]:
        return self._history[-limit:]


event_bus = EventBus()
