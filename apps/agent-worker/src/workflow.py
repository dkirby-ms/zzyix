from __future__ import annotations

import asyncio
import inspect
import threading
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


class FrameworkRuntimeUnavailable(RuntimeError):
    """The declared Microsoft Agent Framework workflow API is unavailable."""


class GraphWorkflow:
    """Explicit supervisor-owned graph workflow for read-only proposal generation."""

    def __init__(
        self,
        tools: AgentReadTools,
        gateway: ModelGateway,
        policy_version: str,
        framework_version: str,
        structured_proposals_enabled: bool,
        allow_test_runtime: bool = False,
        framework_runtime: Any | None = None,
    ) -> None:
        self._tools = tools
        self._gateway = gateway
        self._policy_version = policy_version
        self._framework_version = framework_version
        self._structured_proposals_enabled = structured_proposals_enabled
        self._framework_runtime = framework_runtime if framework_runtime is not None else _load_framework_runtime()
        self._allow_test_runtime = allow_test_runtime
        if self._framework_runtime is None and not allow_test_runtime:
            raise FrameworkRuntimeUnavailable(
                "Microsoft Agent Framework workflow execution is not available in this build; "
                "install agent-framework>=1.13.0,<1.14.0 before starting the worker"
            )

    def run(
        self,
        run_id: str,
        trigger: WorkflowTrigger,
        lease_guard: Callable[[], bool],
        checkpoint: WorkerCheckpoint | None = None,
        checkpoint_callback: Callable[[WorkerCheckpoint], None] | None = None,
    ) -> WorkflowResult:
        if self._framework_runtime is not None:
            return _run_sync(self._run_framework_graph(
                run_id=run_id,
                trigger=trigger,
                lease_guard=lease_guard,
                checkpoint=checkpoint,
                checkpoint_callback=checkpoint_callback,
            ))

        if not self._allow_test_runtime:
            raise FrameworkRuntimeUnavailable("Agent Framework runtime is required for production workflow execution")

        return self._run_test_graph(run_id, trigger, lease_guard, checkpoint, checkpoint_callback)

    def _run_test_graph(
        self,
        run_id: str,
        trigger: WorkflowTrigger,
        lease_guard: Callable[[], bool],
        checkpoint: WorkerCheckpoint | None,
        checkpoint_callback: Callable[[WorkerCheckpoint], None] | None,
    ) -> WorkflowResult:
        state: dict[str, Any] = {
            "trigger": trigger,
            "tool_outputs": {},
            "proposal": {
                "summary": "No proposal generated.",
                "actions": [{"type": "observe", "target": trigger.quilt_id}],
            },
            "gateway": None,
        }

        node: str | None = checkpoint.workflow_state if checkpoint is not None else "load_context"
        if node in {"completed", "lease_lost"}:
            node = None

        if checkpoint_callback is not None and checkpoint is None:
            checkpoint_callback(self._checkpoint_for(run_id, trigger.quilt_id, "load_context", [trigger.trigger_id]))

        while node is not None:
            if not lease_guard():
                checkpoint = self._checkpoint_for(run_id, trigger.quilt_id, "lease_lost", [trigger.trigger_id])
                if checkpoint_callback is not None:
                    checkpoint_callback(checkpoint)
                return WorkflowResult(
                    status="lease_lost",
                    proposal=state["proposal"],
                    checkpoint=checkpoint,
                    gateway=state["gateway"],
                )

            if node == "load_context":
                state["tool_outputs"]["context"] = self._tools.get_quilt_context(QuiltContextInput(quilt_id=trigger.quilt_id))
                next_node = "load_events"
            elif node == "load_events":
                patch_id = trigger.payload.get("patchId")
                if isinstance(patch_id, str):
                    state["tool_outputs"]["events"] = self._tools.get_patch_events(
                        PatchEventsInput(patch_id=patch_id, after_op_seq=0, limit=50)
                    )
                else:
                    state["tool_outputs"]["events"] = {"operations": [], "operationCount": 0}
                next_node = "draft_proposal"
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
                next_node = None
            else:
                raise RuntimeError(f"unknown graph node: {node}")

            if not lease_guard():
                checkpoint = self._checkpoint_for(run_id, trigger.quilt_id, "lease_lost", [trigger.trigger_id])
                if checkpoint_callback is not None:
                    checkpoint_callback(checkpoint)
                return WorkflowResult(
                    status="lease_lost",
                    proposal=state["proposal"],
                    checkpoint=checkpoint,
                    gateway=state["gateway"],
                )

            node = next_node
            if checkpoint_callback is not None:
                checkpoint_callback(
                    self._checkpoint_for(
                        run_id,
                        trigger.quilt_id,
                        node or "completed",
                        [] if node is None else [trigger.trigger_id],
                    )
                )

        checkpoint = self._checkpoint_for(run_id, trigger.quilt_id, "completed", [])
        return WorkflowResult(
            status="completed",
            proposal=state["proposal"],
            checkpoint=checkpoint,
            gateway=state["gateway"],
        )

    async def _run_framework_graph(
        self,
        run_id: str,
        trigger: WorkflowTrigger,
        lease_guard: Callable[[], bool],
        checkpoint: WorkerCheckpoint | None,
        checkpoint_callback: Callable[[WorkerCheckpoint], None] | None,
    ) -> WorkflowResult:
        state: dict[str, Any] = {
            "trigger": trigger,
            "tool_outputs": {},
            "proposal": {
                "summary": "No proposal generated.",
                "actions": [{"type": "observe", "target": trigger.quilt_id}],
            },
            "gateway": None,
        }
        node = checkpoint.workflow_state if checkpoint is not None else "load_context"
        if node == "completed":
            return WorkflowResult("completed", state["proposal"], checkpoint or self._checkpoint_for(run_id, trigger.quilt_id, "completed", []), None)
        if node == "lease_lost":
            return WorkflowResult("lease_lost", state["proposal"], checkpoint or self._checkpoint_for(run_id, trigger.quilt_id, "lease_lost", [trigger.trigger_id]), None)

        if checkpoint_callback is not None and checkpoint is None:
            await asyncio.to_thread(
                checkpoint_callback,
                self._checkpoint_for(run_id, trigger.quilt_id, "load_context", [trigger.trigger_id]),
            )

        graph_nodes = ["load_context", "load_events", "draft_proposal"]
        try:
            start_index = graph_nodes.index(node)
        except ValueError as exc:
            raise RuntimeError(f"unknown graph node: {node}") from exc

        executors = [
            self._make_framework_executor(
                node_name=node_name,
                run_id=run_id,
                trigger=trigger,
                lease_guard=lease_guard,
                checkpoint_callback=checkpoint_callback,
                state=state,
            )
            for node_name in graph_nodes[start_index:]
        ]
        builder = self._framework_runtime.WorkflowBuilder(start_executor=executors[0])
        if len(executors) > 1:
            builder.add_chain(executors[1:])
        result = await builder.build().run(state)
        output = result.get_outputs()[-1]
        return WorkflowResult(
            status=output["status"],
            proposal=output["proposal"],
            checkpoint=output["checkpoint"],
            gateway=output["gateway"],
        )

    def _make_framework_executor(
        self,
        node_name: str,
        run_id: str,
        trigger: WorkflowTrigger,
        lease_guard: Callable[[], bool],
        checkpoint_callback: Callable[[WorkerCheckpoint], None] | None,
        state: dict[str, Any],
    ) -> Any:
        runtime = self._framework_runtime

        async def execute(_executor: Any, message: dict[str, Any], context: Any) -> None:
            if not await asyncio.to_thread(lease_guard):
                await self._emit_framework_result(context, state, run_id, trigger, checkpoint_callback, "lease_lost")
                return

            if node_name == "load_context":
                state["tool_outputs"]["context"] = await asyncio.to_thread(
                    self._tools.get_quilt_context, QuiltContextInput(quilt_id=trigger.quilt_id)
                )
                next_node = "load_events"
            elif node_name == "load_events":
                patch_id = trigger.payload.get("patchId")
                if isinstance(patch_id, str):
                    state["tool_outputs"]["events"] = await asyncio.to_thread(
                        self._tools.get_patch_events,
                        PatchEventsInput(patch_id=patch_id, after_op_seq=0, limit=50),
                    )
                else:
                    state["tool_outputs"]["events"] = {"operations": [], "operationCount": 0}
                next_node = "draft_proposal"
            elif node_name == "draft_proposal":
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
                    gateway_response = await asyncio.to_thread(
                        self._gateway.generate,
                        GatewayRequest(
                            run_id=run_id,
                            quilt_id=trigger.quilt_id,
                            prompt="Generate an observation-only proposal from supplied context.",
                            tool_context=state["tool_outputs"],
                        ),
                    )
                    state["gateway"] = gateway_response
                    state["proposal"] = gateway_response.structured_output
                next_node = None
            else:  # pragma: no cover - graph construction controls this value
                raise RuntimeError(f"unknown graph node: {node_name}")

            if not await asyncio.to_thread(lease_guard):
                await self._emit_framework_result(context, state, run_id, trigger, checkpoint_callback, "lease_lost")
                return

            if checkpoint_callback is not None:
                await asyncio.to_thread(
                    checkpoint_callback,
                    self._checkpoint_for(
                        run_id,
                        trigger.quilt_id,
                        next_node or "completed",
                        [] if next_node is None else [trigger.trigger_id],
                    ),
                )

            if next_node is None:
                await self._emit_framework_result(context, state, run_id, trigger, None, "completed")
            else:
                await _maybe_await(context.send_message(message))

        decorated = runtime.handler(execute, input=dict, output=dict, workflow_output=dict)
        executor_type = type(
            f"{node_name.title().replace('_', '')}Executor",
            (runtime.Executor,),
            {"__init__": lambda instance: runtime.Executor.__init__(instance, node_name), "handle": decorated},
        )
        return executor_type()

    async def _emit_framework_result(
        self,
        context: Any,
        state: dict[str, Any],
        run_id: str,
        trigger: WorkflowTrigger,
        checkpoint_callback: Callable[[WorkerCheckpoint], None] | None,
        status: str,
    ) -> None:
        workflow_checkpoint = self._checkpoint_for(
            run_id,
            trigger.quilt_id,
            status,
            [trigger.trigger_id] if status == "lease_lost" else [],
        )
        if checkpoint_callback is not None:
            await asyncio.to_thread(checkpoint_callback, workflow_checkpoint)
        await _maybe_await(context.yield_output({
            "status": status,
            "proposal": state["proposal"],
            "checkpoint": workflow_checkpoint,
            "gateway": state["gateway"],
        }))

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
    if _load_framework_runtime() is None:
        return "unavailable"
    return "agent-framework-api-present"


def _run_sync(awaitable: Any) -> Any:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(awaitable)

    result: list[Any] = []
    error: list[BaseException] = []

    def run_in_thread() -> None:
        try:
            result.append(asyncio.run(awaitable))
        except BaseException as exc:  # pragma: no cover - only used by async callers
            error.append(exc)

    thread = threading.Thread(target=run_in_thread, name="agent-framework-run", daemon=True)
    thread.start()
    thread.join()
    if error:
        raise error[0]
    return result[0]


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _load_framework_runtime() -> Any | None:
    """Return the supported framework API, never a local substitute."""
    try:
        import agent_framework  # type: ignore
    except ImportError:
        return None

    required = ("WorkflowBuilder", "Executor", "WorkflowContext", "handler")
    return agent_framework if all(hasattr(agent_framework, name) for name in required) else None
