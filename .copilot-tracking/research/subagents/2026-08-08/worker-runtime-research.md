---
title: Agent Worker Runtime and Testing Research
description: Evidence-based research into the zzyix agent-worker runtime, tests, prerequisites, and CI integration
ms.date: 2026-08-08
ms.topic: reference
---

# Agent Worker Runtime and Testing Research

## Scope and Questions

Research the runtime and testing architecture in `apps/agent-worker`, including runtime selection, Agent Framework usage, graph construction, checkpoint and lease behavior, fixtures, local prerequisites, environment variables, PostgreSQL process integration, and CI workflow coverage.

## Evidence Log

### Runnable commands

* `cd apps/agent-worker && .venv/bin/python -m pytest tests` returned `35 passed, 5 skipped in 1.52s`.
* `cd apps/agent-worker && .venv/bin/python -m pytest tests/test_control_plane_postgres.py -q` returned `5 skipped` because `AGENT_WORKER_POSTGRES_TEST_DSN` was not set.
* `cd apps/agent-worker && .venv/bin/python -c 'import workflow; print(workflow.detect_graph_runtime())'` returned `agent-framework-api-present`.
* A test-mode probe returned `True` for `main.is_static_server_token_enabled()` with `NODE_ENV=test`; the same flag outside test raised `ValueError: AGENT_USE_STATIC_SERVER_TOKEN is only permitted when NODE_ENV=test`.

### Source and CI references

* `apps/agent-worker/pyproject.toml:10-16` requires Python `>=3.11`, pins `agent-framework==1.13.0`, and declares Azure Identity, Azure Monitor OpenTelemetry, and psycopg dependencies. `pyproject.toml:18-26` supplies pytest and configures `tests` plus `src` on `PYTHONPATH`.
* `apps/agent-worker/README.md:5-20` documents `python -m pytest tests`, the production variables `AGENT_PRINCIPAL_ID`, `AGENT_CONTROL_PLANE_DSN`, and `AGENT_SERVER_TOKEN_SCOPE`, and managed-identity-only production authentication. `README.md:22-31` documents the test-only static token override.
* `.github/workflows/ci.yml:118-180` provisions PostgreSQL for the JavaScript test job, but the test matrix is only `[client, server]`; no Python setup or worker pytest command is present. The E2E jobs at `.github/workflows/ci.yml:189-243` use PostgreSQL only for application E2E.
* `.github/workflows/cd.yml:28-43` builds an `agent-worker` image. Deployment variables and feature gates are configured at `.github/workflows/cd.yml:135-175`, and the worker deployment passes the DSN as a secret reference plus runtime variables at `.github/workflows/cd.yml:755-850`. `.github/workflows/cd.yml:858-865` executes `python -m control_plane_access_verification` after deployment.
* `apps/agent-worker/Dockerfile:1-17` uses `python:3.11-slim`, installs the local package, sets `PYTHONPATH=/app/src`, and starts `python -m main`. `docker-compose.yaml:2-35` starts PostgreSQL and Redis, but does not install the worker, apply migrations, or configure its DSN.

## Key Discoveries

### Runtime selection and graph

* `apps/agent-worker/src/workflow.py:34-58` defines `GraphWorkflow`; construction calls `_load_framework_runtime()` unless a runtime is injected. `workflow.py:304-312` imports `agent_framework` and accepts it only when `WorkflowBuilder`, `Executor`, `WorkflowContext`, and `handler` are all present. Missing or incompatible APIs raise `FrameworkRuntimeUnavailable` before worker startup.
* `workflow.py:74-131` constructs the fixed graph `load_context -> load_events -> draft_proposal`. Each node is dynamically wrapped as an Agent Framework `Executor`; `WorkflowBuilder(start_executor=executors[0])` and `add_chain(executors)` build the graph, then `build().run(state)` supplies the final `yield_output` dictionary to `WorkflowResult`.
* `workflow.py:132-219` uses `runtime.handler`, `runtime.Executor`, and `WorkflowContext` annotation injection. Tool calls and gateway generation are moved to worker threads with `asyncio.to_thread`; the graph is run synchronously through `workflow.py:278-302`, including a helper thread when called from an existing event loop.
* The graph is read-only: context and patch events are fetched through `AgentReadTools`; the default proposal is observation-only. The gateway is called only when `structured_proposals_enabled` is true (`workflow.py:156-184`).

### Production construction and environment

* `apps/agent-worker/src/main.py:46-67` always constructs `PostgresControlPlane` and requires `AGENT_CONTROL_PLANE_DSN` and `AGENT_SERVER_TOKEN_SCOPE`. Without the DSN, durable control-plane operation is rejected.
* `main.py:34-43` permits `AGENT_USE_STATIC_SERVER_TOKEN` only when `NODE_ENV=test`; otherwise production uses `ManagedIdentityTokenProvider` (`identity.py:20-56`) backed by `DefaultAzureCredential` with cached tokens and a refresh skew.
* `main.py:69-109` reads gateway and feature variables: `AGENT_GATEWAY_MODE`, `AGENT_FEATURE_MODEL_FREE_ENABLED`, `AGENT_FEATURE_FOUNDRY_ENABLED`, `AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED`, optional Foundry scope/endpoint/model, and gateway limits. The default gateway is fake and structured proposals are disabled.
* `apps/agent-worker/src/supervisor.py:209-226` reads `AGENT_PRINCIPAL_ID`, `AGENT_LEASE_TTL_SECONDS` (default 20), `AGENT_POLL_INTERVAL_SECONDS` (default 0.5), and the model-free gate. `main.py:75-90` also reads server URL, tool timeout, policy/framework versions, and gateway limits. `telemetry.py` additionally consumes `APPLICATIONINSIGHTS_CONNECTION_STRING`, covered by `tests/test_telemetry.py:4-17`.

### Trigger, lease, and checkpoint lifecycle

* `apps/agent-worker/src/supervisor.py:51-141` claims an assigned trigger, resumes or creates a run, claims a quilt lease, loads a checkpoint, commits checkpoint callbacks with monotonically increasing versions, and then completes or fails the run. Lease loss cancels and requeues the trigger; all paths release the lease in `finally`.
* `supervisor.py:143-207` starts a daemon renewal thread at one-third of the TTL and also renews/checks ownership before and after graph work. A failed renewal or ownership check prevents work from proceeding or causes the result to be discarded.
* `apps/agent-worker/src/control_plane.py:78-259` provides an in-memory test implementation. It enforces active assignments, one live lease per quilt, generation increments after expiry, stale trigger reclamation after 60 seconds, and compare-and-set checkpoint versions.
* `control_plane.py:264-440` implements the PostgreSQL equivalent. Trigger claiming uses active assignments, `FOR UPDATE SKIP LOCKED`, priority/creation ordering, and stale-claim reclamation. Lease acquisition is an expiry-gated `ON CONFLICT` update with generation increments; renewal and ownership checks require run, principal, generation, and non-expired lease.
* `control_plane.py:441-565` loads checkpoints by quilt/run and persists them using either an upsert for a new checkpoint or a version-guarded update for an existing checkpoint. Every helper opens a fresh psycopg connection context (`control_plane.py:560-568`), so each SQL operation commits independently when the context exits.
* `apps/agent-worker/src/checkpoints.py:6-76` validates checkpoint shape, positive versions, non-negative observed revisions, and `list[str]` pending trigger IDs. Intermediate graph checkpoints intentionally replay read-only state from fresh server data (`workflow.py:247-267`) rather than restoring ephemeral tool output.

### Test architecture

* `apps/agent-worker/tests/conftest.py:1-8` adds `src` to `sys.path`; there are no shared pytest fixtures beyond that.
* `tests/test_workflow.py:10-119` supplies a fake framework, tool stubs, gateway stubs, and a blocking gateway. Tests at `test_workflow.py:121-274` cover lease loss before/during provider work, read-only proposals, the feature gate, injected framework graph execution, partial-checkpoint replay, and provider-result discard.
* `tests/test_supervisor.py:1-375` uses `InMemoryControlPlane` and workflow stubs to cover completion, lease contention, feature gates, stale-trigger reclaim, run/checkpoint resume, requeue after lease loss, assignment filtering, and single-owner lease behavior.
* `tests/test_checkpoints.py:1-59` covers validation, version advancement, and round-trip restoration. `tests/test_identity.py:1-23` covers near-expiry managed-identity refresh. `tests/test_gateway.py:1-91` covers deterministic fake output, limits, Foundry fallback, redacted context, and rate limiting. `tests/test_tools.py:1-111` uses an in-process HTTP server to cover redaction, request validation, and response size limits. `tests/test_telemetry.py:1-17` covers Application Insights configuration. `tests/test_control_plane_access_verification.py:1-70` covers expected restricted role and canonical write denial.
* `tests/test_control_plane_postgres.py:33-47` makes all five PostgreSQL tests opt-in and requires a migrated database. Its fixture seeds principals, a quilt, an assignment, and a trigger (`test_control_plane_postgres.py:41-92`) and cleans them up afterward.
* The PostgreSQL tests cover concurrent trigger claims and leases (`test_control_plane_postgres.py:94-232`), assignment and queue-capacity enforcement (`149-206`), and a production subprocess restart flow (`288-324`). That flow uses `ThreadingHTTPServer`, starts `src/main.py` with test-only static-token variables (`326-348`), waits for a persisted intermediate checkpoint, terminates the first worker, expires claim/lease rows, starts a second worker, and asserts completion with the original run and a newer checkpoint.

## Risks and Testing Recommendations

### Risks

* The repository CI does not run `apps/agent-worker` tests. The PostgreSQL service in `ci.yml` is not enough because the worker fixture also requires zzyix migrations, seeded control-plane tables, and `AGENT_WORKER_POSTGRES_TEST_DSN`.
* The default workflow unit tests use `_FakeFramework`, which models `add_chain`, `handler`, and output collection but does not validate the installed Agent Framework's handler metadata, executor discovery, or event semantics. A package upgrade could therefore pass unit tests while breaking the real graph path.
* Production startup has a hard DSN and managed-identity dependency. Local `docker-compose.yaml` provides only a vanilla PostgreSQL process; it does not create the restricted `agent_control_worker` role or apply the migrations needed by the worker.
* Checkpoint writes are independently committed from trigger/run/lease writes because the adapter opens one connection per operation. Recovery is designed for that ordering, but an operational failure between those writes can leave a claimed trigger, a running run, or a checkpoint requiring stale-claim recovery.
* The worker image is built and deployed by CD, but CI does not build or smoke-test that image and does not verify the worker's production configuration path.

### Recommended testing approach

1. Keep the current fast suite as the first gate: `cd apps/agent-worker && python -m pytest tests`, with a Python 3.11 or newer environment and `pip install -e '.[dev]'`. Treat the five PostgreSQL skips as an explicit environment result, not as coverage.
2. Add a CI worker job that installs Python, installs `apps/agent-worker` including dev dependencies, and runs the fast suite. Add a separate PostgreSQL integration job that applies the server migrations, creates the restricted worker role/DSN, sets `AGENT_WORKER_POSTGRES_TEST_DSN`, and runs `tests/test_control_plane_postgres.py`.
3. Add one real Agent Framework regression test using the installed `agent-framework==1.13.0`, local tool/gateway stubs, and the real `WorkflowBuilder` path. Assert graph output, checkpoint callbacks, and lease-loss behavior. Keep the injected fake-framework tests for deterministic edge cases.
4. Run the existing subprocess restart test against the same migrated PostgreSQL service used by CI. Preserve assertions for exactly-one trigger claim, exactly-one live lease, generation increment, original run identity, and checkpoint version increase.
5. Build the worker Docker image in CI and run a configuration smoke test that verifies missing DSN/scope failures, managed-identity selection, test-token rejection outside `NODE_ENV=test`, and the default feature gates. Do not provide static tokens in deployment jobs.

## Remaining Questions

* Which existing deployment or migration command provisions the `agent_control_worker` database role and grants its restricted permissions? The worker-side verification command exists, but the role-creation source was outside the requested worker files and was not established by the inspected CI workflow.
* Should worker pytest and PostgreSQL integration become required CI checks, or is the current release/deployment-only validation intentional?
* Is the one-connection-per-operation control-plane design an explicit availability/recovery decision? If not, an integration test should define acceptable states after process termination between checkpoint and trigger/run updates.
