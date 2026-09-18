"""ORVIX - Observe, Reason, Verify & Execute Intelligence.

Autonomous AI backend reliability & incident-response platform.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    agent,
    analytics,
    approvals,
    health,
    incidents,
    knowledge,
    notifications,
    realtime,
    services,
    simulation,
    testing,
    tools,
)
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal, init_db
from app.services.seed import seed_all
from app.services.watcher import watcher

configure_logging()
logger = logging.getLogger("orvix.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s (%s) - environment=%s, llm_provider=%s",
                settings.app_name, settings.app_tagline, settings.environment, settings.llm_provider)
    await init_db()
    async with SessionLocal() as db:
        await seed_all(db)
    watcher.start()
    logger.info("ORVIX is up. Autonomous monitoring loop active.")
    yield
    await watcher.stop()
    logger.info("ORVIX shutting down.")


app = FastAPI(
    title=settings.app_name,
    description=f"{settings.app_tagline} — Autonomous AI Backend Reliability & Incident Response Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    health.router,
    services.router,
    incidents.router,
    agent.router,
    approvals.router,
    knowledge.router,
    tools.router,
    notifications.router,
    analytics.router,
    simulation.router,
    realtime.router,
    testing.router,
):
    app.include_router(router)


@app.get("/")
async def root():
    return {
        "product": settings.app_name,
        "tagline": settings.app_tagline,
        "category": "Autonomous AI Backend Reliability & Incident Response Platform",
        "operating_model": "Observe -> Diagnose -> Retrieve -> Plan -> Act -> Verify",
        "docs": "/docs",
    }
