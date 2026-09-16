"""Distributed trace abstraction (OpenTelemetry-compatible shape).
Production swap target: OpenTelemetry Collector / Jaeger."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class Span:
    name: str
    service: str
    duration_ms: float
    status: str  # OK / ERROR
    children: list["Span"] = field(default_factory=list)


class TracesProvider(ABC):
    @abstractmethod
    async def get_recent_trace(self, service: str) -> Span: ...


class MockTracesProvider(TracesProvider):
    def __init__(self, sim_registry) -> None:
        self._sim = sim_registry

    async def get_recent_trace(self, service: str) -> Span:
        state = self._sim.get_service_state(service)
        return state.synthesize_trace()
