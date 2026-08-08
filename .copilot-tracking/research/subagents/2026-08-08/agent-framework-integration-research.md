---
title: Agent Framework Integration Research
description: Verified local research on the Agent Framework integration used by the resident agent worker
ms.date: 2026-08-08
ms.topic: reference
---

# Agent Framework Integration Research

## Scope and Status

* Research date: 2026-08-08
* Scope: The installed Microsoft Agent Framework package used by `apps/agent-worker`, with emphasis on `WorkflowBuilder.add_chain`, handler and context annotations, `Executor` construction, workflow output, dependency pinning, and compatibility risks
* Status: Complete for the requested local environment and code path
* Environment: Linux, Python 3.12 virtual environment at `apps/agent-worker/.venv`

## Repository Dependency Pinning

The worker declares the umbrella package as an exact dependency:

* `apps/agent-worker/pyproject.toml:12`: `agent-framework==1.13.0`
* `apps/agent-worker/src/zzyix_agent_worker.egg-info/PKG-INFO:7`: installed project metadata repeats `Requires-Dist: agent-framework==1.13.0`
* `apps/agent-worker/src/zzyix_agent_worker.egg-info/requires.txt:1`: `agent-framework==1.13.0`
* `apps/agent-worker/src/workflow.py:55`: the unavailable-runtime message directs installation of `agent-framework>=1.13.0,<1.14.0`, which is compatible with the exact project pin but is a broader operational range

No separate lockfile or requirements file was found under `apps/agent-worker`. The project metadata is therefore the repository's authoritative framework constraint.

## Installed Package Evidence

Command run from `apps/agent-worker`:

```bash
.venv/bin/pip show agent-framework agent-framework-core agent-framework-devui agent-framework-orchestrations
```

Verified output:

* `agent-framework` version `1.13.0`
* `agent-framework-core` version `1.13.0`
* `agent-framework-devui` version `1.0.0b260730`
* `agent-framework-orchestrations` version `1.0.2`
* The umbrella package is located in `.venv/lib/python3.12/site-packages`
* `agent-framework` requires `agent-framework-core[all]==1.13.0`
* `agent-framework-core` requires the core runtime dependencies and exposes the optional framework packages through its `all` extra

The worker does not directly declare `agent-framework-devui` or `agent-framework-orchestrations`; their presence comes from the installed `all` dependency set. They are not needed by `apps/agent-worker/src/workflow.py`, which imports the core workflow API from `agent_framework`.

Command run:

```bash
.venv/bin/pip check
```

Result: `No broken requirements found.`

A metadata probe using `importlib.metadata` reported no `direct_url.json` for the four Agent Framework distributions, so the local packages are normal installed distributions rather than editable or direct-URL installs. `agent_framework.__version__` and distribution metadata both report `1.13.0`.

## Current Integration Path

`apps/agent-worker/src/workflow.py` is the owning implementation.

* `workflow.py:110-117` constructs one framework executor per graph node: `load_context`, `load_events`, and `draft_proposal`.
* `workflow.py:120` creates `WorkflowBuilder(start_executor=executors[0])`.
* `workflow.py:122` calls `builder.add_chain(executors)` when more than one executor exists.
* `workflow.py:123` calls `build()`, and `workflow.py:123` then runs the built workflow with the state dictionary.
* `workflow.py:124` collects the final workflow output using `result.get_outputs()[-1]`.
* `workflow.py:125-131` maps the output dictionary to the worker's `WorkflowResult`.

The graph is intentionally linear. Each handler sends the same dictionary message to the next executor, while the final executor yields a workflow-level result dictionary.

## Verified `WorkflowBuilder.add_chain` Behavior

Installed signature from `agent_framework==1.13.0`:

```text
WorkflowBuilder.add_chain(
    self,
    executors: collections.abc.Sequence[
        agent_framework._workflows._executor.Executor |
        agent_framework._agents.SupportsAgentRun
    ],
) -> Self
```

Installed documentation states that `add_chain` adds a sequence and sends the output of each executor to the next. It requires compatible input/output types and disallows cycles. The installed example passes the start executor in the chain:

```python
workflow = (
    WorkflowBuilder(start_executor=step1)
    .add_chain([step1, step2, step3])
    .build()
)
```

That matches the worker's `WorkflowBuilder(start_executor=executors[0]).add_chain(executors)` call. A real-runtime smoke run with the three worker executors completed successfully, so this is not only a documentation match.

Alternative for non-linear workflows is `add_edge(source, target, condition=None)`. In 1.13.0 its signature is:

```text
WorkflowBuilder.add_edge(
    self,
    source: Executor | SupportsAgentRun,
    target: Executor | SupportsAgentRun,
    condition: Callable[[Any], bool | Awaitable[bool]] | None = None,
) -> Self
```

Use `add_edge` if the worker later needs branching or conditional routing. Keep `add_chain` for the current fixed sequence.

## Handler and Context Contract

The installed `handler` signature is:

```text
handler(
    func=None,
    *,
    input: type | types.UnionType | str | None = None,
    output: type | types.UnionType | str | None = None,
    workflow_output: type | types.UnionType | str | None = None,
)
```

The 1.13.0 implementation has two mutually exclusive modes:

1. With no explicit decorator type arguments, it introspects the message annotation and the generic `WorkflowContext` annotation.
2. If any explicit type argument is supplied, it disables annotation-derived type extraction and requires `input` explicitly. Missing `output` and `workflow_output` types become empty output sets.

The worker uses explicit mode at `apps/agent-worker/src/workflow.py:203`:

```python
decorated = runtime.handler(execute, input=dict, output=dict, workflow_output=dict)
```

This is important because `execute` is declared with `message: dict[str, Any]` but `context: Any` at `workflow.py:134`. The code then conditionally replaces the context annotation with `runtime.WorkflowContext` at `workflow.py:201`, but the explicit decorator arguments are what control the runtime's discovered types. The manual annotation replacement is therefore mostly signature/documentation compatibility in the current code path; it does not override the explicit `dict` contracts.

The installed docs describe the generic context contract as:

```python
WorkflowContext[OutT]
```

for `send_message`, and:

```python
WorkflowContext[OutT, W_OutT]
```

for both `send_message` and `yield_output`. The worker uses explicit `output=dict` and `workflow_output=dict`, which matches its behavior:

* `workflow.py:222` sends the incoming dictionary to the next executor with `context.send_message(message)`.
* `workflow.py:240` yields a dictionary with `context.yield_output(...)`.

The concrete executor introspection probe reported for all three worker executors:

```text
load_context input_types=[dict] output_types=[dict] workflow_output_types=[dict]
load_events  input_types=[dict] output_types=[dict] workflow_output_types=[dict]
draft_proposal input_types=[dict] output_types=[dict] workflow_output_types=[dict]
```

That confirms the installed runtime recognized the worker's intended message and workflow-output types.

## Executor Construction

Installed `Executor` signature:

```text
Executor(
    id: str,
    *,
    type: str | None = None,
    type_: str | None = None,
    defer_discovery: bool = False,
    **_: Any,
) -> None
```

The worker dynamically creates each executor subclass at `workflow.py:205-208` and defines an initializer that calls `runtime.Executor.__init__(instance, node_name)`. The resulting IDs are the node names, which are non-empty and unique within the graph.

The installed constructor discovers handlers immediately unless `defer_discovery=True`. It raises if no handler is found. The worker's decorated `handle` method is present before each instance is constructed, and the real-runtime smoke test proved construction and discovery succeed.

Compatibility concern: calling the base constructor positionally is valid in 1.13.0 because `id` is positional-or-keyword. A future version could make `id` keyword-only, although that would be a breaking API change. A more defensive adapter could use `runtime.Executor.__init__(instance, id=node_name)`, but that should be tested against the supported version before changing the code.

## Workflow Output Behavior

Installed `WorkflowBuilder.build()` returns an `agent_framework._workflows._workflow.Workflow`. Its `run` signature is:

```text
run(
    message: Any | None = None,
    *,
    stream: bool = False,
    responses: Mapping[str, Any] | None = None,
    checkpoint_id: str | None = None,
    checkpoint_storage: CheckpointStorage | None = None,
    include_status_events: bool = False,
    function_invocation_kwargs: Mapping[str, Mapping[str, Any]] | Mapping[str, Any] | None = None,
    client_kwargs: Mapping[str, Mapping[str, Any]] | Mapping[str, Any] | None = None,
) -> ResponseStream | Awaitable[WorkflowRunResult]
```

With the default `stream=False`, the run returns `WorkflowRunResult`. Its installed constructor is `WorkflowRunResult(events, status_events=None)`. Its documented `get_outputs()` method extracts all values yielded through `WorkflowContext.yield_output()`.

The worker assumes at least one output and takes the last one at `workflow.py:124`. This is valid for the current graph because every terminal path calls `_emit_framework_result`, and `_emit_framework_result` always calls `yield_output` at `workflow.py:240`. The lease-loss path also yields a result before returning. The assumption should remain covered by a test that asserts exactly one final output for both `completed` and `lease_lost` paths.

The actual runtime smoke command used local stubs and no network or model call:

```bash
.venv/bin/python - <<'PY'
from workflow import GraphWorkflow, WorkflowTrigger
from tests.test_workflow import _ToolsStub, _GatewayStub
w = GraphWorkflow(_ToolsStub(), _GatewayStub(), "v1", "1.13.0", True)
result = w.run(
    "run-real",
    WorkflowTrigger("t-real", "40000000-0000-4000-8000-000000000001", {}),
    lambda: True,
)
print(result)
PY
```

Observed result: `WorkflowResult(status='completed', proposal=..., checkpoint=WorkerCheckpoint(... workflow_state='completed' ...), gateway=GatewayResponse(...))`.

## Existing Tests and Their Coverage

`apps/agent-worker/tests/test_workflow.py` defines `_FakeFramework` at lines 10-31. Its fake builder supports `add_chain`, but it does not validate handler type metadata, executor handler discovery, graph type compatibility, or the real `WorkflowRunResult` event model.

The focused test command was:

```bash
.venv/bin/python -m pytest -q tests/test_workflow.py
```

Observed result: `...... [100%]`.

The real-runtime smoke run described above complements, rather than replaces, these tests. The existing tests are useful for lease behavior, feature gating, checkpoint replay, and dependency injection. They are insufficient as the only compatibility guard because the fake framework deliberately accepts a narrower and more permissive contract.

## Compatibility Risks

* Exact pin versus runtime message: project metadata pins `1.13.0`, while `workflow.py:55` advertises `>=1.13.0,<1.14.0`. Keep these aligned or make the runtime error quote the exact supported pin.
* Explicit handler mode: the call at `workflow.py:203` depends on the 1.13.0 rule that any explicit decorator argument switches off annotation introspection. Future versions could rename or alter these keyword arguments.
* Context annotation shape: the worker supplies `runtime.WorkflowContext` without generic parameters. This works because explicit decorator types define the output contracts. If explicit typing is removed, the handler should instead use `WorkflowContext[dict, dict]` and a concrete message annotation.
* Chain semantics: the worker passes the start executor in `add_chain`. This is correct for 1.13.0 and matches the installed example, but should be kept in a real-runtime regression test because duplicate-start handling is an API detail.
* Output cardinality: `get_outputs()[-1]` requires a yielded output. A future change that emits only status events or changes terminal output behavior would produce `IndexError`.
* Installed extras: `agent-framework-devui==1.0.0b260730` and `agent-framework-orchestrations==1.0.2` are present but not direct worker requirements. They should not be treated as a stable compatibility contract for this worker.
* Dynamic class construction: the adapter uses a generated class with a lambda initializer. It currently works, but a conventional local `Executor` subclass would be easier for static analysis and future framework migration.

## Recommended Framework-Path Test Strategy

Add a small test module that imports the actual installed framework, while retaining the fake-runtime unit tests for deterministic workflow logic.

Recommended cases:

1. Construct all three real executors through `_make_framework_executor` and assert their IDs and `input_types`, `output_types`, and `workflow_output_types` are all `[dict]`.
2. Build the real workflow with `WorkflowBuilder(start_executor=first).add_chain(executors).build()` and run it with local tool and gateway stubs. Assert `result.get_outputs()` contains one dictionary and that its status is `completed`.
3. Repeat with a lease guard that fails after the first node. Assert a single yielded dictionary with status `lease_lost` and no gateway call.
4. Run the feature-gated path with structured proposals disabled and assert the final output remains a dictionary and the gateway is not invoked.
5. Add a compatibility smoke test that records `importlib.metadata.version("agent-framework")`, asserts it is the supported `1.13.0`, and fails with an actionable message if the environment drifts.
6. Run the real-framework test in CI using the same dependency installation path as deployment. Do not rely on the repository's fake framework alone.

A minimal real-framework test should use the existing `_ToolsStub` and `_GatewayStub`, avoid credentials and network access, and be marked separately if the repository needs a fallback test command for environments without the package.

## Alternatives

* Keep the current explicit decorator form for the smallest change and strongest compatibility with the installed runtime.
* Refactor to ordinary executor subclasses with `@handler` and generic `WorkflowContext[dict, dict]` annotations if maintainability and static type visibility are more important than dynamic node generation.
* Replace `add_chain` with explicit `add_edge` calls only if conditional graph routing is introduced.
* Keep orchestration extras out of the worker's direct dependency list unless the implementation begins importing them; the current worker only needs the core workflow API supplied by `agent-framework`.

## Remaining Questions

* Should the deployment process guarantee that the virtualenv is rebuilt from `apps/agent-worker/pyproject.toml` rather than reusing an environment that may contain unrelated Agent Framework extras?
* Should the supported framework range remain `<1.14.0`, or should the project intentionally move to exact-version compatibility checks in the worker startup path?
* Does the CI environment currently install and execute a real-framework integration test, or only the fake-runtime tests in `tests/test_workflow.py`?
