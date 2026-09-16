"""LangGraph-based agent orchestration (Layer 4, Section 4).

Implements: OBSERVE -> UNDERSTAND -> RETRIEVE -> REASON -> PLAN ->
AUTHORIZE -> ACT -> VERIFY -> LEARN, with:
  * conditional routing (VERIFY can loop back to OBSERVE or go to ESCALATE)
  * pause/resume for human approval via `interrupt()` inside AUTHORIZE
  * persistent checkpointing so a run survives process restarts within
    the lifetime of the checkpointer (MemorySaver for local dev; swap for
    a Postgres/Redis checkpoint saver in production without touching any
    node code)
"""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import Command

from app.agents.nodes.act import act
from app.agents.nodes.authorize import authorize
from app.agents.nodes.escalate import escalate
from app.agents.nodes.learn import learn
from app.agents.nodes.observe import observe
from app.agents.nodes.plan import plan
from app.agents.nodes.reason import reason
from app.agents.nodes.retrieve import retrieve
from app.agents.nodes.understand import understand
from app.agents.nodes.verify import verify


class GraphState(TypedDict, total=False):
    incident_id: str
    agent_run_id: str
    affected_services: list[str]
    severity: str
    symptoms: list[str]
    telemetry_evidence: dict
    candidate_root_causes: list[dict]
    retrieved_documents: list[dict]
    similar_incidents: list[dict]
    diagnosis: str
    diagnosis_detail: dict
    confidence: float
    proposed_actions: list[dict]
    risk_level: str
    approval_status: str
    executed_tools: list[dict]
    verification_results: list[dict]
    final_status: str
    audit_events: list[str]
    current_stage: str
    retry_count: int


def _route_after_act(state: GraphState) -> str:
    return "escalate" if state.get("current_stage") == "ESCALATE" else "verify"


def _route_after_verify(state: GraphState) -> str:
    stage = state.get("current_stage")
    if stage == "LEARN":
        return "learn"
    if stage == "ESCALATE":
        return "escalate"
    return "observe"  # retry loop


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("observe", observe)
    graph.add_node("understand", understand)
    graph.add_node("retrieve", retrieve)
    graph.add_node("reason", reason)
    graph.add_node("plan", plan)
    graph.add_node("authorize", authorize)
    graph.add_node("act", act)
    graph.add_node("verify", verify)
    graph.add_node("learn", learn)
    graph.add_node("escalate", escalate)

    graph.set_entry_point("observe")
    graph.add_edge("observe", "understand")
    graph.add_edge("understand", "retrieve")
    graph.add_edge("retrieve", "reason")
    graph.add_edge("reason", "plan")
    graph.add_edge("plan", "authorize")
    graph.add_edge("authorize", "act")
    graph.add_conditional_edges("act", _route_after_act, {
        "verify": "verify", "escalate": "escalate",
    })
    graph.add_conditional_edges("verify", _route_after_verify, {
        "observe": "observe", "learn": "learn", "escalate": "escalate",
    })
    graph.add_edge("learn", END)
    graph.add_edge("escalate", END)

    return graph


# Process-wide checkpointer. Local dev only - production should use a
# durable checkpoint saver (e.g. Postgres) so pause/resume survives
# restarts across multiple API replicas.
_checkpointer = MemorySaver()
_compiled = build_graph().compile(checkpointer=_checkpointer)


def get_compiled_graph():
    return _compiled


async def run_agent(initial_state: GraphState, thread_id: str) -> dict[str, Any]:
    """Start (or continue) an agent run. Returns the graph result, which
    contains `__interrupt__` if execution paused for human approval."""
    config = {"configurable": {"thread_id": thread_id}}
    result = await _compiled.ainvoke(initial_state, config=config)
    return result


async def resume_agent(thread_id: str, decision: dict) -> dict[str, Any]:
    """Resume a paused run with a human decision, e.g.
    {"approved": True, "reason": "looks safe"}."""
    config = {"configurable": {"thread_id": thread_id}}
    result = await _compiled.ainvoke(Command(resume=decision), config=config)
    return result


def get_state(thread_id: str) -> GraphState | None:
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = _compiled.get_state(config)
    return snapshot.values if snapshot else None
