"""Audit memory: append-only record of every agent/system decision
(Section 17). Nothing here is ever updated or deleted."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit import AuditLog

_SENSITIVE_KEYS = {"api_key", "password", "token", "secret", "access_token"}


def _scrub(details: dict) -> dict:
    """Defense in depth: strip anything that looks like a secret before
    it ever reaches persistent audit storage (Section 30)."""
    clean = {}
    for k, v in details.items():
        if any(s in k.lower() for s in _SENSITIVE_KEYS):
            clean[k] = "***REDACTED***"
        elif isinstance(v, dict):
            clean[k] = _scrub(v)
        else:
            clean[k] = v
    return clean


async def record(
    db: AsyncSession, *, actor: str, action: str, entity_type: str, entity_id: str, details: dict | None = None
) -> AuditLog:
    entry = AuditLog(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=_scrub(details or {}),
    )
    db.add(entry)
    await db.flush()
    return entry
