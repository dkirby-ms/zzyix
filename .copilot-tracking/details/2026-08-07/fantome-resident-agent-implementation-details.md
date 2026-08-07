<!-- markdownlint-disable-file -->
# Implementation Details: Fantome Resident Agent Implementation

## Context Reference

Sources: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md, user-provided task-plan prompt, and accepted architecture decision docs/fantome-resident-agent-architecture.md referenced by the research.

## Implementation Phase 1: Server Identity and Read Contracts

<!-- parallelizable: false -->

### Step 1.1: Extend principal model for agents

Add an `agent` principal kind through the TypeScript schema, type definitions, and an authored SQL migration. The migration must preserve existing `human` and `system` values while enabling pre-provisioned agent principals with auditable activation state.

Files:
* apps/server/src/db/schema.ts - Add the `agent` principal kind and any active/provisioning columns required by the existing principal table shape.
* apps/server/src/db/types.ts - Update exported principal-kind types used by repository and auth code.
* apps/server/migrations/0011_agent_principal_kind.sql - Add the database enum or check-constraint change using the repository's existing migration convention.
* apps/server/src/auth/principalContext.postgres.integration.test.ts - Cover pre-provisioned active agent acceptance, unknown agent rejection, and inactive agent rejection.

Discrepancy references:
* DD-01 confirms the plan uses pre-provisioned principals instead of automatic creation for agent identities.

Success criteria:
* Existing human principal tests still pass.
* Agent principals can be loaded only when already provisioned and active.
* Unknown agent identities are rejected without inserting new principal rows.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 69-81) - Existing auth and principal-kind gaps.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 287-290) - Required agent principal and resolver work.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 319-323) - Focused principal integration-test anchors.

Dependencies:
* Existing server migration and Drizzle schema conventions.

### Step 1.2: Add app-only authentication branch

Implement a separate app-token verification path for worker calls. Validate issuer, audience, signature algorithm, expiry, application identity, and the `agent.runtime` application role from `roles`. Do not accept delegated `scp` or `scope` values as a substitute for application roles.

Files:
* apps/server/src/auth/tokenVerifier.ts - Keep existing human delegated-token behavior and add an app-role verifier or extracted shared validation helpers.
* apps/server/src/auth/httpAuth.ts - Route worker-only HTTP routes through the app-token branch and attach immutable server-derived principal context after mapping.
* apps/server/src/auth/principalContext.ts - Add explicit agent lookup that rejects absent or inactive agents.
* apps/server/src/auth/tokenVerifier.test.ts - Add app-role success and failure coverage for wrong role, issuer, audience, algorithm, and expiry.

Discrepancy references:
* DR-01 remains partially deferred until tenant and registration details are confirmed; implementation should parameterize issuer, audience, and role values.

Success criteria:
* Human delegated-auth tests keep their existing semantics.
* Worker app tokens require `roles` with `agent.runtime`.
* Unknown or inactive app identities receive an authorization failure and no principal is auto-provisioned.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 49-52) - Entra configuration research gap.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 69-77) - Existing delegated verifier and HTTP auth extension point.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 119-126) - Microsoft identity claims and protected API requirements.

Dependencies:
* Step 1.1 agent principal model.
* Environment configuration for expected app audience, issuer, and app role.

### Step 1.3: Create worker-only HTTP read routes

Add versioned internal HTTP read endpoints for the worker. Each route must call existing authorization-aware repository primitives for delivery context, authorized snapshots, and ordered event replay. Route inputs must be typed and bounded; they must not expose raw SQL, arbitrary Socket.IO event names, raw URLs, or unbounded query fragments.

Files:
* apps/server/src/routes/agentReads.ts - Implement worker-only routes and request/response schemas.
* apps/server/src/index.ts - Register the route module behind app-only auth and worker feature gating.
* apps/server/src/db/repository.ts - Reuse existing read methods or add small wrappers when needed; do not introduce worker write access to canonical tables.
* apps/server/src/routes/agentReads.test.ts - Cover authorization, input bounds, response redaction, and audit behavior.

Discrepancy references:
* DD-02 records the decision to expose HTTP read routes rather than Socket.IO or direct database reads.

Success criteria:
* Worker routes return only authorized quilt data for the mapped agent principal.
* Snapshot and event replay responses are bounded, typed, and safe to pass through the worker tool-redaction layer.
* Canonical quilt mutation paths remain inaccessible to the worker route set.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 82-88) - Existing repository reads and missing worker HTTP routes.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 150-155) - Server-authority boundary for canonical reads.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 193-195) - Typed tool contract constraints.

Dependencies:
* Steps 1.1 and 1.2.

### Step 1.4: Validate server phase changes

Run scoped server validation after completing Phase 1.

Validation commands:
* npm --prefix apps/server test -- src/auth/tokenVerifier.test.ts - Token verifier coverage.
* npm --prefix apps/server test -- src/auth/principalContext.postgres.integration.test.ts - Principal mapping coverage if PostgreSQL integration dependencies are available.
* npm --prefix apps/server test -- src/routes/agentReads.test.ts - Worker read-route contract coverage.
* npm --prefix apps/server run build - Server type and build validation.

## Implementation Phase 2: Agent Control Plane and Trigger Semantics

<!-- parallelizable: false -->

### Step 2.1: Add control-plane schema and restricted role

Create an `agent_control` schema or equivalent dedicated table namespace for agent assignments, lifecycle, leases, runs, checkpoints, triggers, tool outcomes, model-call metadata, and lifecycle audit. Add grants for a restricted worker role that can write only this schema and cannot write canonical quilt, patch, tile, ownership, or authorization tables.

Files:
* apps/server/migrations/0012_agent_control_plane.sql - Define control-plane tables, indexes, constraints, and role grants.
* apps/server/src/db/schema.ts - Add Drizzle table definitions only where the TypeScript server must inspect or seed control-plane state.
* apps/server/src/db/repository.ts - Add server-side provisioning or audit helpers when needed for setup and tests.
* apps/server/src/db/agentControlPlane.postgres.integration.test.ts - Validate lease takeover, renewal failure, trigger deduplication, checkpoint versioning, and restricted-role behavior.

Discrepancy references:
* DR-02 and DR-03 remain policy inputs for trigger coalescing and operating limits.
* DD-03 records the selected direct worker access to the restricted control-plane schema.

Success criteria:
* At most one unexpired lease can exist per quilt.
* Lease renewals require matching lease owner and run ID.
* Trigger IDs deduplicate under concurrent insert attempts.
* Restricted worker role cannot mutate canonical tables.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 89-95) - Existing lease, transaction, telemetry, and infra anchors.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 157-162) - Required restricted control-plane schema.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 293-294) - Compare-and-set lease and checkpoint transactions.

Dependencies:
* Phase 1 principal model if control-plane assignment rows reference agent principals.

### Step 2.2: Define initial trigger ingestion contract

Implement the minimum persisted trigger model needed for the MVP, with source, quilt ID, deduplication key, priority, status, created timestamp, and coalescing policy version. Keep producer count small and feature-gated until trigger policy values are confirmed.

Files:
* apps/server/migrations/0012_agent_control_plane.sql - Include trigger queue tables and indexes.
* apps/server/src/db/agentControlPlane.postgres.integration.test.ts - Add trigger deduplication and bounded pending queue tests.
* apps/agent-worker/src/control_plane.py - Consume trigger rows through transactional claim operations once the worker project exists.

Discrepancy references:
* DR-02 documents that exact trigger producers and coalescing semantics require follow-on confirmation.

Success criteria:
* Duplicate triggers for the same deduplication key do not create duplicate active work.
* Queue size limits are configurable and enforced.
* Pending trigger IDs are persisted in checkpoints before workflow execution proceeds.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 53-56) - Trigger producer and coalescing research gap.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 176-191) - Checkpoint state fields for pending triggers.

Dependencies:
* Step 2.1 control-plane schema.

### Step 2.3: Validate control-plane phase changes

Run focused database validation after completing Phase 2.

Validation commands:
* npm --prefix apps/server test -- src/db/agentControlPlane.postgres.integration.test.ts - Control-plane integration coverage.
* scripts/verify-quilt-migration.sh - Migration verification if the script supports the new migration set.
* npm --prefix apps/server run build - Server schema and repository type validation.

## Implementation Phase 3: Python Worker MVP

<!-- parallelizable: false -->

### Step 3.1: Scaffold the Python Agent Framework worker

Create `apps/agent-worker` as a separate Python project with dependency metadata, Dockerfile, typed source modules, configuration loading, logging, and test scaffolding. Use Microsoft Agent Framework with an explicit graph Workflow, but keep provider calls behind a fake gateway at first.

Files:
* apps/agent-worker/pyproject.toml - Python package metadata and dependencies, including `agent-framework` and test tooling.
* apps/agent-worker/Dockerfile - Worker container build.
* apps/agent-worker/src/supervisor.py - Trigger polling, lease claim, renewal, stop-on-lease-loss, retry, and lifecycle transitions.
* apps/agent-worker/src/workflow.py - Explicit graph Workflow orchestration.
* apps/agent-worker/src/gateway.py - Fake gateway first, with interface for governed Foundry integration.
* apps/agent-worker/src/tools.py - Typed HTTP read tools with input bounds and output redaction.
* apps/agent-worker/src/control_plane.py - Restricted schema access, leases, triggers, checkpoints, and run state.
* apps/agent-worker/src/checkpoints.py - Versioned checkpoint data model and migration helpers.
* apps/agent-worker/tests/ - Unit tests for supervisor, workflow, tools, gateway, and checkpoint behavior.

Discrepancy references:
* DD-04 records the selected explicit supervisor plus graph Workflow instead of Agent Framework Harness.

Success criteria:
* Worker can process a fake-model read-only trigger from lease claim through checkpoint commit.
* Lease loss stops workflow execution before additional tool or model calls.
* Tool inputs are fixed and typed; tool outputs are validated and redacted before model context use.
* User memory and user-authored prompt content are not part of the MVP prompt path.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 35-45) - Required outline for worker, leases, gateway, and deployment.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 105-118) - Agent Framework and workflow package findings.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 166-174) - Intended v1 call flow.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 295-300) - Fake gateway first, redaction, and governed Foundry requirements.

Dependencies:
* Phase 1 worker HTTP routes.
* Phase 2 control-plane schema.
* Python packaging tool selection and lockfile convention.

### Step 3.2: Add governed model gateway integration

After fake-gateway validation passes, add Azure AI Foundry calls behind a gateway with timeouts, retry budget, model routing, token limits, rate limits, concurrency limits, redacted telemetry, and deterministic fallback for malformed or unsafe outputs.

Files:
* apps/agent-worker/src/gateway.py - Implement governed provider calls behind the fake-gateway interface.
* apps/agent-worker/src/workflow.py - Consume gateway responses as structured output only.
* apps/agent-worker/tests/test_gateway.py - Cover budget exhaustion, timeout, retry, redaction, malformed response, and unsafe-output fallback.
* apps/agent-worker/tests/test_workflow.py - Verify structured proposals remain read-only and gated.

Discrepancy references:
* DR-03 documents unresolved production budgets; implementation must use conservative configuration defaults until policy values are confirmed.

Success criteria:
* Provider failures produce deterministic safe fallbacks.
* Token, concurrency, and rate limits are enforced before calls leave the worker.
* Telemetry excludes raw prompt content and sensitive tool payloads.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 57-59) - Operating limit research gap.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 298-300) - Gateway policy requirements.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 330-338) - Activation sequence and mutation exclusion.

Dependencies:
* Step 3.1 fake-gateway worker flow.
* Approved Foundry endpoint configuration.

### Step 3.3: Validate worker phase changes

Run worker validation after completing Phase 3.

Validation commands:
* python -m pytest apps/agent-worker/tests - Worker unit and integration-style tests.
* python -m compileall apps/agent-worker/src - Syntax validation for worker modules.
* docker build -f apps/agent-worker/Dockerfile apps/agent-worker - Container build validation.

## Implementation Phase 4: Deployment, Telemetry, and Feature Gates

<!-- parallelizable: false -->

### Step 4.1: Add worker deployment resources

Add an independently scalable worker Container App to the existing Azure Container Apps deployment. Configure managed identity, restricted PostgreSQL connectivity, internal server base URL, Foundry endpoint, Azure Monitor connection string, lease and trigger settings, and feature flags for model-free runtime, Foundry calls, and structured proposals.

Files:
* infra/bicep/modules/agent-worker.bicep - Worker Container App, identity, environment variables, scale settings, and secrets references.
* infra/bicep/main.bicep - Wire the worker module into the existing ACA environment and private PostgreSQL topology.
* infra/bicep/main.bicepparam - Add deployment parameters with non-secret defaults where appropriate.
* apps/agent-worker/Dockerfile - Ensure production container settings align with ACA execution.

Discrepancy references:
* DR-04 documents unresolved ingress and restricted-role topology confirmation.

Success criteria:
* Worker deploys independently from the TypeScript server.
* Worker receives managed identity and no broad canonical database credentials.
* Feature gates default to model-free or disabled states until validation evidence exists.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 93-95) - Existing Azure Monitor, ACA, and private PostgreSQL foundation.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 301-302) - Deployment requirements.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 340-355) - Selected deployment and authority approach.

Dependencies:
* Phase 3 worker container.
* Confirmed Azure identity and ingress configuration.

### Step 4.2: Add telemetry and operational evidence

Instrument server worker-read routes and the Python worker with trace, metric, and log fields for trigger processing, lease outcomes, tool calls, gateway budget decisions, model fallbacks, checkpoint commits, and activation gate state. Redact prompt and tool payload content.

Files:
* apps/server/src/telemetry.ts - Add server-side attributes or helpers for worker read-route telemetry if needed.
* apps/server/src/routes/agentReads.ts - Emit route-level telemetry and audit events.
* apps/agent-worker/src/supervisor.py - Emit lifecycle and lease telemetry.
* apps/agent-worker/src/gateway.py - Emit redacted budget, provider, and fallback telemetry.
* apps/agent-worker/src/tools.py - Emit redacted tool-call metadata and failures.

Discrepancy references:
* DR-03 remains the source for unresolved production retention, cost, and latency policy values.

Success criteria:
* Operations can distinguish lease loss, checkpoint recovery, tool failure, gateway fallback, and feature-gate-disabled states.
* Telemetry never includes raw user-authored prompt content or unredacted canonical payloads.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 93-95) - Existing Azure Monitor anchor.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 298-302) - Gateway and deployment telemetry requirements.

Dependencies:
* Phases 1 through 3.

### Step 4.3: Validate deployment phase changes

Run deployment and infrastructure validation after completing Phase 4.

Validation commands:
* az bicep build --file infra/bicep/main.bicep - Bicep compile validation if Azure CLI is available.
* docker build -f apps/agent-worker/Dockerfile apps/agent-worker - Worker container validation.
* npm --prefix apps/server run build - Server telemetry and route build validation.

## Implementation Phase 5: End-to-End Validation and Activation

<!-- parallelizable: false -->

### Step 5.1: Add multi-replica and recovery tests

Extend integration and e2e coverage to prove one active workflow per quilt, recovery from checkpoint after worker loss, lease-loss stop behavior, authorized server reads, model-free runtime gating, and no mutation capability.

Files:
* e2e/quilt-reconnect.spec.ts - Add worker process and agent token fixture coverage when fixture support exists.
* e2e/support/startMultiReplicaServer.ts - Add worker process orchestration if e2e tests own server lifecycle.
* e2e/support/testOidcIssuer.ts - Add app-role token fixture support for worker requests.
* apps/server/src/db/agentControlPlane.postgres.integration.test.ts - Keep lease and recovery database cases close to schema behavior.
* apps/agent-worker/tests/ - Add integration-style tests for restart and checkpoint recovery with fake gateway.

Discrepancy references:
* DR-02 and DR-03 affect exact trigger capacity and activation thresholds; tests should use conservative local defaults.

Success criteria:
* Two workers cannot process the same quilt concurrently under race conditions.
* A restarted worker resumes from the latest committed checkpoint.
* Worker loss or failed lease renewal prevents further tool and gateway work.
* E2E evidence shows read-only behavior remains behind feature gates.

Context references:
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 319-328) - Existing test anchors.
* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 330-338) - Activation sequence.

Dependencies:
* Phases 1 through 4.

### Step 5.2: Run full project validation

Execute full validation for changed packages and infrastructure.

Validation commands:
* npm --prefix apps/server test - Server unit and integration tests.
* npm --prefix apps/server run build - Server build.
* python -m pytest apps/agent-worker/tests - Worker tests.
* docker build -f apps/agent-worker/Dockerfile apps/agent-worker - Worker container build.
* az bicep build --file infra/bicep/main.bicep - Infrastructure build when Azure CLI is available.
* npx playwright test e2e/quilt-reconnect.spec.ts - Focused multi-replica or reconnect e2e coverage when dependencies are available.

### Step 5.3: Fix minor validation issues

Iterate on lint, type, test, and infrastructure validation failures when corrections are isolated and do not change architecture. Examples include missing imports, type annotations, migration ordering, test fixture wiring, and conservative configuration defaults.

### Step 5.4: Report blocking issues

When validation exposes unresolved tenant setup, ingress policy, Foundry provider configuration, production operating limits, or mutation/security scope expansion, document those blockers and return them for additional research and planning rather than expanding the MVP implementation inline.

## Dependencies

* Node.js and npm for the existing TypeScript server, migrations, and e2e tests.
* Python runtime and package manager for `apps/agent-worker`.
* Microsoft Agent Framework Python package.
* PostgreSQL integration-test environment.
* Docker for worker container validation.
* Azure CLI with Bicep support for infrastructure validation.
* Azure Entra app-role configuration and managed identity assignment.
* Azure AI Foundry endpoint for post-fake-gateway activation.

## Success Criteria

* Server principal and auth changes accept only pre-provisioned active agent identities for worker routes.
* Worker HTTP reads reuse authorization-aware server repositories and never expose canonical mutation surfaces.
* The restricted control-plane schema enforces one active workflow per quilt and durable recovery.
* The Python worker completes a fake-model read-only workflow through checkpoint commit.
* Foundry integration is bounded by gateway policy, redacted telemetry, and deterministic fallback.
* Deployment adds an independently scalable worker with managed identity, restricted database access, and disabled-by-default activation gates.
* Tests cover auth, principal mapping, leases, trigger deduplication, checkpoint recovery, read-only route contracts, gateway behavior, and multi-replica recovery.
