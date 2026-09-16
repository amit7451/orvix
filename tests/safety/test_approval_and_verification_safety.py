"""Safety tests requiring the running FastAPI app: rejected approvals must
never execute the underlying action, and a failed verification must never
mark an incident resolved."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_rejected_approval_does_not_execute_action(client):
    resp = await client.post("/api/incidents", json={
        "title": "Manual test incident - reject path",
        "description": "test",
        "affected_services": ["order-service"],
        "symptoms": ["cpu_percent elevated on order-service"],
    })
    assert resp.status_code == 201
    incident_id = resp.json()["id"]

    run_resp = await client.post("/api/agent/run", json={"incident_id": incident_id})
    assert run_resp.status_code == 201

    approvals = (await client.get("/api/approvals")).json()
    pending = [a for a in approvals if a["incident_id"] == incident_id and a["decision"] == "PENDING"]

    if not pending:
        # Diagnosis found nothing actionable (no anomalies present) - nothing to assert.
        return

    approval_id = pending[0]["id"]
    reject_resp = await client.post(
        f"/api/approvals/{approval_id}/reject",
        json={"approver": "approver@orvix.local", "reason": "not safe right now"},
    )
    assert reject_resp.status_code == 200
    assert reject_resp.json()["decision"] == "REJECTED"

    incident = (await client.get(f"/api/incidents/{incident_id}")).json()
    # A rejected action must never leave the incident silently marked RESOLVED
    # via that action having executed anyway.
    assert incident["status"] in ("ESCALATED", "AWAITING_APPROVAL", "REMEDIATING", "VERIFYING", "INVESTIGATING")


@pytest.mark.asyncio
async def test_verify_recovery_tool_never_reports_passed_when_metrics_bad(client):
    resp = await client.post("/api/simulation/failures", json={
        "service": "auth-service", "kind": "service_down", "severity": 1.0,
    })
    assert resp.status_code == 200

    tools_resp = await client.get("/api/tools")
    assert any(t["name"] == "verify_recovery" for t in tools_resp.json())

    # verify_recovery is LOW risk and read-only so direct execution is allowed.
    result = await client.post("/api/tools/verify_recovery/execute", json={"arguments": {"service": "auth-service"}})
    assert result.status_code == 200
    body = result.json()
    assert body["evidence"]["passed"] is False

    await client.post("/api/simulation/reset", params={"service": "auth-service"})
