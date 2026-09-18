"""Application log abstraction (structured application logs, not backend
server logs). Production swap target: Loki / ELK."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LogEntry:
    service: str
    level: str
    message: str
    timestamp: str


class LogsProvider(ABC):
    @abstractmethod
    async def get_recent_logs(self, service: str, limit: int = 50) -> list[LogEntry]: ...


class MockLogsProvider(LogsProvider):
    def __init__(self, sim_registry) -> None:
        self._sim = sim_registry

    async def get_recent_logs(self, service: str, limit: int = 50) -> list[LogEntry]:
        state = self._sim.get_service_state(service)
        entries = state.synthesize_logs(limit=limit)
        return [LogEntry(service=service, level=e["level"], message=e["message"], timestamp=e["timestamp"]) for e in entries]


class LokiLogsProvider(LogsProvider):
    def __init__(self, loki_url: str, fallback_sim=None) -> None:
        self.loki_url = loki_url
        self._fallback = MockLogsProvider(fallback_sim) if fallback_sim else None

    async def get_recent_logs(self, service: str, limit: int = 50) -> list[LogEntry]:
        if self._fallback and service in self._fallback._sim.services:
            return await self._fallback.get_recent_logs(service, limit=limit)

        import httpx
        from datetime import datetime, timezone
        import json
        
        query = f'{{app="{service}"}}'
        url = f"{self.loki_url}/loki/api/v1/query_range"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, 
                    params={"query": query, "limit": limit}
                )
                response.raise_for_status()
                data = response.json()
        except Exception:
            # Fallback for when Loki isn't reachable or fails
            if self._fallback:
                return await self._fallback.get_recent_logs(service, limit=limit)
            return []

        entries = []
        if data.get("status") == "success":
            results = data.get("data", {}).get("result", [])
            for res in results:
                stream = res.get("stream", {})
                values = res.get("values", [])
                for val in values:
                    try:
                        timestamp_ns = int(val[0])
                        message = val[1]
                        dt = datetime.fromtimestamp(timestamp_ns / 1e9, tz=timezone.utc)
                        # Attempt to parse JSON log if structured
                        try:
                            parsed_msg = json.loads(message)
                            level = parsed_msg.get("level", stream.get("level", "INFO"))
                            msg_text = parsed_msg.get("message", message)
                        except json.JSONDecodeError:
                            level = stream.get("level", "INFO")
                            msg_text = message

                        entries.append(LogEntry(
                            service=service,
                            level=level,
                            message=msg_text,
                            timestamp=dt.isoformat()
                        ))
                    except Exception:
                        continue
        
        # Sort newest first
        entries.sort(key=lambda x: x.timestamp, reverse=True)
        return entries[:limit]
