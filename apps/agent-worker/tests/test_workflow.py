from __future__ import annotations

from gateway import GatewayRequest, GatewayResponse, ModelGateway
from workflow import GraphWorkflow, WorkflowTrigger


class _ToolsStub:
    def get_quilt_context(self, request):
        del request
        return {"patchCount": 1, "topology": {"quiltId": "q1"}}

    def get_patch_events(self, request):
        del request
        return {"operationCount": 0, "operations": []}


class _GatewayStub(ModelGateway):
    def __init__(self):
        self.calls = 0

    def generate(self, request: GatewayRequest) -> GatewayResponse:
        self.calls += 1
        return GatewayResponse(
            provider="fake",
            model="deterministic-v1",
            request_id="req-1",
            structured_output={
                "summary": "observe only",
                "actions": [{"type": "observe", "target": request.quilt_id}],
            },
            used_fallback=False,
            fallback_reason=None,
        )


def test_given_lease_loss_mid_graph_when_running_then_stops_before_gateway_call() -> None:
    gateway = _GatewayStub()
    workflow = GraphWorkflow(
        tools=_ToolsStub(),
        gateway=gateway,
        policy_version="v1",
        framework_version="mvp",
        structured_proposals_enabled=True,
    )

    calls = {"count": 0}

    def lease_guard() -> bool:
        calls["count"] += 1
        return calls["count"] < 3

    result = workflow.run(
        run_id="run-1",
        trigger=WorkflowTrigger(trigger_id="t1", quilt_id="40000000-0000-4000-8000-000000000001", payload={}),
        lease_guard=lease_guard,
    )

    assert result.status == "lease_lost"
    assert gateway.calls == 0


def test_given_valid_trigger_when_running_then_returns_read_only_proposal() -> None:
    gateway = _GatewayStub()
    workflow = GraphWorkflow(
        tools=_ToolsStub(),
        gateway=gateway,
        policy_version="v1",
        framework_version="mvp",
        structured_proposals_enabled=True,
    )

    result = workflow.run(
        run_id="run-1",
        trigger=WorkflowTrigger(trigger_id="t1", quilt_id="40000000-0000-4000-8000-000000000001", payload={}),
        lease_guard=lambda: True,
    )

    assert result.status == "completed"
    assert result.proposal["actions"] == [{"type": "observe", "target": "40000000-0000-4000-8000-000000000001"}]


def test_given_structured_proposals_disabled_when_running_then_skips_gateway_call() -> None:
    gateway = _GatewayStub()
    workflow = GraphWorkflow(
        tools=_ToolsStub(),
        gateway=gateway,
        policy_version="v1",
        framework_version="mvp",
        structured_proposals_enabled=False,
    )

    result = workflow.run(
        run_id="run-2",
        trigger=WorkflowTrigger(trigger_id="t2", quilt_id="40000000-0000-4000-8000-000000000001", payload={}),
        lease_guard=lambda: True,
    )

    assert result.status == "completed"
    assert gateway.calls == 0
    assert result.gateway is not None
    assert result.gateway.fallback_reason == "structured_proposals_disabled"
