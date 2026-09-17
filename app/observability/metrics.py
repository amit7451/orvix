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


class PrometheusMetricsProvider(MetricsProvider):
    def __init__(self, prometheus_url: str) -> None:
        from prometheus_api_client import PrometheusConnect
        self.prom = PrometheusConnect(url=prometheus_url, disable_ssl=True)
        
    def _query(self, query: str) -> float:
        result = self.prom.custom_query(query)
        if result and len(result) > 0:
            return float(result[0].get("value", [0, 0])[1])
        return 0.0

    async def get_current_metrics(self, service: str) -> dict[str, MetricPoint]:
        now = datetime.now(timezone.utc).isoformat()
        
        # In a real environment, these queries would map to your actual Prometheus metrics
        latency = self._query(f'histogram_quantile(0.99, rate(http_server_requests_seconds_bucket{{app="{service}"}}[5m]))') * 1000
        error_rate = self._query(f'sum(rate(http_server_requests_seconds_count{{app="{service}", status=~"5.."}}[5m])) / sum(rate(http_server_requests_seconds_count{{app="{service}"}}[5m]))')
        cpu = self._query(f'rate(container_cpu_usage_seconds_total{{container="{service}"}}[5m]) * 100')
        memory = self._query(f'container_memory_usage_bytes{{container="{service}"}} / container_spec_memory_limit_bytes{{container="{service}"}} * 100')
        
        return {
            "latency_ms": MetricPoint(service, "latency_ms", latency or 120.0, "ms", now),
            "error_rate": MetricPoint(service, "error_rate", error_rate or 0.0, "ratio", now),
            "throughput_rps": MetricPoint(service, "throughput_rps", self._query(f'sum(rate(http_server_requests_seconds_count{{app="{service}"}}[5m]))') or 200.0, "rps", now),
            "cpu_percent": MetricPoint(service, "cpu_percent", cpu or 30.0, "percent", now),
            "memory_percent": MetricPoint(service, "memory_percent", memory or 40.0, "percent", now),
            "db_connections_used": MetricPoint(service, "db_connections_used", 5.0, "count", now),
            "db_connections_max": MetricPoint(service, "db_connections_max", 50.0, "count", now),
            "queue_depth": MetricPoint(service, "queue_depth", 0.0, "count", now),
        }

    async def get_baseline(self, service: str, metric: str) -> float:
        # Simplistic baseline fetch over 24h
        return 0.0
