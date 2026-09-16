"""Local-dev seed data: simulated services as `Service` rows, a demo user
per role, and the operational knowledge base ingested into the vector
store. Idempotent - safe to call on every startup."""
from __future__ import annotations

import pathlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.db.models.service import Service
from app.db.models.user import User
from app.schemas.common import KnowledgeDocumentIn
from app.services.knowledge import knowledge_service
from app.simulation.engine import DEPENDENCY_GRAPH, SERVICE_NAMES

KNOWLEDGE_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "knowledge"

_SERVICE_DOC_MAP = {
    "payment_latency_runbook.md": ("payment-service", "runbook"),
    "database_connection_pool_exhaustion.md": ("payment-service", "runbook"),
    "deployment_rollback_procedure.md": ("", "sop"),
    "queue_backlog_recovery.md": ("", "runbook"),
    "dependency_failure_runbook.md": ("", "runbook"),
}

_DEMO_USERS = [
    ("admin@orvix.local", "ORVIX Admin", UserRole.ADMIN),
    ("sre@orvix.local", "ORVIX SRE", UserRole.SRE),
    ("engineer@orvix.local", "ORVIX Engineer", UserRole.ENGINEER),
    ("approver@orvix.local", "ORVIX Approver", UserRole.APPROVER),
    ("viewer@orvix.local", "ORVIX Viewer", UserRole.VIEWER),
]


async def seed_services(db: AsyncSession) -> None:
    existing = (await db.execute(select(Service.name))).scalars().all()
    for name in SERVICE_NAMES:
        if name in existing:
            continue
        db.add(Service(name=name, description=f"Simulated {name}", owner_team="platform-reliability",
                        tier="critical" if name in ("payment-service", "auth-service") else "standard",
                        tags=DEPENDENCY_GRAPH.get(name, [])))
    await db.commit()


async def seed_users(db: AsyncSession) -> None:
    existing = set((await db.execute(select(User.email))).scalars().all())
    for email, name, role in _DEMO_USERS:
        if email in existing:
            continue
        db.add(User(email=email, display_name=name, role=role))
    await db.commit()


async def seed_knowledge(db: AsyncSession) -> None:
    from app.db.models.knowledge import KnowledgeDocument
    count = (await db.execute(select(KnowledgeDocument.id))).scalars().first()
    if count is not None:
        return  # already seeded

    if not KNOWLEDGE_DIR.exists():
        return

    for filename, (service, doc_type) in _SERVICE_DOC_MAP.items():
        path = KNOWLEDGE_DIR / filename
        if not path.exists():
            continue
        content = path.read_text()
        title = content.splitlines()[0].lstrip("# ").strip()
        await knowledge_service.ingest(
            db,
            KnowledgeDocumentIn(
                title=title, source="internal", document_type=doc_type, service=service,
                version="1.0", owner="platform-reliability", tags=[doc_type], content=content,
            ),
        )


async def seed_all(db: AsyncSession) -> None:
    await seed_services(db)
    await seed_users(db)
    await seed_knowledge(db)
