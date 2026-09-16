# Runbook: Queue Backlog / Consumer Lag

## Symptom
`queue_depth` climbing steadily, consumer lag increasing, downstream services
seeing stale data or delayed processing.

## Causes
- Consumer under-provisioned for current message volume.
- A downstream dependency slowing consumer processing time per message.
- A poison message repeatedly failing and blocking the queue (rare).

## Remediation
- Scale out consumers via `scale_service` (MEDIUM risk - approval required).
- If a downstream dependency is unhealthy, remediation belongs to that
  service's runbook instead; notify engineers via `send_engineer_notification`.

## Verification
Queue depth should trend back toward baseline (< 200) within 5 minutes of
scaling.
