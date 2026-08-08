---
title: Microsoft Agent Framework Python API Research
description: Exact Python workflow API available to the agent-worker dependency
ms.date: 2026-08-07
ms.topic: reference
keywords:
  - microsoft agent framework
  - agent-framework
  - python
  - workflow
  - agent worker
---

## Research Scope

Investigate the exact Microsoft Agent Framework Python API available to `apps/agent-worker`, especially version 1.13.0. Determine whether it exposes `WorkflowBuilder`, `Executor`, `WorkflowContext`, `handler`, or another supported graph workflow API, and assess whether that API can preserve the worker's synchronous `GraphWorkflow.run` contract.

## Repository Anchors

* Dependency declaration: `apps/agent-worker/pyproject.toml`
* Container installation: `apps/agent-worker/Dockerfile`
* Current adapter probe and synchronous contract: `apps/agent-worker/src/workflow.py`
* Existing behavior tests: `apps/agent-worker/tests/test_workflow.py`

## Working Hypothesis

The current top-level-symbol probe may not match the actual public API of the resolved `agent-framework` release. Runtime introspection of version 1.13.0 and the Docker-resolved dependency will distinguish an import-path mismatch from the absence of a compatible workflow API.

## Verification Plan

1. Resolve or build the worker dependency in a disposable container.
2. Print package metadata, module symbols, import paths, signatures, and source locations for workflow-related APIs.
3. Compare the discovered execution model with `GraphWorkflow.run`, including synchronous tool calls, lease checks, checkpoint callbacks, and resumable node state.
4. Record a minimal adapter design or the required version and implementation change.

## Findings

### Dependency Resolution

`apps/agent-worker/pyproject.toml` declares `agent-framework>=0.1.0` and has no
lockfile or upper bound. `apps/agent-worker/Dockerfile` runs `pip install .`,
so the image resolves the newest compatible release at build time. A clean
Python 3.11 worker image built from that Dockerfile resolved:

```text
agent-framework 1.13.0
module /usr/local/lib/python3.11/site-packages/agent_framework/__init__.py
Requires-Python >=3.10
```

An isolated install of `agent-framework==1.13.0` produced the same public
surface. The top-level module exports all four symbols currently required by
`_load_framework_runtime` in `apps/agent-worker/src/workflow.py`:

```python
import agent_framework

agent_framework.WorkflowBuilder
agent_framework.Executor
agent_framework.WorkflowContext
agent_framework.handler
```

The current probe therefore returns the framework module for version 1.13.0.
However, `GraphWorkflow` does not yet invoke the loaded module. Its execution
remains the local synchronous `while` loop, and production construction still
rejects the runtime because `allow_test_runtime=False` raises
`FrameworkRuntimeUnavailable` unconditionally after the import probe.

### Public Graph API

The exact public imports and signatures observed in the 1.13.0 worker image
are:

```python
from agent_framework import (
    Executor,
    WorkflowBuilder,
    WorkflowContext,
    WorkflowRunResult,
    handler,
)

WorkflowBuilder(
    max_iterations: int = 100,
    name: str | None = None,
    description: str | None = None,
    *,
    start_executor: Executor | SupportsAgentRun,
    checkpoint_storage: CheckpointStorage | None = None,
    output_from: list[Executor | SupportsAgentRun] | Literal["all"] | None = _DEFAULT,
    intermediate_output_from: list[Executor | SupportsAgentRun] | Literal["all", "all_other"] | None = _DEFAULT,
    output_executors: list[Executor | SupportsAgentRun] | None = _DEFAULT,
)

WorkflowBuilder.add_chain(
    self,
    executors: Sequence[Executor | SupportsAgentRun],
) -> Self

WorkflowBuilder.add_edge(
    self,
    source: Executor | SupportsAgentRun,
    target: Executor | SupportsAgentRun,
    condition: Callable[[Any], bool | Awaitable[bool]] | None = None,
) -> Self

WorkflowBuilder.build(self) -> Workflow

Executor(id: str, *, type: str | None = None, type_: str | None = None,
         defer_discovery: bool = False, **_: Any) -> None

@handler(
    func: Callable[[ExecutorT, Any, ContextT], Awaitable[Any]] | None = None,
    *,
    input: type | UnionType | str | None = None,
    output: type | UnionType | str | None = None,
    workflow_output: type | UnionType | str | None = None,
)

WorkflowContext(
    executor: Executor,
    source_executor_ids: list[str],
    state: State,
    runner_context: RunnerContext,
    trace_contexts: list[dict[str, str]] | None = None,
    source_span_ids: list[str] | None = None,
    request_id: str | None = None,
)

WorkflowContext.send_message(self, message: OutT, target_id: str | None = None) -> None
WorkflowContext.yield_output(self, output: W_OutT) -> None
WorkflowContext.set_state(self, key: str, value: Any) -> None
WorkflowContext.get_state(self, key: str, default: Any = None) -> Any
```

The reflected implementation modules for those public exports are
`agent_framework._workflows._workflow_builder.WorkflowBuilder`,
`agent_framework._workflows._executor.Executor` and `handler`,
`agent_framework._workflows._workflow_context.WorkflowContext`, and
`agent_framework._workflows._workflow.Workflow` and `WorkflowRunResult`.
The supported import surface is the top-level `agent_framework` package; the
underscored modules are implementation locations, not recommended imports.

The base executor dispatch method is also exposed as:

```python
Executor.execute(
  self,
  message: Any,
  source_executor_ids: list[str],
  state: State,
  runner_context: RunnerContext,
  trace_contexts: list[dict[str, str]] | None = None,
  source_span_ids: list[str] | None = None,
) -> None
```

Concrete executors should register handlers with `@handler`; overriding the
base dispatch method is not needed for the adapter.

`handler` registers an async method on an `Executor`. With explicit decorator
types, `input` is required and all types come from the decorator rather than
signature inference. A handler can emit the next graph message with
`await ctx.send_message(value)` and a workflow result with
`await ctx.yield_output(value)` in the user-facing examples. The reflected
runtime signature itself is not marked `async`, but the framework invokes the
decorated awaitable handler inside its async runner.

The built workflow exposes:

```python
Workflow.run(
    self,
    message: Any | None = None,
    *,
    stream: bool = False,
    responses: Mapping[str, Any] | None = None,
    checkpoint_id: str | None = None,
    checkpoint_storage: CheckpointStorage | None = None,
    include_status_events: bool = False,
    function_invocation_kwargs: Mapping[str, Mapping[str, Any]] | Mapping[str, Any] | None = None,
    client_kwargs: Mapping[str, Mapping[str, Any]] | Mapping[str, Any] | None = None,
) -> ResponseStream[WorkflowEvent, WorkflowRunResult] | Awaitable[WorkflowRunResult]
```

The non-streaming result is `WorkflowRunResult`, which is a list-like object
with `get_outputs()`, `get_intermediate_outputs()`, `get_final_state()`, and
`status_timeline()` methods. A disposable two-node graph returned
`WorkflowRunResult`, nine events, and the expected final output when invoked
with `asyncio.run(workflow.run("start"))`.

### Other Exposed Workflow APIs

Version 1.13.0 also exports `Workflow`, `WorkflowExecutor`, `WorkflowAgent`,
`FunctionalWorkflow`, `WorkflowCheckpoint`, `WorkflowEvent`, and the
experimental functional decorators `workflow` and `step`. The functional
`step` signature is:

```python
step(
    func: Callable[..., Awaitable[Any]] | None = None,
    *,
    name: str | None = None,
) -> StepWrapper[Any] | Callable[[Callable[..., Awaitable[Any]]], StepWrapper[Any]]
```

The graph API built from `Executor` and `WorkflowBuilder` is the better fit for
the current explicit node model. It provides stable named executors and typed
edges without making the worker depend on the functional workflow decorator.

### Compatibility With `GraphWorkflow.run`

The framework API is compatible with the worker contract only through an
adapter. The mismatch is execution style and checkpoint ownership, not missing
symbols:

* Framework handlers and `Workflow.run` are async/await based; the worker's
  `GraphWorkflow.run` and `AgentSupervisor.process_once` are synchronous.
* Framework checkpoints use `WorkflowCheckpoint` with graph signature, message
  queues, state, iteration count, and framework checkpoint IDs. The worker uses
  its own `WorkerCheckpoint` with `workflow_state`, pending trigger IDs, policy
  version, and database compare-and-set persistence.
* Framework `WorkflowContext` supports state and message/output emission, but it
  does not replace the worker's lease guard or database checkpoint callback.
* The current `load_context -> load_events -> draft_proposal` sequence is a
  linear graph, so `WorkflowBuilder.add_chain` is sufficient. The durable
  checkpoint should select the remaining suffix, such as
  `WorkflowBuilder(start_executor=events_executor).add_edge(...).build()` after
  a `load_context` checkpoint, rather than treating the framework checkpoint as
  the control-plane record.

Minimal adapter design:

1. Define one `Executor` subclass per node. Each subclass calls the existing
   synchronous tool or gateway implementation from an async `@handler`, using
   typed input/output dataclasses or dictionaries. The final executor calls
   `ctx.yield_output` with a small internal result object containing proposal,
   gateway response, and tool state.
2. Build the required suffix graph from the loaded `WorkerCheckpoint` and keep
   the executor IDs equal to the existing node names. The handler shared state
   carries the trigger, run ID, lease guard, and checkpoint callback. Each node
   checks the lease before and after its side effect, and invokes the existing
   callback with a mapped `WorkerCheckpoint` at the same boundaries.
3. Keep `GraphWorkflow.run(...) -> WorkflowResult` unchanged. It calls a
   private async method and bridges it with `asyncio.run(...)`, extracts the
   final value from `WorkflowRunResult.get_outputs()`, and maps lease-loss or
   handler errors to the existing statuses. The supervisor is synchronous, so
   this bridge is valid for the current call path. If future callers may already
   run an event loop, use a dedicated worker thread for the bridge instead of
   calling `asyncio.run` in that thread.
4. Do not enable framework `checkpoint_storage` for the first adapter unless
   its records are deliberately integrated with the control-plane schema. The
   existing database checkpoint remains the source of truth for crash recovery,
   policy metadata, and lease ownership.

### Version Recommendation

The current lower bound is too broad for a public API adapter. Pin the worker
to the verified API, preferably `agent-framework>=1.13.0,<1.14.0` while the
adapter is implemented, or use an exact `==1.13.0` pin in a lockfile. Add an
import and minimal graph smoke test to the worker image build. A future package
release must be re-introspected before widening the constraint.

No conclusion of API absence is warranted. Version 1.13.0 has a compatible
typed graph workflow API, but a production implementation change is still
required because the current code only probes for symbols and deliberately
raises before starting the worker.

## References

* `apps/agent-worker/pyproject.toml`
* `apps/agent-worker/Dockerfile`
* `apps/agent-worker/src/workflow.py`
* `apps/agent-worker/src/supervisor.py`
* `apps/agent-worker/tests/test_workflow.py`
* Disposable image `zzyix-agent-worker-api-check`, built from
  `apps/agent-worker/Dockerfile`, resolved `agent-framework 1.13.0`
* [Microsoft Agent Framework workflows](https://learn.microsoft.com/en-us/agent-framework/workflows/overview)

## Follow-On Questions

* Should framework checkpoint serialization be integrated with the existing
  `WorkerCheckpoint`, or should the framework remain an in-process graph runner
  while the control plane owns all durable recovery?
* Should synchronous gateway and HTTP tool calls be moved to
  `asyncio.to_thread` when the adapter is implemented to avoid blocking the
  framework event loop?
