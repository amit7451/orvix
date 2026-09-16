"""Async SQLAlchemy engine/session management."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create tables. Alembic manages production migrations; this is a
    local-dev convenience so the demo runs with zero manual setup."""
    from app.db.models import (  # noqa: F401  (ensure models are registered)
        agent_run,
        approval,
        audit,
        incident,
        knowledge,
        notification,
        service,
        tool_call,
        user,
        verification,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
