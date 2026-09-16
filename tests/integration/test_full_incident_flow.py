"""Integration test: telemetry -> incident -> evidence -> RAG -> diagnosis
-> plan -> policy -> remediation -> verification -> resolution, driven
entirely through the public API (Section 35)."""
from __future__ import annotations

import asyncio

import pytest


@pytest.mark.asyncio
async def test_full_incident_resolution_flow(client):
    # Reset simulated infra to a clean slate.
    await client.post("/api/simulation/reset")

    inject = await client.post("/api/simulation/failures/database", params={"service": "payment-service", "severity": 0.9})
    assert inject.status_code == 200

    incident_resp = await client.post("/api/incidents", json={
        "title": "Payment service DB pool exhaustion",
        "description": "Integration test incident",
        "affected_services": ["payment-service"],
        "symptoms": ["elevated latency and error rate"],
    })
    assert incident_resp.status_code == 201
    incident = incident_resp.json()
    assert incident["status"] == "DETECTED"

    run_resp = await client.post("/api/agent/run", json={"incident_id": incident["id"]})
    assert run_resp.status_code == 201
    run = run_resp.json()
    assert run["incident_id"] == incident["id"]

    final = (await client.get(f"/api/incidents/{incident['id']}")).json()
    assert final["status"] in ("RESOLVED", "AWAITING_APPROVAL", "ESCALATED")
    assert final["probable_root_cause"]
    assert final["confidence"] > 0

    timeline = (await client.get(f"/api/incidents/{incident['id']}/timeline")).json()
    stages_seen = {e["stage"] for e in timeline}
    assert "UNDERSTAND" in stages_seen or "INVESTIGATING" in stages_seen

    await client.post("/api/simulation/reset")


@pytest.mark.asyncio
async def test_health_and_readiness(client):
    health = await client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    ready = await client.get("/ready")
    assert ready.status_code == 200


@pytest.mark.asyncio
async def test_knowledge_search_returns_seeded_runbooks(client):
    resp = await client.post("/api/knowledge/documents", json={
        "title": "Test Runbook: Cache Invalidation",
        "document_type": "runbook",
        "service": "notification-service",
        "content": "When cache invalidation fails, restart the notification service to force a cold reload.",
    })
    assert resp.status_code == 201

    search = await client.get("/api/knowledge/search", params={"q": "cache invalidation restart"})
    assert search.status_code == 200
    results = search.json()
    assert any("Cache Invalidation" in r["title"] for r in results)


@pytest.mark.asyncio
async def test_analytics_overview_returns_counts(client):
    resp = await client.get("/api/analytics/overview")
    assert resp.status_code == 200
    body = resp.json()
    assert "total_incidents" in body
    assert "active_incidents" in body
