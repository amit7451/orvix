from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.incidents.service import incident_service
from app.schemas.common import AgentRunOut
from app.services.agent_runner import start_run

router = APIRouter(prefix="/api/agent", tags=["agent"])


class AgentRunIn(BaseModel):
    incident_id: str


@router.post("/run", response_model=AgentRunOut, status_code=201)
async def run_agent_endpoint(payload: AgentRunIn, db: AsyncSession = Depends(get_db)):
    incident = await incident_service.get(db, payload.incident_id)
    if incident is None:
        raise HTTPException(404, "Incident not found")
    run = await start_run(db, incident)
    return run


@router.get("/runs/{run_id}", response_model=AgentRunOut)
async def get_agent_run(run_id: str, db: AsyncSession = Depends(get_db)):
    from app.db.models.agent_run import AgentRun

    run = await db.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(404, "Agent run not found")
    return run
