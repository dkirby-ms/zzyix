from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from checkpoints import WorkerCheckpoint
from gateway import GatewayRequest, GatewayResponse, ModelGateway
from tools import AgentReadTools, PatchEventsInput, QuiltContextInput


@dataclass(frozen=True)
class WorkflowTrigger:
    trigger_id: str
    quilt_id: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class WorkflowResult:
    status: str
    proposal: dict[str, Any]
    checkpoint: WorkerCheckpoint
    gateway: GatewayResponse | None


class GraphWorkflow:
    """Explicit supervisor-owned graph workflow for read-only proposal generation."""

    def __init__(
        self,
        tools: AgentReadTools,
        gateway: ModelGateway,
        policy_version: str,
        framework_version: str,
        structured_proposals_enabled: bool,
    ) -> None:
        self._tools = tools
        self._gateway = gateway
        self._policy_version = policy_version
        self._framework_version = framework_version
        self._structured_proposals_enabled = structured_proposals_enabled
        self._graph = {
            "load_context": "load_events",
            "load_events": "draft_proposal",
            "draft_proposal": None,
        }

    def run(self, run_id: str, trigger: WorkflowTrigger, lease_guard: Callable[[], bool]) -> WorkflowResult:
        state: dict[str, Any] = {
            "trigger": trigger,
            "tool_outputs": {},
            "proposal": {
                "summary": "No proposal generated.",
                "actions": [{"type": "observe", "target": trigger.quilt_id}],
            },
            "gateway": None,
        }

        node: str | None = "load_context"
        while node is not None:
            if not lease_guard():
                checkpoint = self._checkpoint_for(run_id, trigger.quilt_id, "lease_lost", [trigger.trigger_id])
                return WorkflowResult(
                    status="lease_lost",
                    proposal=state["proposal"],
                    checkpoint=checkpoint,
                    gateway=state["gateway"],
                )

            if node == "load_context":
                state["tool_outputs"]["context"] = self._tools.get_quilt_context(QuiltContextInput(quilt_id=trigger.quilt_id))
            elif node == "load_events":
                patch_id = trigger.payload.get("patchId")
                if isinstance(patch_id, str):
                    state["tool_outputs"]["events"] = self._tools.get_patch_events(
                        PatchEventsInput(patch_id=patch_id, after_op_seq=0, limit=50)
                    )
                else:
                    state["tool_outputs"]["events"] = {"operations": [], "operationCount": 0}
            elif node == "draft_proposal":
                if not self._structured_proposals_enabled:
                    state["gateway"] = GatewayResponse(
                        provider="feature-gate",
                        model="structured-proposals-disabled",
                        request_id=f"gate-{run_id[:8]}",
                        structured_output=state["proposal"],
                        used_fallback=True,
                        fallback_reason="structured_proposals_disabled",
                    )
                else:
                    gateway_response = self._gateway.generate(
                        GatewayRequest(
                            run_id=run_id,
                            quilt_id=trigger.quilt_id,
                            prompt="Generate an observation-only proposal from supplied context.",
                            tool_context=state["tool_outputs"],
                        )
                    )
                    state["gateway"] = gateway_response
                    state["proposal"] = gateway_response.structured_output
            else:
                raise RuntimeError(f"unknown graph node: {node}")

            node = self._graph[node]

        checkpoint = self._checkpoint_for(run_id, trigger.quilt_id, "completed", [])
        return WorkflowResult(
            status="completed",
            proposal=state["proposal"],
            checkpoint=checkpoint,
            gateway=state["gateway"],
        )

    def _checkpoint_for(self, run_id: str, quilt_id: str, workflow_state: str, pending_trigger_ids: list[str]) -> WorkerCheckpoint:
        return WorkerCheckpoint(
            quilt_id=quilt_id,
            run_id=run_id,
            checkpoint_version=1,
            workflow_state=workflow_state,
            observed_revision=None,
            pending_trigger_ids=tuple(pending_trigger_ids),
            policy_version=self._policy_version,
            framework_version=self._framework_version,
            updated_at=datetime.now(timezone.utc),
        )


def detect_graph_runtime() -> str:
    try:
        import agent_framework  # type: ignore  # noqa: F401
    except ImportError:
        return "internal-graph"

    return "agent-framework-graph"
