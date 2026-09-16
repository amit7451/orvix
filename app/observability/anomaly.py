"""Modular anomaly detection engine.

Deterministic by design (Section 41: use deterministic systems for
thresholds). The LLM never decides whether a metric is anomalous - this
module does, and the agent only interprets *why*.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Metrics where a HIGHER value is worse.
HIGHER_IS_WORSE = {"latency_ms", "error_rate", "cpu_percent", "memory_percent", "queue_depth", "db_connections_used"}


@dataclass
class AnomalyResult:
    service: str
    metric: str
    current_value: float
    baseline: float
    threshold: float
    anomaly_score: float
    confidence: float
    timestamp: str
    explanation: str
    method: str


class RollingWindow:
    """Keeps a rolling window of recent values per (service, metric) for
    z-score / EWMA style detection."""

    def __init__(self, maxlen: int = 50) -> None:
        self._data: dict[tuple[str, str], deque[float]] = defaultdict(lambda: deque(maxlen=maxlen))

    def push(self, service: str, metric: str, value: float) -> None:
        self._data[(service, metric)].append(value)

    def values(self, service: str, metric: str) -> list[float]:
        return list(self._data[(service, metric)])


class AnomalyDetector:
    """Combines threshold, rolling-statistics, z-score and EWMA methods.

    Architecture leaves room for future Isolation Forest / time-series /
    predictive-failure models (Section 19) without changing the interface.
    """

    # metric -> (absolute threshold, relative-multiplier-of-baseline)
    THRESHOLDS: dict[str, tuple[float, float]] = {
        "latency_ms": (400.0, 2.5),
        "error_rate": (0.05, 3.0),
        "cpu_percent": (85.0, 1.8),
        "memory_percent": (85.0, 1.8),
        "queue_depth": (200.0, 4.0),
        "db_connections_used": (0.9, 1.5),  # interpreted as ratio-of-max upstream
    }

    def __init__(self) -> None:
        self.window = RollingWindow()
        self._ewma: dict[tuple[str, str], float] = {}

    def _ewma_update(self, key: tuple[str, str], value: float, alpha: float = 0.3) -> float:
        prev = self._ewma.get(key, value)
        new = alpha * value + (1 - alpha) * prev
        self._ewma[key] = new
        return new

    def evaluate(self, service: str, metric: str, value: float, baseline: float) -> AnomalyResult | None:
        self.window.push(service, metric, value)
        history = self.window.values(service, metric)
        ewma = self._ewma_update((service, metric), value)

        abs_threshold, rel_multiplier = self.THRESHOLDS.get(metric, (float("inf"), float("inf")))
        higher_is_worse = metric in HIGHER_IS_WORSE

        # 1. Threshold-based
        threshold_breached = value > abs_threshold if higher_is_worse else value < abs_threshold

        # 2. Relative-to-baseline
        relative_breached = (
            baseline > 0 and (value / baseline) > rel_multiplier
            if higher_is_worse
            else baseline > 0 and (value / baseline) < (1 / rel_multiplier)
        )

        # 3. Z-score (rolling stats), needs >= 5 points
        z_score = 0.0
        if len(history) >= 5:
            mean = sum(history) / len(history)
            variance = sum((x - mean) ** 2 for x in history) / len(history)
            std = variance ** 0.5
            if std > 0:
                z_score = (value - mean) / std

        z_breached = abs(z_score) > 2.5

        if not (threshold_breached or relative_breached or z_breached):
            return None

        methods = []
        if threshold_breached:
            methods.append("threshold")
        if relative_breached:
            methods.append("baseline_ratio")
        if z_breached:
            methods.append("z_score")

        # anomaly score: normalized 0-1 blend, calibrated against how far the
        # value sits past the *relative* threshold (not raw baseline delta,
        # which under-scores metrics with a small baseline like error_rate).
        if baseline > 0:
            excess_ratio = (value / baseline) if higher_is_worse else (baseline / max(value, 1e-6))
            ratio_score = min(excess_ratio / rel_multiplier, 2.0) / 2.0
        else:
            ratio_score = 1.0 if threshold_breached else 0.0
        z_component = min(abs(z_score) / 5.0, 1.0)
        base_breach_score = 0.5 if (threshold_breached or relative_breached) else 0.0
        anomaly_score = round(
            min(1.0, max(base_breach_score, 0.55 * ratio_score + 0.25 * z_component + 0.1 * len(methods))), 3
        )
        confidence = round(min(1.0, 0.5 + 0.15 * len(methods) + 0.1 * min(len(history), 5)), 3)

        explanation = (
            f"{metric} on {service} = {value:.2f} vs baseline {baseline:.2f} "
            f"(ewma={ewma:.2f}, z={z_score:.2f}); triggered via {', '.join(methods)}."
        )

        return AnomalyResult(
            service=service,
            metric=metric,
            current_value=value,
            baseline=baseline,
            threshold=abs_threshold,
            anomaly_score=anomaly_score,
            confidence=confidence,
            timestamp=datetime.now(timezone.utc).isoformat(),
            explanation=explanation,
            method="+".join(methods),
        )


anomaly_detector = AnomalyDetector()
