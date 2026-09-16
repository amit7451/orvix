"""Short-term memory helpers: persist/restore an `AgentState` snapshot so
the LangGraph-style workflow can pause and resume across a human approval
wait (Section 14). The canonical `AgentState` type lives in
`app.agents.state` to avoid a circular import between agents/ and memory/.
"""
from __future__ import annotations

from app.agents.state import AgentState
from app.db.models.agent_run import AgentRun


def snapshot(run: AgentRun, state: AgentState) -> None:
    run.state = state.to_dict()
    run.current_stage = state.current_stage


def restore(run: AgentRun) -> AgentState:
    return AgentState.from_dict(run.state)
