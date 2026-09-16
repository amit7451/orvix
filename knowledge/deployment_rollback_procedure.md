# Procedure: Deployment Rollback

## When to use
Anomalous latency, error rate, or crash-looping that began within minutes of a
recent deployment to the affected service.

## Risk Classification
MEDIUM risk. Requires human approval by default policy, since rollback
affects the currently served version for all traffic.

## Steps
1. Confirm the deployment timestamp correlates with anomaly onset via
   `get_recent_deployments` and telemetry evidence.
2. Request rollback via `rollback_deployment`.
3. After rollback, `verify_recovery` must pass before the incident is closed.
4. File a follow-up ticket for the engineering team that owns the service to
   fix the underlying regression before re-deploying.

## Rollback of the Rollback
If the previous version also exhibits issues, escalate to the service owner
immediately - do not attempt further automated changes.
