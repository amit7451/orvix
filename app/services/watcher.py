"""Background monitoring loop.

This is what makes ORVIX *autonomous* rather than request-driven: it
continuously ticks the simulated infrastructure, watches for anomalies,
and opens+drives an incident through the full agent loop without any
human triggering it - matching Section 22's end-to-end scenario.
"""
from __future__ import annotations

import asyncio
import logging

from app.core.container import get_anomaly_detector, get_metrics_provider, get_simulation_registry
from app.db.session import SessionLocal
from app.incidents.service import incident_service
from app.schemas.incident import IncidentCreate
from app.services.agent_runner import start_run

logger = logging.getLogger("orvix.watcher")

_POLL_INTERVAL_SECONDS = 5
_ANOMALY_SCORE_THRESHOLD = 0.35


class MonitoringWatcher:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False

    async def _tick_once(self) -> None:
        sim = get_simulation_registry()
        metrics_provider = get_metrics_provider()
        detector = get_anomaly_detector()
        sim.tick_all()

        triggered: dict[str, list] = {}
        for service_name in sim.services:
            current = await metrics_provider.get_current_metrics(service_name)
            for metric_name in ("latency_ms", "error_rate", "cpu_percent", "memory_percent", "queue_depth"):
                point = current[metric_name]
                baseline = await metrics_provider.get_baseline(service_name, metric_name)
                anomaly = detector.evaluate(service_name, metric_name, point.value, baseline)
                if anomaly and anomaly.anomaly_score >= _ANOMALY_SCORE_THRESHOLD:
                    triggered.setdefault(service_name, []).append(anomaly)

        for service_name, anomalies in triggered.items():
            top = max(anomalies, key=lambda a: a.anomaly_score)
            async with SessionLocal() as db:
                incident = await incident_service.create(
                    db,
                    IncidentCreate(
                        title=f"Anomalous {top.metric} on {service_name}",
                        description=top.explanation,
                        affected_services=[service_name],
                        symptoms=[a.explanation for a in anomalies],
                        evidence={},
                    ),
                    actor="orvix-watcher",
                )
                # Skip kicking off a fresh agent run for a detected duplicate -
                # the original incident's run is already handling it.
                if incident.duplicate_of is None:
                    try:
                        await start_run(db, incident)
                    except Exception:  # noqa: BLE001
                        logger.exception("Agent run failed to start for incident %s", incident.id)

    async def _loop(self) -> None:
        self._running = True
        while self._running:
            try:
                await self._tick_once()
            except Exception:  # noqa: BLE001 - watcher must never die silently
                logger.exception("Monitoring watcher tick failed")
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop())
            logger.info("ORVIX monitoring watcher started (interval=%ss)", _POLL_INTERVAL_SECONDS)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None


watcher = MonitoringWatcher()
