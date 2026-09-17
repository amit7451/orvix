import pytest
from app.core.events import Event, EventType, EventBus


@pytest.mark.asyncio
async def test_event_unique_id():
    e1 = Event(type=EventType.INCIDENT_CREATED, payload={"foo": "bar"})
    e2 = Event(type=EventType.INCIDENT_CREATED, payload={"foo": "bar"})
    assert e1.id != e2.id
    assert e1.id.startswith("evt_")
    assert e2.id.startswith("evt_")

    data = e1.to_json()
    assert e1.id in data
    assert "incident.created" in data


@pytest.mark.asyncio
async def test_event_bus_publish_and_subscribe():
    bus = EventBus()
    q = bus.subscribe()

    e = await bus.publish(EventType.AGENT_STARTED, incident_id="inc_test_1")
    assert e.id.startswith("evt_")
    assert len(bus.recent(10)) == 1

    received = await q.get()
    assert received.id == e.id
    assert received.payload["incident_id"] == "inc_test_1"

    bus.unsubscribe(q)
