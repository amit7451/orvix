"""Unit tests for service detail and incident service filtering."""
import pytest
from app.simulation.engine import simulation_registry
from app.incidents.service import incident_service
from app.schemas.incident import IncidentCreate


@pytest.mark.asyncio
async def test_simulation_service_detail_and_history():
    detail = simulation_registry.get_service_detail("payment-service")
    assert detail["name"] == "payment-service"
    assert "latency_ms" in detail
    assert "history" in detail
    assert len(detail["history"]) >= 20
    assert "dependencies" in detail
    assert "upstream" in detail["dependencies"]
    assert "downstream" in detail["dependencies"]
    # Check upstream contains auth-service and order-service
    upstream_names = [s["name"] for s in detail["dependencies"]["upstream"]]
    assert "auth-service" in upstream_names
    assert "order-service" in upstream_names


@pytest.mark.asyncio
async def test_incident_list_service_filter(client):
    # Create incident on user-service
    await client.post(
        "/api/incidents",
        json={
            "title": "User service latency spike",
            "description": "Testing service filter",
            "severity": "MEDIUM",
            "affected_services": ["user-service"],
            "symptoms": ["latency elevated"],
            "evidence": {},
        },
    )
    # Create incident on auth-service
    await client.post(
        "/api/incidents",
        json={
            "title": "Auth service crash",
            "description": "Testing service filter",
            "severity": "HIGH",
            "affected_services": ["auth-service"],
            "symptoms": ["error rate 100%"],
            "evidence": {},
        },
    )

    user_res = await client.get("/api/incidents?service=user-service")
    assert user_res.status_code == 200
    user_incidents = user_res.json()

    auth_res = await client.get("/api/incidents?service=auth-service")
    assert auth_res.status_code == 200
    auth_incidents = auth_res.json()

    nonexistent_res = await client.get("/api/incidents?service=nonexistent-service")
    assert nonexistent_res.status_code == 200
    assert len(nonexistent_res.json()) == 0

    # Also test the new detail endpoint
    detail_res = await client.get("/api/services/payment-service/detail")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["service"]["name"] == "payment-service"
    assert "telemetry" in detail_data
    assert "history" in detail_data
    assert len(detail_data["history"]) >= 20
    assert "dependencies" in detail_data
