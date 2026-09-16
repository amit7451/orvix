# Runbook: Upstream Dependency Failure

## Symptom
A service's error rate or latency rises while its OWN resource metrics
(CPU, memory, DB pool) look normal, and a dependency's health check is
failing.

## Diagnosis
Trace spans show high duration/errors in calls to the dependency, not in the
service's own handler code.

## Remediation
This platform does not take automated action on a service outside the
originating incident's declared scope. The correct action is
`send_engineer_notification` (LOW risk) to alert the on-call engineer that
owns the failing dependency, with the trace evidence attached.

## Verification
Resolve only after the dependency's own health check reports healthy AND the
dependent service's metrics recover.
