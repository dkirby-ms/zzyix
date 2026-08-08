<!-- markdownlint-disable-file -->
# Release Changes: Fantome Resident Agent Implementation

**Related Plan**: .copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md
**Implementation Date**: 2026-08-07

## Summary

Implementation rework is complete through the worker runtime. Phase 4 and Phase 5 remain partial for deployment-specific identity/RBAC wiring, full pytest execution, and real PostgreSQL-backed worker restart evidence.

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
* apps/server/src/routes/agentReads.auth.test.ts - Added app-only internal route authentication coverage that rejects delegated tokens and accepts agent app-role tokens.
* docs/fantome-agent-entra-setup.md - Added dedicated Entra ID and Azure RBAC runbook for worker identity activation.
* apps/agent-worker/tests/test_control_plane_postgres.py - Added skip-gated PostgreSQL worker control-plane contention and checkpoint resume coverage.
* apps/server/migrations/0015_patch_scoped_agent_assignments.sql - Added patch-scoped agent assignments for worker read authorization.
* apps/server/migrations/0016_agent_control_permissions_and_queue_guards.sql - Added restricted worker grants and requeue capacity enforcement.
* apps/agent-worker/tests/test_telemetry.py - Added Azure Monitor telemetry bootstrap coverage.
* apps/agent-worker/src/control_plane_access_verification.py - Added deploy-time restricted-role and canonical-write-denial verification.
* apps/agent-worker/tests/test_control_plane_access_verification.py - Added restricted-role verifier unit coverage.

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
* apps/agent-worker/src/workflow.py - Added the production WorkflowBuilder/Executor/@handler adapter, async bridge, and test-only local graph fallback.
* apps/agent-worker/src/supervisor.py - Added durable run resume, checkpoint callbacks, stale-trigger reclaim, background lease renewal, and model-free claim gating.
* apps/agent-worker/src/control_plane.py - Added trigger requeue support and durable run/trigger recovery behavior.
* apps/agent-worker/src/main.py - Removed the production in-memory control-plane fallback and require a durable DSN.
* apps/agent-worker/tests/test_workflow.py - Added production-path framework adapter coverage.
* apps/agent-worker/src/identity.py - Added managed-identity token acquisition and refresh for server and Foundry calls.
* apps/agent-worker/tests/test_identity.py - Added token provider coverage.
* apps/agent-worker/pyproject.toml - Added telemetry/runtime dependency configuration.
* apps/server/src/telemetry.ts - Added payload-redacted worker read span support.
* apps/server/src/telemetry.ts - Added worker principal identifier hashing for additional route telemetry redaction.
* apps/agent-worker/src/supervisor.py - Added checkpoint recovery telemetry evidence for resumed workflow runs.
* .env.example - Added server auth, agent auth, worker runtime, and telemetry environment placeholders.
* .github/workflows/cd.yml - Added agent-worker image build and Container App deployment using GitHub environment vars and secrets.
* scripts/gh-vars.env.template - Added Fantome agent GitHub environment variable and secret inputs.
* scripts/bootstrap-cd-environment.sh - Added Fantome agent variable and secret bootstrap support.
* infra/bicep/main.bicepparam - Converted deployment-specific agent template values to environment-variable backed sample parameters.
* apps/server/src/index.ts - Fixed lazy auth verifier initialization discovered during full validation.
* apps/server/src/index.integration.test.ts - Updated live integration identity fixture.
* apps/server/src/index.integration.test.ts - Added live app-role token coverage through the startup-registered worker route.
* apps/server/src/auth/testOidcIssuer.test.ts - Added coverage for app-role worker token issuance.
* e2e/support/testOidcIssuer.ts - Added local app-role token issuance support with `roles`, `azp`, and `appid` claims.
* .copilot-tracking/research/subagents/2026-08-07/microsoft-agent-framework-python-api.md - Recorded the verified Agent Framework 1.13.0 workflow API used by the worker adapter.
* apps/server/src/auth/config.ts - Require dedicated agent issuer and audience configuration without delegated-user fallback.
* apps/server/src/routes/agentReads.ts - Enforce patch-scoped reads and write durable worker-read authorization audit records.
* apps/server/src/db/repository.ts - Added patch assignment and authorization-audit persistence helpers.
* apps/server/src/db/schema.ts - Added patch-scoped assignment schema support.
* apps/agent-worker/src/control_plane.py - Enforced active assignments for run and lease ownership, requeue capacity, and corrected lease-claim parameter binding.
* apps/agent-worker/src/checkpoints.py - Preserved replay semantics for incomplete workflow checkpoints.
* apps/agent-worker/src/gateway.py - Added bounded redacted tool context to governed requests.
* apps/agent-worker/src/telemetry.py - Added Azure Monitor OpenTelemetry bootstrap.
* apps/agent-worker/src/main.py - Limited static-token and local workflow adapters to explicit test mode.
* .github/workflows/cd.yml - Added a post-deployment worker-container execution of the restricted-role verifier.
* scripts/bootstrap-cd-environment.sh - Added bootstrap validation for the restricted worker DSN secret.
* scripts/release-contract.test.mjs - Added the CD contract assertion for restricted worker database access verification.

### Removed

* None yet.

## Additional or Deviating Changes

* apps/server/src/routes directory was created to host worker route modules and tests.
	* The repository did not previously contain a `src/routes` folder.
* Phase 1 review rework completed after the initial implementation.
	* Worker routes now register during application startup, enforce active assigned-patch boundaries, and bound snapshot and event responses.
	* Focused validation passed for token verification, worker routes, startup registration, principal integration, and server build.
* Required validation command `python -m pytest apps/agent-worker/tests` could not run in this environment.
	* Host lacks a `python` alias and does not currently provide `pip`/`pytest`; alternate `python3 -m compileall` and Docker validation passed.
* Phase 4 subagent invocation required one retry after a transient expired-token failure; the retry completed successfully.
* Full worker pytest execution remains unavailable because the host has no `python` alias and `python3` lacks `pytest`.
	* Worker syntax compilation and Docker image validation passed; a worker restart e2e fixture remains follow-on work.
* The Agent Framework dependency is constrained to `>=1.13.0,<1.14.0` based on the verified API surface; production startup fails closed if that API is unavailable.
* Deployment rework removed static bearer/API-key production paths, requires a durable DSN, uses at least one worker replica, and aligns the control-plane schema with `agent_control`.
* Phase 5 added simulated restart, stale-claim reclaim, lease-loss ordering, model-free gating, and agent-assignment coverage; a real two-process PostgreSQL fixture remains outstanding.
* Additional Phase 5 validation rerun completed in this execution.
	* Passed: `npm --prefix apps/server test`, `npm --prefix apps/server run build`, `docker build -f apps/agent-worker/Dockerfile apps/agent-worker`, and `npx playwright test --config playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts`.
	* Blocked: `python3 -m pytest apps/agent-worker/tests` because `pytest` is not installed in the host Python environment.
* GitHub environment variable migration rework moved deployment-specific Fantome agent settings out of committed parameter values and into CD-managed environment variables and secrets.
	* Passed: `bash -n scripts/bootstrap-cd-environment.sh`, `az bicep build --file infra/bicep/main.bicep`, `az bicep build-params --file infra/bicep/main.bicepparam`, `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml'))"`, and `git diff --check` for the touched deployment files.
	* Skipped: `actionlint .github/workflows/cd.yml` because `actionlint` is not installed in the host environment.
* Phase 5 validation rework added live app-role route coverage and PostgreSQL-gated worker control-plane recovery coverage.
	* Passed: `npm --prefix apps/server test -- src/auth/testOidcIssuer.test.ts`, `npm --prefix apps/server test -- src/index.integration.test.ts`, `npm --prefix apps/server test -- src/routes/agentReads.auth.test.ts`, `npm --prefix apps/server run build`, `python3 -m compileall apps/agent-worker/src apps/agent-worker/tests`, and `npx playwright test --config playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts`.
	* Blocked: `python3 -m pytest apps/agent-worker/tests` because `pytest` is not installed; local virtual environment creation is unavailable because `ensurepip`/`python3.12-venv` is missing; `AGENT_WORKER_POSTGRES_TEST_DSN` was not available to execute the new PostgreSQL worker integration test.
* Review remediation addressed C2 and all code-remediable major findings.
	* Passed: focused server tests (27 tests), server TypeScript build, worker source/test compilation, Docker worker-image build, `git diff --check`, and editor diagnostics.
	* Blocked: worker pytest cannot be installed in the existing isolated environment because its Python build lacks `ensurepip`; PostgreSQL subprocess restart evidence requires `AGENT_WORKER_POSTGRES_TEST_DSN`.
* The deployment flow now verifies the configured worker DSN role after Container App deployment.
	* Passed: the CD release-contract suite (11 tests), shell syntax, verifier compilation, and Docker worker-image build.
	* Blocked: the CD verification itself requires GitHub Environment secret `AGENT_CONTROL_PLANE_DSN` and Azure access to execute the deployed Container App.

## Release Summary

Implemented the read-only Fantome resident-agent MVP and completed targeted rework across the TypeScript server, PostgreSQL control plane, Python worker, infrastructure, telemetry, and recovery surfaces. Added durable checkpointed framework workflows, stale-trigger reclaim, lease renewal and loss handling, managed-identity token acquisition, production model-free gating, and a pinned Agent Framework adapter. The review remediation now scopes worker reads to individual patches, persists worker-read authorization decisions, separates app-token trust settings, restricts control-plane writes, verifies the deployed worker DSN role and canonical write denial, preserves restart replay context, sends bounded provider context, configures worker telemetry export, and adds a PostgreSQL-backed subprocess restart fixture. Full worker pytest execution, PostgreSQL restart-fixture execution, deployed DSN verification, and deployment-specific Entra/RBAC configuration remain required before production activation.
