---
title: Fantome Resident Agent Phase 3 Validation
description: Current-workspace validation of the Python worker MVP against the implementation plan, changes log, research, and verified Agent Framework API research
ms.date: 2026-08-07
ms.topic: assessment
---
<!-- markdownlint-disable-file -->

## Status

**Partial.** The current implementation now uses the verified Microsoft Agent Framework 1.13.0 graph API in the production path, with fake-first defaults, bounded and redacted read tools, lease renewal and loss handling, intermediate checkpoint callbacks, restore plumbing, managed-identity token acquisition, and focused tests. Phase 3 remains incomplete because restored execution loses intermediate tool state, the Foundry request omits approved tool context, and the real Python test suite and real framework runtime path were not independently executed.

## Scope And Method

This read-only validation covers Phase 3, Steps 3.1 through 3.3. It compared the [Phase 3 plan](../../../plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md#L123-L135), [changes log](../../../changes/2026-08-07/fantome-resident-agent-implementation-changes.md), [primary research](../../../research/2026-08-07/fantome-resident-agent-implementation-research.md), [planning log](../../../plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md), [verified Agent Framework API research](../../../research/subagents/2026-08-07/microsoft-agent-framework-python-api.md), all current `apps/agent-worker/src` modules, and all current worker tests. No implementation source or test file was modified.

## Requirement Coverage

| Plan requirement | Status | Current evidence and assessment |
| --- | --- | --- |
| Separate Python worker with Agent Framework package, supervisor, workflow, gateway, tools, control plane, checkpoints, and tests | Met | [pyproject.toml](../../../../apps/agent-worker/pyproject.toml#L1-L37) pins `agent-framework==1.13.0` and declares the worker modules and pytest extra. [main.py](../../../../apps/agent-worker/src/main.py#L35-L103) constructs the durable production supervisor. |
| Production execution uses Microsoft Agent Framework explicit graph Workflow | Met by inspection, runtime execution unverified | [workflow.py](../../../../apps/agent-worker/src/workflow.py#L64-L82) rejects the local graph unless test runtime is explicitly enabled; [workflow.py](../../../../apps/agent-worker/src/workflow.py#L208-L242) builds and runs `WorkflowBuilder`; [workflow.py](../../../../apps/agent-worker/src/workflow.py#L321-L327) registers typed handlers. This matches the verified 1.13.0 symbols and async `Workflow.run` contract, but the host could not run pytest and no independent real-package smoke test completed. |
| Fake-first governed gateway and read-only structured output | Partially met | [main.py](../../../../apps/agent-worker/src/main.py#L53-L99) defaults to fake mode and disables Foundry and structured proposals. [gateway.py](../../../../apps/agent-worker/src/gateway.py#L65-L111) enforces prompt/tool-size, rate, concurrency, retry, and timeout controls; [gateway.py](../../../../apps/agent-worker/src/gateway.py#L150-L213) validates output and falls back to `observe` only. The provider payload omits the approved `tool_context`, which prevents Foundry output from using canonical read results. |
| Typed, bounded, redacted server HTTP reads | Met | [tools.py](../../../../apps/agent-worker/src/tools.py#L20-L93) accepts typed UUID and bounded event inputs, [tools.py](../../../../apps/agent-worker/src/tools.py#L95-L121) constructs only fixed internal routes, and [tools.py](../../../../apps/agent-worker/src/tools.py#L127-L175) removes event payloads and other unapproved fields before model use. |
| One active workflow per quilt and lease-loss stop behavior | Met by inspection and focused tests | [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L56-L121) claims, renews, cancels, requeues, and releases leases; [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L137-L190) runs background renewal and guards workflow boundaries. [test_supervisor.py](../../../../apps/agent-worker/tests/test_supervisor.py#L53-L121) covers lease-unavailable recovery and loss before work; [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L89-L124) covers the injected framework-shaped path. In-flight call interruption is not tested. |
| Intermediate checkpoint persistence and restore | Partially met | [workflow.py](../../../../apps/agent-worker/src/workflow.py#L301-L351) invokes checkpoint callbacks after each node and on lease loss; [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L81-L100) performs compare-and-set persistence; [control_plane.py](../../../../apps/agent-worker/src/control_plane.py#L314-L406) stores and restores versioned records. However, [workflow.py](../../../../apps/agent-worker/src/workflow.py#L196-L236) restores only the node name and initializes empty `tool_outputs`, so resuming at `draft_proposal` or `load_events` cannot reproduce the state represented by the prior completed nodes. |
| Managed identity integration | Met by inspection and focused test | [identity.py](../../../../apps/agent-worker/src/identity.py#L12-L50) acquires and refreshes tokens with expiry skew; [main.py](../../../../apps/agent-worker/src/main.py#L43-L52) requires the durable DSN and server token scope. [test_identity.py](../../../../apps/agent-worker/tests/test_identity.py#L16-L23) covers refresh behavior. |
| Worker validation command and test correctness | Not independently verified | [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L1-L35) supplies a fake framework rather than the real 1.13.0 runtime, and its fake runner advances by list position regardless of `send_message`. `python3 -m compileall` passed, but `python3 -m pytest apps/agent-worker/tests` was blocked by `No module named pytest`. The changes log records the same environment limitation at [changes log](../../../changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L54-L62). |

## Findings

### Critical Findings

No Critical findings were identified in the current Phase 3 source. Production construction is fail-closed around a durable control plane and the Agent Framework path, and no worker mutation route or canonical database write path is present in the reviewed worker surface.

### Major Findings

1. **Checkpoint restore does not restore the intermediate workflow state it depends on.**

  [GraphWorkflow._run_framework_graph](../../../../apps/agent-worker/src/workflow.py#L196-L236) creates a fresh `state` containing empty `tool_outputs`, selects the suffix from `checkpoint.workflow_state`, and starts that suffix. [WorkerCheckpoint](../../../../apps/agent-worker/src/checkpoints.py#L8-L18) persists only node metadata, revision, trigger IDs, policy, framework version, and timestamp. Therefore a checkpoint after `load_context` resumes at `load_events` without the context result, and a checkpoint after `load_events` resumes at `draft_proposal` with neither read result. This is a functional deviation from the research requirement to restore the latest committed checkpoint state and from the plan's recovery success criterion. The existing [supervisor recovery test](../../../../apps/agent-worker/tests/test_supervisor.py#L152-L191) proves that a checkpoint is passed to the workflow, but does not prove that the resumed workflow has the required state or avoids recomputation.

2. **The governed Foundry path does not provide the validated canonical read results to the provider.**

  [workflow.py](../../../../apps/agent-worker/src/workflow.py#L286-L296) passes `state["tool_outputs"]` into `GatewayRequest`, and [gateway.py](../../../../apps/agent-worker/src/gateway.py#L39-L44) models that context and [gateway.py](../../../../apps/agent-worker/src/gateway.py#L150-L178) bounds it. But [gateway.py](../../../../apps/agent-worker/src/gateway.py#L113-L128) builds the provider payload with only a fixed system message and `request.prompt`. The approved redacted context never reaches Foundry, so a successful provider proposal cannot be based on the canonical reads that the workflow collected. This is a functional deviation from the research call flow and the Step 3.2 requirement to use validated tool results as model context.

3. **The current tests do not establish that the real Agent Framework 1.13.0 production path works.**

  [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L1-L35) defines a minimal `_FakeFramework`; [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L89-L124) injects it and verifies only that the adapter-shaped call completes. The fake runner iterates its executor list directly and does not model framework routing or the real `handler`/`WorkflowContext` behavior. The declared test suite could not run in this environment because `python3 -m pytest apps/agent-worker/tests` failed with `No module named pytest`; only `python3 -m compileall -q apps/agent-worker/src apps/agent-worker/tests` was independently completed. This leaves the production adapter, real decorators, async bridge, and test collection without execution evidence.

### Minor Findings

1. **Lease-loss tests stop at node boundaries rather than exercising an in-flight operation.**

  [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L141-L177) can mark the lease lost from the renewal thread, and [workflow.py](../../../../apps/agent-worker/src/workflow.py#L255-L319) checks before and after each `to_thread` operation. The implementation prevents the next node from starting, which satisfies the reviewed boundary behavior, but a blocking HTTP or provider call can continue until its configured timeout after renewal failure. No current test forces that timing. This is a residual validation gap rather than a confirmed violation of the no-next-operation guarantee.

## Changes Log Comparison

The changes log accurately lists the current worker modules, tests, identity provider, checkpoint callbacks, stale-trigger reclaim, background renewal, and framework adapter at [the added and modified file lists](../../../changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L20-L80). Current source verifies those claims. The previous report's findings that the worker still used only a dictionary loop and completion-only persistence are stale: the production path now calls `WorkflowBuilder`, and callbacks are committed after graph nodes.

The changes log also accurately records that the required pytest command was unavailable at [the validation deviation](../../../changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L54-L62). The planning log carries the same unresolved item as [DD-05 and DD-07](../../../plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L35-L44), so the missing test execution is a validation blocker, not evidence that the source is syntactically invalid.

## Coverage Assessment

Phase 3 Steps 3.1 and the core runtime boundaries of Step 3.2 are implemented by inspection. Fake-first defaults, bounded/redacted tools, read-only output validation, lease ownership, lease-loss requeue, checkpoint callbacks, durable compare-and-set storage, and managed-identity refresh are present. Step 3.3 is **Partial** because syntax compilation passed but the required pytest suite and real Agent Framework execution were not independently verified. Overall Phase 3 coverage is **Partial**, with three Major findings and one Minor validation gap.

## Recommended Next Validations

* Add persisted serializable tool/workflow state, or deliberately restart the suffix from a state-complete boundary, then test recovery after each intermediate checkpoint.
* Add a provider-request test that asserts approved redacted tool context is included and sensitive fields remain absent.
* Install the declared Python development extra and run `python -m pytest apps/agent-worker/tests`.
* Run a real `agent-framework==1.13.0` smoke test that constructs the production adapter, executes all three nodes, exercises lease loss, and verifies the synchronous bridge.
* Add timing-controlled tests for renewal loss during HTTP and provider calls.
* Complete the planned Docker build validation independently from the worker test run.

## Clarifying Questions

* Should recovery persist serialized tool outputs and proposal state, or should every restart intentionally replay canonical read nodes before continuing? The current checkpoint schema does not make that policy explicit.
* Is the intended Foundry contract to pass the full redacted `tool_context` as structured JSON, or to transform selected fields into a prompt-specific schema? Either choice needs a testable contract before Foundry activation.