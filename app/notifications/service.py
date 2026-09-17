"""Notification engine (Section 23).

Adapter-based, configurable through environment variables. Console adapter
always works offline; webhook/Slack/Teams/email adapters activate only
when the relevant env var is configured, and fail soft (never raise into
the agent loop) if delivery fails.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.core.config import settings
from app.core.events import EventType, event_bus

logger = logging.getLogger("orvix.notifications")


class NotificationAdapter(ABC):
    channel: str

    @abstractmethod
    async def send(self, subject: str, body: str, meta: dict[str, Any]) -> bool: ...


class ConsoleAdapter(NotificationAdapter):
    channel = "console"

    async def send(self, subject: str, body: str, meta: dict[str, Any]) -> bool:
        logger.info("NOTIFY [%s] %s :: %s", meta.get("severity", "INFO"), subject, body)
        return True


class WebhookAdapter(NotificationAdapter):
    channel = "webhook"

    def __init__(self, url: str) -> None:
        self._url = url

    async def send(self, subject: str, body: str, meta: dict[str, Any]) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(self._url, json={"subject": subject, "body": body, "meta": meta})
                return resp.status_code < 400
        except httpx.HTTPError as exc:
            logger.warning("Webhook notification failed: %s", exc)
            return False


class SlackAdapter(NotificationAdapter):
    channel = "slack"

    def __init__(self, webhook_url: str) -> None:
        self._url = webhook_url

    async def send(self, subject: str, body: str, meta: dict[str, Any]) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(self._url, json={"text": f"*{subject}*\n{body}"})
                return resp.status_code < 400
        except httpx.HTTPError as exc:
            logger.warning("Slack notification failed: %s", exc)
            return False


class TeamsAdapter(NotificationAdapter):
    channel = "teams"

    def __init__(self, webhook_url: str) -> None:
        self._url = webhook_url

    async def send(self, subject: str, body: str, meta: dict[str, Any]) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(self._url, json={"title": subject, "text": body})
                return resp.status_code < 400
        except httpx.HTTPError as exc:
            logger.warning("Teams notification failed: %s", exc)
            return False


class EmailAdapter(NotificationAdapter):
    """Placeholder adapter: production would integrate SES/SendGrid/SMTP.
    Kept as a clean extension point behind the same interface."""

    channel = "email"

    async def send(self, subject: str, body: str, meta: dict[str, Any]) -> bool:
        if not settings.notification_email_from:
            logger.info("Email adapter not configured; skipping send for %r", subject)
            return False
        logger.info("EMAIL from=%s subject=%s", settings.notification_email_from, subject)
        return True


class NotificationService:
    def __init__(self) -> None:
        self._adapters: dict[str, NotificationAdapter] = {"console": ConsoleAdapter()}
        if settings.slack_webhook_url:
            self._adapters["slack"] = SlackAdapter(settings.slack_webhook_url)
        if settings.teams_webhook_url:
            self._adapters["teams"] = TeamsAdapter(settings.teams_webhook_url)
        self._adapters["email"] = EmailAdapter()

    def register_webhook(self, url: str) -> None:
        self._adapters["webhook"] = WebhookAdapter(url)

    async def notify(
        self, *, channel: str, subject: str, body: str, incident_id: str | None = None, meta: dict | None = None
    ) -> dict:
        adapter = self._adapters.get(channel, self._adapters["console"])
        meta = meta or {}
        delivered = await adapter.send(subject, body, meta)
        if not delivered and channel != "console":
            # Fail soft to console so the on-call engineer still sees it.
            await self._adapters["console"].send(subject, body, meta)
        await event_bus.publish(
            EventType.NOTIFICATION_SENT,
            channel=adapter.channel,
            subject=subject,
            delivered=delivered,
            incident_id=incident_id,
        )
        return {"channel": adapter.channel, "delivered": delivered, "incident_id": incident_id}


notification_service = NotificationService()
