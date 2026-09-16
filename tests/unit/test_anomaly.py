from app.observability.anomaly import AnomalyDetector


def test_no_anomaly_when_within_baseline():
    detector = AnomalyDetector()
    result = detector.evaluate("payment-service", "latency_ms", 125.0, 120.0)
    assert result is None


def test_threshold_breach_detected():
    detector = AnomalyDetector()
    result = detector.evaluate("payment-service", "latency_ms", 900.0, 120.0)
    assert result is not None
    assert result.anomaly_score > 0.3
    assert "threshold" in result.method


def test_relative_baseline_breach_detected_even_under_absolute_threshold():
    detector = AnomalyDetector()
    # error_rate absolute threshold is 0.05; 0.04 is under it but 4x baseline (0.01)
    result = detector.evaluate("auth-service", "error_rate", 0.04, 0.01)
    assert result is not None
    assert "baseline_ratio" in result.method


def test_z_score_kicks_in_with_history():
    detector = AnomalyDetector()
    for v in [100, 102, 98, 101, 99]:
        detector.evaluate("order-service", "latency_ms", v, 100.0)
    result = detector.evaluate("order-service", "latency_ms", 500.0, 100.0)
    assert result is not None
    assert result.anomaly_score > 0.5
