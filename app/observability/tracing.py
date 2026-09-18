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


class JaegerTracesProvider(TracesProvider):
    def __init__(self, jaeger_url: str, fallback_sim=None) -> None:
        self.jaeger_url = jaeger_url
        self._fallback = MockTracesProvider(fallback_sim) if fallback_sim else None

    async def get_recent_trace(self, service: str) -> Span:
        if self._fallback and service in self._fallback._sim.services:
            return await self._fallback.get_recent_trace(service)

        import httpx
        url = f"{self.jaeger_url}/api/traces"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, 
                    params={"service": service, "limit": 1}
                )
                response.raise_for_status()
                data = response.json()
        except Exception:
            if self._fallback:
                return await self._fallback.get_recent_trace(service)
            return Span(name=f"{service}.fallback", service=service, duration_ms=0.0, status="OK")

        traces = data.get("data", [])
        if not traces:
            if self._fallback:
                return await self._fallback.get_recent_trace(service)
            return Span(name=f"{service}.no_trace", service=service, duration_ms=0.0, status="OK")
            
        trace = traces[0]
        spans = trace.get("spans", [])
        
        # Super simplified span parsing to fit the abstraction
        # In a real environment, you'd reconstruct the tree using spanID/parentSpanID
        root = Span(name=f"{service}.request", service=service, duration_ms=0.0, status="OK")
        for s in spans:
            duration = s.get("duration", 0) / 1000.0  # Jaeger duration is in microseconds
            operation = s.get("operationName", "unknown")
            # Determine error from tags
            status = "OK"
            for tag in s.get("tags", []):
                if tag.get("key") == "error" and tag.get("value") is True:
                    status = "ERROR"
            
            if not s.get("references"): # Root span
                root.name = operation
                root.duration_ms = duration
                root.status = "ERROR" if status == "ERROR" else root.status
            else:
                root.children.append(Span(name=operation, service=service, duration_ms=duration, status=status))

        return root
