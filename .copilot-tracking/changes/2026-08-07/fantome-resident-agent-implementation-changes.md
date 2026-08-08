<!-- markdownlint-disable-file -->
# Release Changes: Fantome Resident Agent Implementation

**Related Plan**: .copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md
**Implementation Date**: 2026-08-07

## Summary

Implementation complete with Phase 5 partially validated. Phases 1, 2, and 4 are complete; Phase 3 and Phase 5 have the same host-side Python pytest tooling blocker.

## Changes

### Added

* apps/server/migrations/0011_agent_principal_kind.sql - Added migration to support `agent` principal kind.
* apps/server/src/routes/agentReads.ts - Added internal worker-only typed read routes.
* apps/server/src/routes/agentReads.test.ts - Added contract tests for worker read routes.
* apps/server/migrations/0012_agent_control_plane.sql - Added control-plane schema, restricted worker role, grants, constraints, and queue bound trigger.
* apps/server/src/db/agentControlPlane.postgres.integration.test.ts - Added integration tests for lease ownership, trigger deduplication, checkpoint compare-and-set, and restricted-role write denial.
* apps/agent-worker/pyproject.toml - Added Python worker package metadata, dependencies, and tooling configuration.
* apps/agent-worker/Dockerfile - Added worker container build for local and deployment validation.
* apps/agent-worker/README.md - Added worker module overview and runtime constraints.
* apps/agent-worker/src/main.py - Added worker process entrypoint.
* apps/agent-worker/src/supervisor.py - Added trigger loop, lease orchestration, and lease-loss stop behavior.
* apps/agent-worker/src/workflow.py - Added explicit graph workflow with read-only structured action outputs.
* apps/agent-worker/src/gateway.py - Added fake-first and governed gateway paths with deterministic fallback behavior.
* apps/agent-worker/src/tools.py - Added typed bounded HTTP read tools with response redaction.
* apps/agent-worker/src/control_plane.py - Added in-memory and PostgreSQL-backed control-plane persistence adapters.
* apps/agent-worker/src/checkpoints.py - Added versioned checkpoint data model and helpers.
* apps/agent-worker/tests/conftest.py - Added shared worker test fixtures.
* apps/agent-worker/tests/test_supervisor.py - Added supervisor flow and lease-availability tests.
* apps/agent-worker/tests/test_workflow.py - Added workflow lease-loss interruption and read-only output tests.
* apps/agent-worker/tests/test_gateway.py - Added budget, timeout, malformed-response, and fallback tests.
* apps/agent-worker/tests/test_tools.py - Added bounded-input and redaction coverage for worker read tools.
* apps/agent-worker/tests/test_checkpoints.py - Added checkpoint version and serialization coverage.
* apps/agent-worker/tests/test_checkpoints.py - Added checkpoint recovery round-trip coverage.
* apps/agent-worker/tests/test_supervisor.py - Added one-active-lease exclusion coverage.
* apps/agent-worker/src/telemetry.py - Added redacted worker operational telemetry helpers.
* infra/bicep/modules/agent-worker.bicep - Added independently scalable worker Container App with managed identity and restricted configuration.

### Modified

* apps/server/migrations/meta/_journal.json - Registered the new migration.
* apps/server/src/db/types.ts - Extended principal-kind typings with `agent`.
* apps/server/src/auth/config.ts - Added app-only auth configuration for agent tokens.
* apps/server/src/auth/config.test.ts - Added tests for new app-only auth configuration.
* apps/server/src/auth/tokenVerifier.ts - Added app-token verification with required role checks.
* apps/server/src/auth/tokenVerifier.test.ts - Added app-only token verifier success and failure tests.
* apps/server/src/auth/principalContext.ts - Added active pre-provisioned agent principal resolution.
* apps/server/src/auth/principalContext.postgres.integration.test.ts - Added integration coverage for active/inactive/unknown agent principal behavior.
* apps/server/src/index.ts - Registered worker read routes under feature gate and app-only auth.
* apps/server/src/db/schema.ts - Added Drizzle control-plane table definitions needed by server-side inspection and tests.
* infra/bicep/main.bicep - Wired the worker module into the existing ACA and private database topology.
* infra/bicep/main.bicepparam - Added worker deployment parameters with safe defaults.
* infra/bicep/main.json - Updated generated Bicep output.
* apps/agent-worker/Dockerfile - Aligned production container settings with ACA deployment.
* apps/agent-worker/src/main.py - Added telemetry bootstrap and feature-gate configuration.
* apps/agent-worker/src/supervisor.py - Added lifecycle, lease, checkpoint, and gate telemetry.
* apps/agent-worker/src/gateway.py - Added redacted budget and fallback telemetry.
* apps/agent-worker/src/tools.py - Added redacted tool-call telemetry.
* apps/agent-worker/pyproject.toml - Added telemetry/runtime dependency configuration.
* apps/server/src/telemetry.ts - Added payload-redacted worker read span support.
* apps/server/src/index.ts - Fixed lazy auth verifier initialization discovered during full validation.
* apps/server/src/index.integration.test.ts - Updated live integration identity fixture.

### Removed

* None yet.

## Additional or Deviating Changes

* apps/server/src/routes directory was created to host worker route modules and tests.
	* The repository did not previously contain a `src/routes` folder.
* Required validation command `python -m pytest apps/agent-worker/tests` could not run in this environment.
	* Host lacks a `python` alias and does not currently provide `pip`/`pytest`; alternate `python3 -m compileall` and Docker validation passed.
* Phase 4 subagent invocation required one retry after a transient expired-token failure; the retry completed successfully.
* Full worker pytest execution remains unavailable because the host has no `python` alias and `python3` lacks `pytest`.
	* Worker syntax compilation and Docker image validation passed; a worker restart e2e fixture remains follow-on work.

## Release Summary

Implemented the read-only Fantome resident-agent MVP across the TypeScript server, PostgreSQL control plane, Python worker, infrastructure, telemetry, and recovery test surfaces. Added pre-provisioned active agent principals, app-only role authentication, typed worker read routes, restricted control-plane persistence, lease/checkpoint/trigger semantics, fake-first governed gateway behavior, independently scalable ACA deployment, redacted telemetry, and feature gates that keep mutation and model activation disabled by default. Available server, build, Docker, Bicep, syntax, and reconnect validations passed. Final Python unit-test execution and a dedicated worker-process restart fixture remain required before production activation.
