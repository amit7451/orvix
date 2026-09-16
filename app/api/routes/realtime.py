"""Real-time backend events (Section 24): WebSocket stream of the
event bus, so a frontend can display the ORVIX agent operating live."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.core.events import event_bus

router = APIRouter(tags=["realtime"])


@router.websocket("/ws/events")
async def events_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = event_bus.subscribe()
    try:
        for event in event_bus.recent(20):
            await websocket.send_text(event.to_json())
        while True:
            event = await queue.get()
            await websocket.send_text(event.to_json())
    except WebSocketDisconnect:
        pass
    finally:
        event_bus.unsubscribe(queue)


@router.get("/api/events/stream")
async def events_sse():
    """Server-Sent Events fallback for clients that can't use WebSockets."""
    queue = event_bus.subscribe()

    async def generator():
        try:
            for event in event_bus.recent(20):
                yield f"data: {event.to_json()}\n\n"
            while True:
                event = await queue.get()
                yield f"data: {event.to_json()}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            event_bus.unsubscribe(queue)

    return StreamingResponse(generator(), media_type="text/event-stream")
