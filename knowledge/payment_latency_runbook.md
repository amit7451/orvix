# Runbook: Payment Service High Latency

## Symptom
p99 latency on payment-service exceeds 400ms, often accompanied by elevated error rate.

## Likely Causes (in order of frequency)
1. Database connection pool exhaustion (most common) - check `check_database_health`.
2. Recent deployment regression - check `get_recent_deployments`.
3. Upstream dependency (auth-service or order-service) degradation.
4. CPU/memory resource pressure under high traffic.

## Diagnostic Steps
1. Run `get_metrics` for payment-service and its dependencies.
2. Run `check_database_health` - if utilization > 85%, this is very likely the cause.
3. Run `get_recent_deployments` - if a deploy occurred in the last 30 minutes, treat as prime suspect.
4. Run `get_trace` to see where time is spent (db_query span vs handler span).

## Remediation
- Connection pool exhaustion: `restart_service` on payment-service (LOW risk, releases stuck connections).
- Deployment regression: `rollback_deployment` (MEDIUM risk, requires approval).
- Resource pressure: `scale_service` to add replicas (MEDIUM risk, requires approval).

## Verification
Confirm latency_ms < 300 and error_rate < 0.05 via `verify_recovery` before marking resolved.
