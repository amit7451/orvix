"""Metrics abstraction.

`MetricsProvider` is the interface the rest of ORVIX depends on. Local
development uses `MockMetricsProvider`, driven by `app.simulation.engine`.
A production deployment would swap in a `PrometheusMetricsProvider` that
implements the same interface without touching any calling code.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class MetricPoint:
    service: str
    metric: str
    value: float
    unit: str
    timestamp: str


class MetricsProvider(ABC):
    @abstractmethod
    async def get_current_metrics(self, service: str) -> dict[str, MetricPoint]: ...

    @abstractmethod
    async def get_baseline(self, service: str, metric: str) -> float: ...


class MockMetricsProvider(MetricsProvider):
    """Reads live values from the in-memory simulated infrastructure."""

    def __init__(self, sim_registry) -> None:  # sim_registry: app.simulation.engine.SimulationRegistry
        self._sim = sim_registry

    async def get_current_metrics(self, service: str) -> dict[str, MetricPoint]:
        state = self._sim.get_service_state(service)
        now = datetime.now(timezone.utc).isoformat()
        return {
            "latency_ms": MetricPoint(service, "latency_ms", state.latency_ms, "ms", now),
            "error_rate": MetricPoint(service, "error_rate", state.error_rate, "ratio", now),
            "throughput_rps": MetricPoint(service, "throughput_rps", state.throughput_rps, "rps", now),
            "cpu_percent": MetricPoint(service, "cpu_percent", state.cpu_percent, "percent", now),
            "memory_percent": MetricPoint(service, "memory_percent", state.memory_percent, "percent", now),
            "db_connections_used": MetricPoint(
                service, "db_connections_used", state.db_connections_used, "count", now
            ),
            "db_connections_max": MetricPoint(
                service, "db_connections_max", state.db_connections_max, "count", now
            ),
            "queue_depth": MetricPoint(service, "queue_depth", state.queue_depth, "count", now),
        }

    async def get_baseline(self, service: str, metric: str) -> float:
        baselines = {
            "latency_ms": 120.0,
            "error_rate": 0.01,
            "throughput_rps": 200.0,
            "cpu_percent": 35.0,
            "memory_percent": 45.0,
            "db_connections_used": 10.0,
            "queue_depth": 5.0,
        }
        return baselines.get(metric, 0.0)
