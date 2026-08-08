---
title: Fantome Resident Agent Implementation Phase 3 Validation
description: Validation of the Python Worker MVP against the implementation plan, research, changes log, prior review, and Agent Framework API evidence
ms.date: 2026-08-08
ms.topic: validation
---
<!-- markdownlint-disable-file -->

## Executive Status

**Partial.** Phase 3 is substantially implemented, but it is not ready to be marked Passed. The production worker is a separate Python package with `agent-framework==1.13.0`, a fail-closed explicit `WorkflowBuilder` path, fake-first and feature-gated gateway behavior, managed-identity token acquisition, bounded redacted read tools, lease renewal and loss handling, and durable control-plane wiring. Two functional gaps remain in the reviewed worker path: intermediate checkpoints do not contain the tool state required by the resumed suffix, and the governed Foundry payload omits the approved tool context. The required worker pytest suite and a real `agent-framework==1.13.0` runtime smoke test were not executable in this environment.

No product source, plan, research, changes log, or prior validation file was modified. This validation file is the only requested artifact change.

## Scope And Method

This validation covers Implementation Phase 3, Steps 3.1 through 3.3 in [the implementation plan](../../../plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md). It compares the phase requirements with the [changes log](../../../changes/2026-08-07/fantome-resident-agent-implementation-changes.md), [primary research](../../../research/2026-08-07/fantome-resident-agent-implementation-research.md), [planning log](../../../plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md), [verified Agent Framework API research](../../../research/subagents/2026-08-07/microsoft-agent-framework-python-api.md), the [prior Phase 3 validation](../../../reviews/rpi/2026-08-07/fantome-resident-agent-implementation-plan-003-validation.md), the [implementation review](../../../reviews/2026-08-07/fantome-resident-agent-implementation-plan-review.md), all current `apps/agent-worker/src` modules and tests, `pyproject.toml`, `Dockerfile`, and `README.md`.

## Validation Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Worker syntax | Passed | `python3 -m compileall -q apps/agent-worker/src apps/agent-worker/tests` exited successfully on 2026-08-08. |
| Required worker tests | Not run | `python3 -m pytest apps/agent-worker/tests` failed before collection with `/usr/bin/python3: No module named pytest`. |
| Real Agent Framework import | Not run | Host Python reported `ModuleNotFoundError: No module named 'agent_framework'`. The prior API research verified the package and symbols in a disposable Python 3.11 image, but this session did not independently execute that image smoke test. |
| Docker validation | Historical pass; current rerun incomplete | The changes log records a successful `docker build -f apps/agent-worker/Dockerfile apps/agent-worker`. A fresh build plus container import smoke check was attempted on 2026-08-08 but interrupted with exit code 130 before completion, so current image-level framework evidence is unavailable. The Dockerfile installs the package at [Dockerfile](../../../../apps/agent-worker/Dockerfile#L1-L15). |
| Product source scope | Informational | `git status --short -- apps/agent-worker .copilot-tracking/reviews/rpi/2026-08-08` showed existing worker changes and validation artifacts in the worktree. This session did not modify those product files; only this requested validation document was created. |

## Phase Requirements Compared With Evidence

| Phase 3 requirement | Assessment | Verified evidence |
| --- | --- | --- |
| Scaffold a separate Python worker with package metadata, supervisor, workflow, gateway, tools, control plane, checkpoints, and tests | Met by inspection | [pyproject.toml](../../../../apps/agent-worker/pyproject.toml#L1-L37) declares the package and modules; [main.py](../../../../apps/agent-worker/src/main.py#L39-L103) builds the production supervisor; the listed source and test modules exist. |
| Pin the Microsoft Agent Framework dependency to the verified API | Met | [pyproject.toml](../../../../apps/agent-worker/pyproject.toml#L8-L13) pins `agent-framework==1.13.0`. This matches the verified public symbols and signatures in [Agent Framework API research](../../../research/subagents/2026-08-07/microsoft-agent-framework-python-api.md#L35-L113). |
| Production execution uses an explicit Agent Framework graph Workflow, not the local test graph | Met by source inspection; runtime unverified | [workflow.py](../../../../apps/agent-worker/src/workflow.py#L52-L76) loads the framework and rejects unavailable production execution; [workflow.py](../../../../apps/agent-worker/src/workflow.py#L215-L242) constructs `WorkflowBuilder`, chains executors, runs the built workflow, and maps its output; [workflow.py](../../../../apps/agent-worker/src/workflow.py#L321-L327) uses the framework `handler` and `Executor`. The local graph is reachable only when `allow_test_runtime=True` at [workflow.py](../../../../apps/agent-worker/src/workflow.py#L78-L87). |
| Fake-first governed gateway behavior | Met for default and fallback boundaries | [main.py](../../../../apps/agent-worker/src/main.py#L58-L92) defaults to fake mode, disables Foundry unless explicitly enabled, requires a Foundry token scope when enabled, and uses managed identity for Foundry. [gateway.py](../../../../apps/agent-worker/src/gateway.py#L65-L112) applies concurrency and fake/foundry routing; [gateway.py](../../../../apps/agent-worker/src/gateway.py#L125-L145) retries and falls back on provider failure or timeout; [gateway.py](../../../../apps/agent-worker/src/gateway.py#L177-L213) accepts only bounded observation actions. Focused tests exist in [test_gateway.py](../../../../apps/agent-worker/tests/test_gateway.py#L12-L63), but were not executed. |
| Model-free and structured-proposal feature gates | Met by inspection and focused test design | [main.py](../../../../apps/agent-worker/src/main.py#L58-L64) and [main.py](../../../../apps/agent-worker/src/main.py#L94-L100) keep Foundry and structured proposals disabled by default. [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L39-L54) checks the model-free gate before claiming work. [test_supervisor.py](../../../../apps/agent-worker/tests/test_supervisor.py#L156-L199) covers no-claim behavior and later enablement. |
| Typed, bounded, read-only HTTP tools with redaction | Met by inspection and focused test design | [tools.py](../../../../apps/agent-worker/src/tools.py#L20-L75) uses typed UUID inputs and bounded event limits; [tools.py](../../../../apps/agent-worker/src/tools.py#L77-L99) constructs only fixed internal server paths; [tools.py](../../../../apps/agent-worker/src/tools.py#L127-L175) removes event payloads and restricts returned fields. [test_tools.py](../../../../apps/agent-worker/tests/test_tools.py#L47-L87) covers redaction and invalid limits. No worker mutation method is present in the reviewed worker surface. |
| Explicit identity handling for server and Foundry calls | Met by inspection and focused test design | [identity.py](../../../../apps/agent-worker/src/identity.py#L12-L50) acquires and refreshes tokens with expiry skew. [main.py](../../../../apps/agent-worker/src/main.py#L47-L55) requires the server token scope and passes the provider to read tools; [main.py](../../../../apps/agent-worker/src/main.py#L86-L92) uses a managed-identity provider for Foundry. [test_identity.py](../../../../apps/agent-worker/tests/test_identity.py#L12-L23) covers refresh. |
| One active workflow per quilt and lease-loss interruption | Met by inspection and focused test design | [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L56-L79) claims triggers, starts or resumes runs, and acquires a lease before workflow execution. [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L143-L206) renews in a background thread and checks ownership before and after workflow side effects. [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L97-L124) stops before the gateway after injected lease loss; [test_supervisor.py](../../../../apps/agent-worker/tests/test_supervisor.py#L301-L320) covers lease loss before work. In-flight blocking-call interruption is not proven. |
| Checkpoint persistence and resume integration | Partial | [workflow.py](../../../../apps/agent-worker/src/workflow.py#L301-L319) invokes callbacks at graph boundaries; [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L81-L100) persists with compare-and-set; [control_plane.py](../../../../apps/agent-worker/src/control_plane.py#L399-L457) loads and stores versioned records; and [test_supervisor.py](../../../../apps/agent-worker/tests/test_supervisor.py#L231-L259) covers same-run in-memory resume. However, [WorkerCheckpoint](../../../../apps/agent-worker/src/checkpoints.py#L8-L18) stores no tool outputs or proposal state, while [workflow.py](../../../../apps/agent-worker/src/workflow.py#L194-L203) initializes those values empty before resuming at the saved node. |
| Testability and validation | Partial | The worker has focused tests and a test-only local graph injection path, but the required pytest command was unavailable and the real framework package was absent from host Python. The injected fake in [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L7-L60) does not model real framework routing or handler semantics. |

## Findings

### Major Findings

#### P3-01: Intermediate checkpoint restore loses required workflow state

[workflow.py](../../../../apps/agent-worker/src/workflow.py#L194-L203) creates a new state with empty `tool_outputs`, default proposal data, and no gateway response on every framework run. It then selects the suffix from `checkpoint.workflow_state` at [workflow.py](../../../../apps/agent-worker/src/workflow.py#L215-L230). [checkpoints.py](../../../../apps/agent-worker/src/checkpoints.py#L8-L18) persists only node metadata, revision, trigger IDs, policy, framework version, and timestamp. Consequently, a checkpoint after `load_context` resumes at `load_events` without the context result, and a checkpoint after `load_events` resumes at `draft_proposal` without either read result. The supervisor test proves that a checkpoint object is passed to the workflow, but not that resumed execution has the state represented by that checkpoint. This does not meet the research requirement to recover from the latest committed workflow state.

**Severity: Major.** This can cause an incomplete or semantically empty proposal after worker loss, even though the run and checkpoint records are durable.

#### P3-02: Governed Foundry requests omit canonical read results

[workflow.py](../../../../apps/agent-worker/src/workflow.py#L286-L296) passes the redacted tool outputs into `GatewayRequest.tool_context`. [gateway.py](../../../../apps/agent-worker/src/gateway.py#L114-L123) builds the provider payload with only a fixed system message and the prompt. `request.tool_context` is measured for limits but is never serialized into the provider request. Therefore, when the Foundry path is enabled, the provider cannot base its structured result on the canonical reads collected by the workflow. This deviates from the researched call flow and from the Step 3.2 requirement that validated tool results become model context.

**Severity: Major.** The path is safely disabled by default, but enabling the governed path would produce proposals without the intended read context.

#### P3-03: The real pinned Agent Framework production path has no execution evidence

[pyproject.toml](../../../../apps/agent-worker/pyproject.toml#L8-L13) correctly pins `agent-framework==1.13.0`, and [workflow.py](../../../../apps/agent-worker/src/workflow.py#L232-L242) invokes the framework API. However, [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L7-L60) defines a minimal fake framework, and [test_workflow.py](../../../../apps/agent-worker/tests/test_workflow.py#L158-L179) injects that fake rather than importing the pinned package. The host lacks both `agent_framework` and `pytest`; `python3 -m pytest apps/agent-worker/tests` failed before collection. The prior API research verified the 1.13.0 symbols and a disposable image execution, but that is research evidence, not current implementation execution evidence.

**Severity: Major.** The adapter may be correct by inspection, but the real decorators, async bridge, context message routing, and `WorkflowRunResult` mapping remain unverified.

### Minor Findings

#### P3-04: Lease-loss coverage does not exercise an in-flight blocking operation

[supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L155-L190) can detect renewal failure asynchronously, and [workflow.py](../../../../apps/agent-worker/src/workflow.py#L255-L319) checks before and after each `asyncio.to_thread` operation. The current tests stop at node boundaries and assert that the next side effect is skipped. They do not force lease loss while HTTP or provider work is blocked, so the duration and shutdown behavior of an in-flight call are not established. This is a residual validation gap, not evidence that the boundary guard is wrong.

**Severity: Minor.** The implementation has bounded tool and gateway timeouts, but the timing contract should be demonstrated before activation.

## Verified Passes

* The worker package and source/test layout required by Phase 3 are present, and syntax compilation passed.
* The dependency is pinned to the exact Agent Framework version covered by the API research.
* Production construction rejects a missing durable DSN at [main.py](../../../../apps/agent-worker/src/main.py#L39-L50), so the earlier in-memory production fallback finding is resolved.
* Production construction sets `allow_test_runtime=False` at [main.py](../../../../apps/agent-worker/src/main.py#L94-L100), and the framework loader rejects missing required symbols at [workflow.py](../../../../apps/agent-worker/src/workflow.py#L383-L396), so the earlier local-loop production finding is resolved by inspection.
* Fake gateway, Foundry gating, structured-proposal gating, bounded retry/timeout/concurrency/rate controls, and observation-only output validation are present.
* Server and Foundry calls use managed-identity token providers; static bearer/API-key configuration is absent from the reviewed worker path.
* Read tools accept typed bounded inputs, build fixed internal routes, and redact response payloads before model use.
* Supervisor gating occurs before trigger claim, lease ownership is checked around workflow operations, and lease loss requeues the trigger.
* Versioned checkpoint compare-and-set persistence and same-run in-memory recovery plumbing are present.

## Changes Log And Prior Review Reconciliation

The changes log accurately records the worker modules, identity provider, framework adapter, intermediate checkpoint callbacks, stale-trigger reclaim, background renewal, and the missing host pytest environment. It also records the exact dependency constraint and the production removal of the in-memory control-plane fallback.

The prior Phase 3 validation identified three Major findings: incomplete checkpoint state restoration, omitted Foundry tool context, and lack of real framework execution evidence. Current source inspection confirms all three remain. The earlier findings that production used only a local dictionary loop and that production could silently use in-memory state are stale after the recorded rework: current [workflow.py](../../../../apps/agent-worker/src/workflow.py#L52-L87) fails closed around framework availability, current [workflow.py](../../../../apps/agent-worker/src/workflow.py#L232-L242) runs `WorkflowBuilder`, and current [main.py](../../../../apps/agent-worker/src/main.py#L42-L50) requires a durable DSN.

The prior implementation review's Phase 3 status of Partial remains accurate. Its broader Phase 2 PostgreSQL recovery concerns are relevant dependencies, but they are not re-counted as Phase 3 worker findings here. The Phase 5 validation also confirms that the worker PostgreSQL test and real process restart remain unexecuted or missing, which limits Phase 3 recovery evidence even though the worker-specific integration test exists.

## Coverage Assessment

| Area | Coverage | Status |
| --- | --- | --- |
| Python worker scaffold and package configuration | Source inspection plus syntax compilation | Covered |
| Pinned framework adapter | Source inspection against API research | Implemented, runtime unverified |
| Fake/gated gateway and safe output | Source inspection plus focused tests present | Implemented, tests unrun |
| Typed bounded redacted tools | Source inspection plus focused tests present | Implemented, tests unrun |
| Managed identity | Source inspection plus focused refresh test present | Implemented, test unrun |
| Lease ownership and lease-loss ordering | Source inspection plus in-memory tests present | Implemented, in-flight/process behavior unverified |
| Durable checkpoint persistence | Control-plane and callback plumbing present | Partial because state payload is incomplete |
| Resume after process loss | Same-run in-memory and skip-gated PostgreSQL test present | Not independently executed; real worker process restart absent |
| Phase 3 validation command | `compileall` passed | Partial because pytest is unavailable |

Overall Phase 3 coverage is **partial and below activation readiness**. The worker has the intended security and operational boundaries by inspection, but the checkpoint state defect, omitted governed-model context, unverified real adapter execution, and unavailable prescribed pytest run prevent a Passed status.

## Remaining Gaps And Recommended Next Validations

* Persist serializable tool outputs and any proposal/gateway state needed by each checkpoint, or define and test a deliberate replay policy for each resumable suffix.
* Include the bounded redacted `tool_context` in the governed provider payload and add a test that asserts it is present while sensitive fields remain absent.
* Install the declared development extra and run `python -m pytest apps/agent-worker/tests`.
* Complete the container-level `agent-framework==1.13.0` smoke test that was interrupted in this validation, then execute all nodes, verify handler routing and output extraction, and exercise the synchronous bridge.
* Set `AGENT_WORKER_POSTGRES_TEST_DSN` to a migrated database and execute [test_control_plane_postgres.py](../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L1-L145).
* Add a two-process worker restart fixture that persists a checkpoint, terminates the first worker, and verifies same-run PostgreSQL-backed resume.
* Add timing-controlled lease-loss tests for blocked HTTP and provider calls.

## Clarifying Questions

* Should recovery persist the redacted tool outputs and proposal state, or should a restart deliberately replay all canonical read nodes before continuing? The current checkpoint schema does not express that policy.
* Should the Foundry provider receive the complete redacted tool context as structured JSON, or a smaller prompt-specific schema? The chosen contract should be covered by a provider-payload test.

## Final Status

**Partial.** Steps 3.1 and the core implementation boundaries of Step 3.2 are present. Step 3.3 is incomplete because the required pytest suite and real pinned framework execution were not independently run, and the current checkpoint and Foundry context defects remain. Production activation should wait for the three Major findings and the unrun worker validation evidence to be resolved.
