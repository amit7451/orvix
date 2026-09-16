from __future__ import annotations

import os
import asyncio

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_orvix.db")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield

    try:
        from app.db.session import engine
        asyncio.run(engine.dispose())
    except (ImportError, AttributeError):
        pass

    for f in ("test_orvix.db",):
        if os.path.exists(f):
            try:
                os.remove(f)
            except PermissionError:
                pass


@pytest_asyncio.fixture
async def client():
    from app.db.session import init_db
    from app.main import app

    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test"
    ) as ac:
        yield ac