from __future__ import annotations

from gateway import GatewayRequest, GatewayResponse, ModelGateway
from workflow import GraphWorkflow, WorkflowTrigger


class _FakeFramework:
    class Executor:
        def __init__(self, executor_id):
            self.id = executor_id

    @staticmethod
    def handler(function, **_kwargs):
        return function

    class WorkflowBuilder:
        def __init__(self, *, start_executor):
            self.start_executor = start_executor
            self.executors = [start_executor]

        def add_chain(self, executors):
            self.executors.extend(executors)
            return self

        def build(self):
            return _FakeWorkflow(self.executors)


class _FakeWorkflow:
    def __init__(self, executors):
        self.executors = executors

    async def run(self, message):
        outputs = []
        for index, executor in enumerate(self.executors):
            context = _FakeContext(outputs, self.executors[index + 1] if index + 1 < len(self.executors) else None)
            await executor.handle(message, context)
            if context.next_executor is None:
                break
        return _FakeRunResult(outputs)


class _FakeContext:
    def __init__(self, outputs, next_executor):
        self.outputs = outputs
        self.next_executor = next_executor

    async def send_message(self, _message):
        return None

    async def yield_output(self, output):
        self.outputs.append(output)


class _FakeRunResult:
    def __init__(self, outputs):
        self.outputs = outputs

    def get_outputs(self):
        return self.outputs


class _ToolsStub:
    def __init__(self):
        self.calls = []

    def get_quilt_context(self, request):
        del request
        self.calls.append("context")
        return {"patchCount": 1, "topology": {"quiltId": "q1"}}

    def get_patch_events(self, request):
        del request
        self.calls.append("events")
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
    tools = _ToolsStub()
    workflow = GraphWorkflow(
        tools=tools,
        gateway=gateway,
        policy_version="v1",
        framework_version="mvp",
        structured_proposals_enabled=True,
        allow_test_runtime=True,
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
    assert tools.calls == ["context"]
    assert gateway.calls == 0


def test_given_valid_trigger_when_running_then_returns_read_only_proposal() -> None:
    gateway = _GatewayStub()
    workflow = GraphWorkflow(
        tools=_ToolsStub(),
        gateway=gateway,
        policy_version="v1",
        framework_version="mvp",
        structured_proposals_enabled=True,
        allow_test_runtime=True,
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
        allow_test_runtime=True,
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


def test_given_injected_framework_when_running_without_test_flag_then_uses_framework_graph() -> None:
    gateway = _GatewayStub()
    workflow = GraphWorkflow(
        tools=_ToolsStub(),
        gateway=gateway,
        policy_version="v1",
        framework_version="1.13.0",
        structured_proposals_enabled=True,
        framework_runtime=_FakeFramework,
    )

    result = workflow.run(
        run_id="run-framework",
        trigger=WorkflowTrigger(trigger_id="t-framework", quilt_id="40000000-0000-4000-8000-000000000001", payload={}),
        lease_guard=lambda: True,
    )

    assert result.status == "completed"
    assert gateway.calls == 1
