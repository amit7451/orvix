"""Deployment / configuration / infra event abstraction."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class InfraEvent:
    service: str
    event_type: str  # deployment / scaling / config_change / restart
    description: str
    timestamp: str


class EventsProvider(ABC):
    @abstractmethod
    async def get_recent_deployments(self, service: str, limit: int = 5) -> list[InfraEvent]: ...

    @abstractmethod
    async def get_recent_events(self, service: str, limit: int = 20) -> list[InfraEvent]: ...


class MockEventsProvider(EventsProvider):
    def __init__(self, sim_registry) -> None:
        self._sim = sim_registry

    async def get_recent_deployments(self, service: str, limit: int = 5) -> list[InfraEvent]:
        state = self._sim.get_service_state(service)
        return [e for e in state.events if e.event_type == "deployment"][-limit:]

    async def get_recent_events(self, service: str, limit: int = 20) -> list[InfraEvent]:
        state = self._sim.get_service_state(service)
        return state.events[-limit:]
