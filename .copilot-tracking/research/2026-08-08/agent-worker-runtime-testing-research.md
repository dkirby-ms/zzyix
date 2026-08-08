<!-- markdownlint-disable-file -->
# Task Research: Agent Worker Runtime Testing

Research the Agent Worker runtime architecture and local testing strategy after removing the separate internal workflow test graph. Determine how the real Microsoft Agent Framework library is exercised, how local integration tests should authenticate and seed work, and whether remaining test-only static token configuration is clearly separated from workflow runtime selection.

## Task Implementation Requests

* Verify that workflow tests execute the installed Agent Framework library rather than an internal workflow stub.
* Document local worker test prerequisites, execution paths, and evidence of successful processing.
* Evaluate whether the test-only static server token mode should remain and how it should be named and constrained.
* Identify remaining risks, gaps, and recommended follow-up implementation work.

## Research Executed

### File Analysis

* `apps/agent-worker/pyproject.toml:10-26`
  * Requires Python `>=3.11`, pins `agent-framework==1.13.0`, and configures pytest to discover `tests` with `src` on the import path.
* `apps/agent-worker/src/workflow.py:34-58`
  * Loads the installed Agent Framework API, or an explicitly injected runtime, and fails startup when the required workflow symbols are unavailable.
* `apps/agent-worker/src/workflow.py:74-131`
  * Builds the fixed `load_context -> load_events -> draft_proposal` graph with `WorkflowBuilder`, `Executor`, `WorkflowContext`, and `handler`.
* `apps/agent-worker/src/workflow.py:132-240`
  * Runs tool and gateway calls through `asyncio.to_thread`, checks the lease before and after work, commits graph checkpoints, and yields a final workflow result.
* `apps/agent-worker/src/main.py:34-67`
  * Requires a durable PostgreSQL DSN and server token scope. Production uses managed identity; static server-token authentication is limited to `NODE_ENV=test` through `AGENT_USE_STATIC_SERVER_TOKEN`.
* `apps/agent-worker/src/supervisor.py:51-207`
  * Owns trigger claims, run lifecycle, lease renewal, checkpoint persistence, stale-work recovery, and result handling.
* `apps/agent-worker/tests/test_workflow.py:10-274`
  * Uses tool and gateway stubs plus a fake framework fixture for deterministic edge-case tests. These fixtures do not replace the production workflow path in the current implementation.
* `apps/agent-worker/tests/test_control_plane_postgres.py:33-348`
  * Provides opt-in PostgreSQL tests and a subprocess restart test that validates checkpoint recovery against a real worker process.
* `.github/workflows/ci.yml:118-180`
  * The current CI matrix covers client and server jobs but does not install or run the Python worker test suite.
* `apps/agent-worker/Dockerfile:1-17`
  * Installs the worker package into a Python 3.11 image and starts `python -m main`.

### Code Search Results

* `allow_test_runtime|_run_test_graph`
  * No remaining workflow-runtime test branch exists under `apps/agent-worker` after the runtime-unification changes.
* `AGENT_WORKER_TEST_RUNTIME`
  * No remaining references exist under `apps/agent-worker`; the auth-specific `AGENT_USE_STATIC_SERVER_TOKEN` name is used instead.

### External Research

* Installed package introspection
  * `agent-framework`, `agent-framework-core`, and the local package metadata report version `1.13.0`.
  * `pip check` reports no broken requirements.
  * `WorkflowBuilder.add_chain` requires a sequence of executors and the installed example includes the start executor in that sequence.
  * `handler` accepts explicit `input`, `output`, and `workflow_output` types, matching the worker's `dict` message and output contracts.

### Project Conventions

* Standards referenced: Python 3.11+, pytest, pinned Agent Framework dependency, durable PostgreSQL control plane, managed identity in production.
* Instructions followed: repository Python implementation and test conventions; research artifact conventions.

## Key Discoveries

### Project Structure

The worker has three distinct test layers:

* Unit and component tests use in-memory control-plane state, local HTTP servers, and tool/gateway stubs.
* Workflow integration tests execute the installed Agent Framework path with deterministic tool and gateway dependencies.
* PostgreSQL process tests exercise the actual worker entrypoint, database leases/checkpoints, and restart recovery. They require a migrated database and `AGENT_WORKER_POSTGRES_TEST_DSN`.

The local fast suite is verified with:

```bash
cd apps/agent-worker
.venv/bin/python -m pytest tests
```

Observed result: `35 passed, 5 skipped`. The five skips are the PostgreSQL tests when their DSN is not configured.

### Implementation Patterns

The selected workflow path is entirely Agent Framework based. `GraphWorkflow.run` invokes `_run_framework_graph`, which creates dynamic `Executor` classes, registers handlers with explicit `dict` input/output types, builds a linear chain, and consumes the final `yield_output` value.

The runtime boundary is now the installed library, not an internal alternate workflow implementation. Determinism comes from replacing external boundaries:

* `_ToolsStub` avoids server network calls.
* `_GatewayStub` avoids model or Foundry calls.
* `InMemoryControlPlane` isolates supervisor state-machine behavior.
* The blocking HTTP server and PostgreSQL fixtures exercise process and persistence behavior where required.

The remaining fake framework fixture models a narrow API surface and is useful for deterministic compatibility-independent tests, but it must not be the only framework contract check.

### Complete Examples

The real framework path can be exercised without credentials or network calls:

```python
workflow = GraphWorkflow(
    tools=_ToolsStub(),
    gateway=_GatewayStub(),
    policy_version="v1",
    framework_version="1.13.0",
    structured_proposals_enabled=True,
)
result = workflow.run(
    run_id="run-real",
    trigger=WorkflowTrigger(
        trigger_id="t-real",
        quilt_id="40000000-0000-4000-8000-000000000001",
        payload={},
    ),
    lease_guard=lambda: True,
)
assert result.status == "completed"
```

### API and Schema Documentation

The installed Agent Framework 1.13.0 contracts relevant to this worker are:

```text
WorkflowBuilder.add_chain(executors: Sequence[Executor | SupportsAgentRun]) -> Self
handler(func=None, *, input=None, output=None, workflow_output=None)
WorkflowContext[OutT]
WorkflowContext[OutT, WorkflowOutT]
```

The worker uses `add_chain(executors)` with the start executor included, and explicit `input=dict`, `output=dict`, and `workflow_output=dict` handler metadata. A real smoke run completed and produced a `WorkflowResult` with a completed checkpoint and gateway response.

### Configuration Examples

Fast local tests:

```bash
cd apps/agent-worker
source .venv/bin/activate
python -m pytest tests -q
```

Manual worker with test-only static server authentication:

```bash
export NODE_ENV=test
export AGENT_USE_STATIC_SERVER_TOKEN=true
export AGENT_TEST_STATIC_SERVER_TOKEN='test-worker-token'
export AGENT_PRINCIPAL_ID='11111111-1111-4111-8111-111111111111'
export AGENT_CONTROL_PLANE_DSN='postgresql://agent_control_worker:...'
export AGENT_SERVER_TOKEN_SCOPE='api://zzyix-test/.default'
export AGENT_SERVER_BASE_URL='http://127.0.0.1:3001'
python -m main
```

Production-like authentication leaves the static-token flag unset and uses `DefaultAzureCredential` through `ManagedIdentityTokenProvider`.

## Technical Scenarios

### Local workflow integration testing

The goal is to detect Agent Framework API drift while keeping tests independent of credentials, model providers, and live server state.

**Requirements:**

* Use the pinned `agent-framework==1.13.0` installed from the worker package metadata.
* Build and run the real `WorkflowBuilder` graph.
* Use deterministic tools and gateway fixtures at the external boundaries.
* Assert terminal output, checkpoint behavior, lease-loss behavior, and feature-gate behavior.

**Preferred Approach:**

* Keep one production workflow implementation backed by Agent Framework.
* Retain current tool, gateway, in-memory control-plane, and HTTP fixtures for fast tests.
* Add a small real-framework regression suite that verifies executor discovery, handler metadata, graph construction, final output cardinality, and lease-loss output.
* Run that suite in CI using the same dependency installation path as deployment.

This approach tests the actual in-process framework without requiring Azure credentials or a live model service.

**Implementation Details:**

```text
apps/agent-worker/
  src/workflow.py                 # Single Agent Framework workflow path
  tests/test_workflow.py          # Logic and edge cases with boundary stubs
  tests/test_framework_runtime.py # Recommended real-framework contract tests
  tests/test_control_plane_postgres.py # Durable process/restart behavior
```

Recommended real-framework assertions:

* Three generated executors have `dict` input, output, and workflow-output types.
* The built graph produces one final dictionary through `get_outputs()`.
* A lease failure yields one `lease_lost` result and prevents gateway invocation.
* Structured-proposal gating yields a result without calling the gateway.
* The installed framework version matches the supported `1.13.0` dependency.

#### Considered Alternatives

* Keep a separate internal workflow implementation for tests.
  * Rejected because it duplicates production orchestration and can pass while Agent Framework integration is broken.
* Replace all stubs with live server, database, identity, and model dependencies.
  * Rejected for unit and workflow tests because it is slow, credential-dependent, and obscures which boundary failed. Keep live dependencies for dedicated process and PostgreSQL integration tests.
* Use only the current fake framework fixture.
  * Rejected because it does not validate real handler metadata, executor discovery, graph connectivity, or workflow output events.
* Use explicit `add_edge` calls for the current graph.
  * Rejected because the current workflow is a fixed linear sequence. Use `add_edge` if conditional routing is introduced later.

### Worker process and persistence testing

The goal is to verify that the supervisor, PostgreSQL control plane, HTTP tool boundary, and worker restart behavior work together.

**Requirements:**

* Apply the zzyix migrations and provision the restricted worker database role.
* Set `AGENT_WORKER_POSTGRES_TEST_DSN` to the migrated database.
* Seed an active principal assignment and pending trigger.
* Start the actual `src/main.py` subprocess with static server token mode in `NODE_ENV=test`.
* Validate checkpoint persistence, stale claim recovery, original run identity, and completion.

**Preferred Approach:**

* Keep PostgreSQL tests opt-in locally but make them a dedicated CI job with a migrated database and explicit credentials.
* Preserve the existing restart test as the primary end-to-end worker check.
* Add a CI worker job for the fast suite and a separate integration job for PostgreSQL tests.

**Implementation Details:**

The current process test starts a worker, waits for an intermediate `load_events` checkpoint while the HTTP server blocks event retrieval, terminates the process, expires its claim and lease, starts a second worker, and verifies that the original run resumes with a newer checkpoint. This tests more than framework execution: it validates recovery semantics across process loss.

The current CI matrix does not run these Python tests. The PostgreSQL service used by JavaScript jobs does not automatically satisfy the worker fixture because the worker also needs migrations, tables, roles, and assignments.

#### Considered Alternatives

* Treat the five local PostgreSQL skips as sufficient coverage.
  * Rejected because skipped tests provide no evidence of persistence or restart behavior.
* Run all worker tests against a shared developer database by default.
  * Rejected because it risks data contamination and makes local tests non-reproducible. Use explicit DSN opt-in and seeded cleanup.

## Selected Approach

Use a single Agent Framework workflow implementation and test it at three deliberate levels:

1. Fast unit/component tests with deterministic boundary fixtures.
2. Real Agent Framework integration tests with local tool and gateway stubs.
3. PostgreSQL worker-process tests with seeded database state and test-only static server authentication.

This preserves fast feedback without creating a second workflow engine. It directly addresses the original runtime confusion: Agent Framework is an in-process library, so the framework path should be the path under test; only its external dependencies should be substituted where the test scope permits.

## Implementation Impact

* Add `tests/test_framework_runtime.py` or equivalent focused cases for real Agent Framework executor and graph contracts.
* Add a Python worker CI job that installs `apps/agent-worker` and runs the fast suite.
* Add a PostgreSQL integration CI job that applies migrations, provisions the worker role, sets `AGENT_WORKER_POSTGRES_TEST_DSN`, and runs the process tests.
* Keep the `AGENT_USE_STATIC_SERVER_TOKEN` guard limited to `NODE_ENV=test`; never use it in deployment jobs.
* Align the unavailable-runtime message with the exact supported `agent-framework==1.13.0` pin, or explicitly document why the `<1.14.0` range is supported.
* Add an output-cardinality assertion around `get_outputs()[-1]`, which currently assumes every terminal path yields a result.
* Consider replacing the dynamic executor lambda initializer with a keyword-based constructor or conventional subclass if framework API evolution makes dynamic construction fragile.

## Risks and Remaining Questions

* CI currently does not run worker pytest or build-test the worker image.
* The repository does not yet establish which migration command provisions the restricted `agent_control_worker` role and grants its permissions.
* Each PostgreSQL control-plane operation opens a fresh connection and commits independently. This supports recovery but can leave partially advanced state if a process dies between operations; acceptable states should be specified with an integration test.
* The project pins `agent-framework==1.13.0`, while the unavailable-runtime message advertises `>=1.13.0,<1.14.0`; these should be kept consistent.
* `get_outputs()[-1]` assumes at least one yielded workflow output. A future framework or graph change could violate that assumption.

## Evidence Sources

* `.copilot-tracking/research/subagents/2026-08-08/worker-runtime-research.md`
* `.copilot-tracking/research/subagents/2026-08-08/agent-framework-integration-research.md`
* `apps/agent-worker/pyproject.toml`
* `apps/agent-worker/src/workflow.py`
* `apps/agent-worker/src/main.py`
* `apps/agent-worker/src/supervisor.py`
* `apps/agent-worker/tests/test_workflow.py`
* `apps/agent-worker/tests/test_control_plane_postgres.py`
* `.github/workflows/ci.yml`
