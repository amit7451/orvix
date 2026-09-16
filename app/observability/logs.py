"""Application log abstraction (structured application logs, not backend
server logs). Production swap target: Loki / ELK."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LogEntry:
    service: str
    level: str
    message: str
    timestamp: str


class LogsProvider(ABC):
    @abstractmethod
    async def get_recent_logs(self, service: str, limit: int = 50) -> list[LogEntry]: ...


class MockLogsProvider(LogsProvider):
    def __init__(self, sim_registry) -> None:
        self._sim = sim_registry

    async def get_recent_logs(self, service: str, limit: int = 50) -> list[LogEntry]:
        state = self._sim.get_service_state(service)
        entries = state.synthesize_logs(limit=limit)
        return [LogEntry(service=service, level=e["level"], message=e["message"], timestamp=e["timestamp"]) for e in entries]
