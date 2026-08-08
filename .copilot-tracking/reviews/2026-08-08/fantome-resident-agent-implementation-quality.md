<!-- markdownlint-disable-file -->
# Implementation Quality Review: Fantome Resident Agent

## Scope

The quality review covered the changed server, worker, infrastructure, deployment, telemetry, documentation, and test files listed in the changes log, using the implementation plan, research, and 2026-08-08 phase validation reports as context.

## Findings

### Critical

* The worker managed identity is created but is not assigned the server `agent.runtime` app role or Foundry RBAC. The deployment therefore cannot prove that the worker can call protected reads or that Foundry access is bounded. See [agent-worker.bicep](../../infra/bicep/modules/agent-worker.bicep#L202-L207) and [fantome-agent-entra-setup.md](../../../docs/fantome-agent-entra-setup.md#L172-L194).
* No real worker process restart test proves PostgreSQL-backed checkpoint recovery after termination. The restart-named test is an in-memory `process_once` call. See [test_supervisor.py](../../../apps/agent-worker/tests/test_supervisor.py#L231-L259) and the changes log's outstanding work.

### Major

* Assignments are quilt-scoped although the planned read boundary is an assigned patch, allowing sibling-patch reads. See [0012_agent_control_plane.sql](../../../apps/server/migrations/0012_agent_control_plane.sql#L4-L21) and [agentReads.ts](../../../apps/server/src/routes/agentReads.ts#L161-L203).
* Worker database grants allow assignment and lifecycle-control mutation, and lower-level claim/run operations do not independently enforce active assignment ownership. See [0012_agent_control_plane.sql](../../../apps/server/migrations/0012_agent_control_plane.sql#L256-L264) and [control_plane.py](../../../apps/agent-worker/src/control_plane.py#L319-L367).
* Requeue updates can bypass the pending-trigger capacity trigger. See [0013_agent_control_recovery.sql](../../../apps/server/migrations/0013_agent_control_recovery.sql#L24-L52) and [control_plane.py](../../../apps/agent-worker/src/control_plane.py#L510-L519).
* Intermediate checkpoints omit tool outputs and proposal state, so resumed suffixes can execute with empty context. See [checkpoints.py](../../../apps/agent-worker/src/checkpoints.py#L8-L18) and [workflow.py](../../../apps/agent-worker/src/workflow.py#L194-L203).
* Foundry payload construction measures `tool_context` but does not include it in the provider request. See [gateway.py](../../../apps/agent-worker/src/gateway.py#L114-L123).
* The real pinned Agent Framework runtime path is unverified because the host lacks `agent_framework`; worker tests use a fake framework and pytest is unavailable. See [workflow.py](../../../apps/agent-worker/src/workflow.py#L215-L242) and [test_workflow.py](../../../apps/agent-worker/tests/test_workflow.py#L158-L179).
* The worker DSN is an opaque deployment secret and is not proven to authenticate as `agent_control_worker`; canonical-write denial is not verified for the deployed credential. See [agent-worker.bicep](../../../infra/bicep/modules/agent-worker.bicep#L96-L100) and [postgresql.bicep](../../../infra/bicep/modules/postgresql.bicep#L42-L83).
* Worker telemetry logs JSON but does not configure an Azure Monitor/OpenTelemetry exporter despite receiving the Application Insights connection string. See [telemetry.py](../../../apps/agent-worker/src/telemetry.py#L10-L31) and [main.py](../../../apps/agent-worker/src/main.py#L20-L23).
* Worker PostgreSQL contention/recovery tests are skip-gated and were not executed, and the configured multi-replica Playwright harness starts server replicas but no worker. See [test_control_plane_postgres.py](../../../apps/agent-worker/tests/test_control_plane_postgres.py#L20-L132) and [playwright.multi-replica.config.ts](../../../playwright.multi-replica.config.ts#L37).
* Agent issuer and audience settings can fall back to human authentication settings, weakening trust-boundary separation. See [config.ts](../../../apps/server/src/auth/config.ts#L71-L79).
* Durable worker-read authorization audit records are not implemented or evidenced. Route telemetry is not a durable audit substitute. See [agentReads.ts](../../../apps/server/src/routes/agentReads.ts#L89-L157).

### Minor

* Explicit overflow tests for context, snapshots, and serialized responses are missing. See [agentReads.test.ts](../../../apps/server/src/routes/agentReads.test.ts#L106-L157).
* Lease-loss coverage does not exercise an in-flight blocked HTTP or provider call. See [test_workflow.py](../../../apps/agent-worker/tests/test_workflow.py#L97-L124).
* PostgreSQL coverage does not directly test requeue-at-capacity, assignment ownership, or competing lease acquisition.
* The worker telemetry gate/export path lacks focused tests.

## Verified Strengths

App-only role validation, active pre-provisioned principal mapping, startup route registration, bounded typed routes, canonical server read reuse, managed-identity token acquisition code, disabled-by-default model and mutation gates, lease CAS, trigger deduplication, redacted telemetry fields, server tests/build, Bicep compilation, worker syntax compilation, Docker build, and deployment-file syntax checks are present.

## Overall Assessment

Needs Rework for activation. The implementation is substantial and the earlier route-registration, durable-DSN fallback, local workflow, and static-token findings are closed by inspection or focused evidence, but identity/RBAC, process-level recovery, control-plane authority, checkpoint fidelity, and worker observability remain unresolved.
