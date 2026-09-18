"""Background monitoring loop.

This is what makes ORVIX *autonomous* rather than request-driven: it
continuously ticks the simulated infrastructure, watches for anomalies,
and opens+drives an incident through the full agent loop without any
human triggering it - matching Section 22's end-to-end scenario.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging

from app.core.container import get_anomaly_detector, get_metrics_provider, get_simulation_registry
from app.core.enums import Severity
from app.core.events import EventType, event_bus
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

    async def _run_agent_safely(self, incident_id: str) -> None:
        try:
            async with SessionLocal() as db:
                incident = await incident_service.get(db, incident_id)
                if incident:
                    await start_run(db, incident)
        except Exception:
            logger.exception("Agent run failed to complete for incident %s", incident_id)

    async def trigger_service(self, service_name: str, force: bool = False):
        sim = get_simulation_registry()
        state = sim.get_service_state(service_name)
        state.tick()

        metrics_provider = get_metrics_provider()
        detector = get_anomaly_detector()

        current = await metrics_provider.get_current_metrics(service_name)
        anomalies = []
        for metric_name in ("latency_ms", "error_rate", "cpu_percent", "memory_percent", "queue_depth"):
            if metric_name not in current:
                continue
            point = current[metric_name]
            baseline = await metrics_provider.get_baseline(service_name, metric_name)
            anomaly = detector.evaluate(service_name, metric_name, point.value, baseline)
            if anomaly and (anomaly.anomaly_score >= _ANOMALY_SCORE_THRESHOLD or force):
                anomalies.append(anomaly)

        # If forced and no anomalies detected by threshold, generate synthetic anomaly for active failures
        if not anomalies and force and state.active_failures:
            f = state.active_failures[-1]
            from app.observability.anomaly import AnomalyResult
            metric_kind = "latency_ms" if f.kind == "latency" else "error_rate" if f.kind == "error_rate" else f.kind
            val = getattr(state, metric_kind, 500.0)
            anomalies.append(
                AnomalyResult(
                    service=service_name,
                    metric=metric_kind,
                    current_value=float(val),
                    baseline=120.0,
                    threshold=400.0,
                    anomaly_score=0.9,
                    confidence=0.95,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    explanation=f"Simulated failure: {f.kind} on {service_name} (severity={f.severity})",
                    method="simulation_injection",
                )
            )

        if not anomalies:
            return None

        top = max(anomalies, key=lambda a: a.anomaly_score)
        severity = Severity.CRITICAL if top.anomaly_score >= 0.8 else Severity.HIGH if top.anomaly_score >= 0.6 else Severity.MEDIUM

        async with SessionLocal() as db:
            from app.incidents.correlation import build_correlation_key, find_open_duplicate
            correlation_key = build_correlation_key([service_name], [a.explanation for a in anomalies])

            if not force:
                duplicate = await find_open_duplicate(db, correlation_key, within_minutes=15)
                if duplicate:
                    return duplicate
                # Also prevent duplicate creation if any incident on this service is already open
                from sqlalchemy import select
                from app.db.models.incident import Incident
                from app.incidents.correlation import _OPEN_STATUSES
                res = await db.execute(select(Incident).where(Incident.status.in_(_OPEN_STATUSES)))
                for open_inc in res.scalars().all():
                    if service_name in (open_inc.affected_services or []):
                        return open_inc


            await event_bus.publish(
                EventType.WATCHER_ANOMALY,
                service=service_name,
                metric=top.metric,
                anomaly_score=top.anomaly_score,
                value=round(top.current_value, 2),
                threshold=round(top.threshold, 2),
            )

            incident = await incident_service.create(
                db,
                IncidentCreate(
                    title=f"Anomalous {top.metric} on {service_name}",
                    description=top.explanation,
                    severity=severity,
                    affected_services=[service_name],
                    symptoms=[a.explanation for a in anomalies],
                    evidence={"metrics": {k: v.value for k, v in current.items()}},
                ),
                actor="orvix-watcher",
            )
            # Spawn the agent run in the background
            asyncio.create_task(self._run_agent_safely(incident.id))
            return incident

    async def _tick_once(self) -> None:
        sim = get_simulation_registry()
        sim.tick_all()

        for service_name in list(sim.services.keys()):
            try:
                await self.trigger_service(service_name, force=False)
            except Exception:
                logger.exception("Watcher failed evaluating service %s", service_name)

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
