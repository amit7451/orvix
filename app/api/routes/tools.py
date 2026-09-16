from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.enums import UserRole
from app.core.events import EventType, event_bus
from app.policy.engine import policy_engine
from app.schemas.common import ToolExecuteIn, ToolOut, ToolResultOut
from app.tools.registry import tool_registry

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("", response_model=list[ToolOut])
async def list_tools():
    return [
        ToolOut(name=t.name, description=t.description, risk_level=t.risk_level, input_schema=t.input_schema)
        for t in tool_registry.list()
    ]


@router.post("/{tool_name}/execute", response_model=ToolResultOut)
async def execute_tool(tool_name: str, payload: ToolExecuteIn):
    """Human-triggered tool execution. Still enforced by the policy engine -
    the API is never a bypass around authorization (Section 27)."""
    tool = tool_registry.get(tool_name)
    if tool is None:
        raise HTTPException(404, f"Unknown tool: {tool_name}")

    evaluation = policy_engine.evaluate_human_action(UserRole.SRE, tool_name)
    if evaluation.decision.value == "DENY":
        raise HTTPException(403, "; ".join(evaluation.reasons))
    if evaluation.decision.value == "REQUIRE_APPROVAL":
        raise HTTPException(
            428, "This action requires approval; submit it through /api/incidents/{id}/investigate "
                 "so it is tracked through the approval workflow instead of direct execution.",
        )

    await event_bus.publish(EventType.TOOL_STARTED, tool=tool_name, requested_by=payload.requested_by)
    result = await tool.run(payload.arguments)
    await event_bus.publish(EventType.TOOL_COMPLETED, tool=tool_name, status=result.status)
    return ToolResultOut(**result.to_dict())
