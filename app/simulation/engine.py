"""Simulated backend environment.

ORVIX must be demonstrable without real production infrastructure
(Section 21). This module implements a small fleet of simulated services
with realistic baseline telemetry and controllable failure injection.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.observability.events_provider import InfraEvent
from app.observability.tracing import Span

SERVICE_NAMES = [
    "payment-service",
    "auth-service",
    "order-service",
    "user-service",
    "notification-service",
]

DEPENDENCY_GRAPH: dict[str, list[str]] = {
    "payment-service": ["auth-service", "order-service"],
    "order-service": ["user-service", "payment-service"],
    "auth-service": [],
    "user-service": ["auth-service"],
    "notification-service": ["user-service"],
}

FAILURE_KINDS = {
    "latency",
    "error_rate",
    "service_down",
    "database",
    "queue",
    "deployment",
    "dependency",
    "cpu",
    "memory",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ActiveFailure:
    kind: str
    severity: float  # 0-1 multiplier of how bad
    injected_at: str = field(default_factory=_now)
    note: str = ""


@dataclass
class ServiceState:
    name: str
    latency_ms: float = 110.0
    error_rate: float = 0.01
    throughput_rps: float = 200.0
    cpu_percent: float = 30.0
    memory_percent: float = 40.0
    db_connections_used: int = 8
    db_connections_max: int = 50
    queue_depth: int = 3
    healthy: bool = True
    active_failures: list[ActiveFailure] = field(default_factory=list)
    events: list[InfraEvent] = field(default_factory=list)

    def _rand_jitter(self, base: float, pct: float = 0.08) -> float:
        return base * (1 + random.uniform(-pct, pct))

    def tick(self) -> None:
        """Recompute live telemetry from baseline + active failures."""
        latency = 110.0
        error_rate = 0.01
        cpu = 30.0
        memory = 40.0
        queue = 3
        db_used = 8
        healthy = True

        for f in self.active_failures:
            if f.kind == "latency":
                latency += 900 * f.severity
            elif f.kind == "error_rate":
                error_rate += 0.35 * f.severity
            elif f.kind == "service_down":
                latency += 5000
                error_rate = 0.98
                healthy = False
            elif f.kind == "database":
                db_used = int(self.db_connections_max * (0.85 + 0.15 * f.severity))
                latency += 600 * f.severity
                error_rate += 0.15 * f.severity
            elif f.kind == "queue":
                queue += int(400 * f.severity)
                latency += 200 * f.severity
            elif f.kind == "cpu":
                cpu += 60 * f.severity
                latency += 150 * f.severity
            elif f.kind == "memory":
                memory += 55 * f.severity
                latency += 100 * f.severity
            elif f.kind == "dependency":
                latency += 400 * f.severity
                error_rate += 0.1 * f.severity

        self.latency_ms = round(self._rand_jitter(latency), 1)
        self.error_rate = round(min(self._rand_jitter(error_rate, 0.05), 1.0), 4)
        self.cpu_percent = round(min(self._rand_jitter(cpu), 100.0), 1)
        self.memory_percent = round(min(self._rand_jitter(memory), 100.0), 1)
        self.queue_depth = max(0, int(self._rand_jitter(queue)))
        self.db_connections_used = max(0, min(int(self._rand_jitter(db_used)), self.db_connections_max))
        self.throughput_rps = round(self._rand_jitter(200.0 * (0.4 if not healthy else 1.0)), 1)
        self.healthy = healthy and self.error_rate < 0.5

    def synthesize_logs(self, limit: int = 50) -> list[dict]:
        logs = []
        if self.active_failures:
            for f in self.active_failures:
                if f.kind == "database":
                    logs.append({"level": "ERROR", "message": "connection pool exhausted: timeout waiting for connection", "timestamp": _now()})
                elif f.kind == "service_down":
                    logs.append({"level": "ERROR", "message": "health check failed: process not responding", "timestamp": _now()})
                elif f.kind == "latency":
                    logs.append({"level": "WARN", "message": "downstream call exceeded p99 latency budget", "timestamp": _now()})
                elif f.kind == "error_rate":
                    logs.append({"level": "ERROR", "message": "unhandled exception in request handler: 500 Internal Server Error", "timestamp": _now()})
                elif f.kind == "queue":
                    logs.append({"level": "WARN", "message": "queue consumer lag increasing, backlog growing", "timestamp": _now()})
                elif f.kind == "dependency":
                    logs.append({"level": "ERROR", "message": "upstream dependency returned 503", "timestamp": _now()})
                elif f.kind in ("cpu", "memory"):
                    logs.append({"level": "WARN", "message": f"resource pressure detected ({f.kind})", "timestamp": _now()})
        logs.append({"level": "INFO", "message": f"{self.name} heartbeat ok", "timestamp": _now()})
        return logs[:limit]

    def synthesize_trace(self) -> Span:
        error = any(f.kind in ("service_down", "error_rate", "dependency") for f in self.active_failures)
        children = [
            Span(name=f"{self.name}.handler", service=self.name, duration_ms=self.latency_ms * 0.6, status="ERROR" if error else "OK"),
            Span(name=f"{self.name}.db_query", service=self.name, duration_ms=self.latency_ms * 0.3, status="OK"),
        ]
        return Span(name=f"{self.name}.request", service=self.name, duration_ms=self.latency_ms, status="ERROR" if error else "OK", children=children)


class SimulationRegistry:
    def __init__(self) -> None:
        self.services: dict[str, ServiceState] = {name: ServiceState(name=name) for name in SERVICE_NAMES}
        for name, state in self.services.items():
            state.events.append(
                InfraEvent(service=name, event_type="deployment", description="Initial baseline deployment",
                            timestamp=(datetime.now(timezone.utc) - timedelta(days=2)).isoformat())
            )

    def get_service_state(self, service: str) -> ServiceState:
        if service not in self.services:
            self.services[service] = ServiceState(name=service)
        return self.services[service]

    def tick_all(self) -> None:
        for state in self.services.values():
            state.tick()

    def inject_failure(self, service: str, kind: str, severity: float = 0.7, note: str = "") -> ActiveFailure:
        if kind not in FAILURE_KINDS:
            raise ValueError(f"Unknown failure kind: {kind}")
        state = self.get_service_state(service)
        failure = ActiveFailure(kind=kind, severity=max(0.0, min(severity, 1.0)), note=note)
        state.active_failures.append(failure)
        state.events.append(
            InfraEvent(service=service, event_type=("deployment" if kind == "deployment" else "incident_injection"),
                        description=f"Injected failure: {kind} (severity={severity})", timestamp=_now())
        )
        state.tick()
        return failure

    def clear_failures(self, service: str | None = None) -> None:
        if service:
            self.get_service_state(service).active_failures.clear()
            self.get_service_state(service).tick()
        else:
            for state in self.services.values():
                state.active_failures.clear()
                state.tick()

    def dependencies_of(self, service: str) -> list[str]:
        return DEPENDENCY_GRAPH.get(service, [])

    def snapshot(self) -> dict:
        return {
            name: {
                "healthy": s.healthy,
                "latency_ms": s.latency_ms,
                "error_rate": s.error_rate,
                "throughput_rps": s.throughput_rps,
                "cpu_percent": s.cpu_percent,
                "memory_percent": s.memory_percent,
                "db_connections_used": s.db_connections_used,
                "db_connections_max": s.db_connections_max,
                "queue_depth": s.queue_depth,
                "active_failures": [f.kind for f in s.active_failures],
            }
            for name, s in self.services.items()
        }


# Process-wide singleton simulated infrastructure.
simulation_registry = SimulationRegistry()
