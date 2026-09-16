# Runbook: Database Connection Pool Exhaustion

## Symptom
`db_connections_used` approaches or exceeds `db_connections_max`. Logs show
"connection pool exhausted: timeout waiting for connection".

## Root Causes
- Connection leaks from an unclosed session in a recent code change.
- A slow query holding connections open under load.
- Traffic spike beyond configured pool size.

## Safe Remediation
Restarting the affected service resets all connections and is safe at LOW risk
as long as it is not a stateful primary database node. Do not attempt manual
SQL intervention through this platform - escalate to a DBA for schema-level
investigation if the issue recurs after two restarts within an hour.

## Verification
`check_database_health` utilization should drop below 0.5 within 2 minutes of restart.
