<!-- markdownlint-disable-file -->
# Implementation Review: Fantome Resident Agent Implementation

## Review Metadata

* Date: 2026-08-08
* Related plan: `.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md`
* Research: `.copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md`
* Review method: Existing RPI phase validations were re-read; the current implementation and validation commands were rechecked.
* Status: Needs Rework

## Summary

The implementation establishes substantial scaffolding for a read-only agent,
including app-only token verification, a control-plane migration, a worker
package, safe default gates, and a Container App module. It does not yet meet
the plan's operational authority, durability, identity, or activation
requirements. The worker cannot authenticate with its managed identity, its
server read routes are not available at process startup, and it cannot resume
a checkpoint after process loss.

| Severity | Count |
|----------|-------|
| Critical | 5 |
| Major    | 14 |
| Minor    | 3 |

## Synthesized Findings

### Critical

* Worker read routes are registered from `sendCanonicalWorldDiscovery`, not at
	startup. A worker cannot reach the feature-gated internal API until an
	unrelated canonical-world request has executed. See
	`apps/server/src/index.ts:1007` and the Phase 1 validation.
* Durable restart recovery is absent. Triggers become claimed without a stale
	claim recovery path, each attempt creates a new run ID, and checkpoints are
	persisted only after workflow completion. See
	`apps/agent-worker/src/supervisor.py:34-68`,
	`apps/agent-worker/src/control_plane.py:210-314`, and the Phase 2, 3, and 5
	validations.
* The deployed worker cannot authenticate app-only server reads. Infrastructure
	creates a system-assigned identity but the worker only forwards an optional
	static bearer token that Bicep never supplies. See
	`apps/agent-worker/src/main.py:46-50` and
	`infra/bicep/modules/agent-worker.bicep:166-172`.
* The default Container App scales to zero with no event or HTTP scaler. If
	started without a DSN, the worker silently selects `InMemoryControlPlane`,
	so leases, triggers, and checkpoints are not durable. See
	`infra/bicep/modules/agent-worker.bicep:53-58` and
	`apps/agent-worker/src/main.py:37-42`.
* The runtime does not execute a Microsoft Agent Framework workflow. Its
	`GraphWorkflow` is a local dictionary and loop, while the framework import
	is only an unused capability detector. See
	`apps/agent-worker/src/workflow.py:24-114` and `:117-123`.

### Major

* Snapshot reads can return unbounded tile payloads.
* Worker routes accept arbitrary patch IDs instead of enforcing an active
	agent assignment.
* The pending-trigger capacity check is vulnerable to concurrent distinct-key
	inserts.
* Trigger claim ignores agent assignment ownership and lifecycle state.
* Lease renewal only runs at node boundaries, allowing blocking HTTP or model
	operations to outlive the lease.
* Foundry requests omit the approved redacted tool context.
* `AGENT_FEATURE_MODEL_FREE_ENABLED` is logged but does not prevent the worker
	from claiming or processing work.
* No worker-aware multi-replica fixture proves app-role authentication,
	worker loss, lease loss, or checkpoint resume.
* Deployment accepts any database DSN without binding or validating the
	`agent_control_worker` role.
* The deployment emits `agent_control_plane`, while the schema and worker SQL
	use `agent_control`.
* Worker telemetry remains stdout JSON; it does not export Azure Monitor
	traces or metrics despite receiving the connection string.
* Foundry provider access uses an API key, without the required managed
	identity token path or RBAC binding.
* `agent-framework>=0.1.0` is unpinned despite the selected runtime being a
	security and recovery dependency.
* The required worker pytest suite was not run, and one recovery test has an
	undefined variable that will fail collection or execution.

### Minor

* Route tests bypass app-only middleware, startup registration, audit behavior,
	assigned-patch constraints, and snapshot response bounds.
* Restricted-role denial coverage asserts only a `patches` write, not the
	complete canonical quilt, tile, ownership, and authorization boundary.
* Worker setup documentation omits installation of the declared development
	test dependencies.

## Per-Phase Validation

| Phase | Status | Evidence |
|-------|--------|----------|
| 1. Server identity and reads | Failed | `.copilot-tracking/reviews/rpi/2026-08-07/fantome-resident-agent-implementation-plan-001-validation.md` |
| 2. Control plane and triggers | Partial | `.copilot-tracking/reviews/rpi/2026-08-07/fantome-resident-agent-implementation-plan-002-validation.md` |
| 3. Python worker MVP | Partial | `.copilot-tracking/reviews/rpi/2026-08-07/fantome-resident-agent-implementation-plan-003-validation.md` |
| 4. Deployment and telemetry | Partial | `.copilot-tracking/reviews/rpi/2026-08-07/fantome-resident-agent-implementation-plan-004-validation.md` |
| 5. End-to-end validation | Partial | `.copilot-tracking/reviews/rpi/2026-08-07/fantome-resident-agent-implementation-plan-005-validation.md` |

## Implementation Quality

The quality review found 2 additional critical findings, 8 major findings, and
1 minor finding. Its evidence overlaps the synthesis above: it confirms the
scale-to-zero and in-memory fallback, absent managed-identity token flow,
non-framework execution path, missing assignment enforcement, insufficient
lease renewal, observability gap, and insufficient end-to-end coverage.

## Validation Commands

| Command | Status | Result |
|---------|--------|--------|
| `npm --prefix apps/server test` | Passed | 39 files passed, 1 skipped; 241 tests passed, 1 skipped |
| `npm --prefix apps/server run build` | Passed | TypeScript compilation succeeded |
| `az bicep build --file infra/bicep/main.bicep` | Passed | Bicep compilation succeeded |
| `docker build -f apps/agent-worker/Dockerfile apps/agent-worker` | Passed | Worker image built successfully |
| `python3 -m pytest apps/agent-worker/tests` | Blocked | Python exists but `pytest` is not installed |
| `npx playwright test --config playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts` | Passed | 1 test passed |

## Missing Work And Deviations

* The changes log and plan completion markers overstate the available evidence:
	Phase 3 and Phase 5 remain incomplete until pytest runs and restart recovery
	is implemented and tested.
* The original plan's activation path requires managed-identity app-token
	acquisition, restricted database identity binding, and worker-aware recovery
	testing. Those are not deferred operational details; they are required to
	satisfy the MVP success criteria.

## Follow-Up Recommendations

### Required Rework

* Register the internal worker router during application initialization, then
	add a live app-token integration test for immediate availability.
* Implement a durable trigger ownership and reclaim policy, persist
	intermediate checkpoints, and restore the latest checkpoint before resumed
	execution.
* Replace the local graph loop with the approved Microsoft Agent Framework
	workflow API and test that integration with a fake provider.
* Acquire and refresh app-only tokens through the worker managed identity,
	provision its `agent.runtime` app role, and enable the server feature gate
	through an explicit deployment parameter.
* Require a durable restricted control-plane DSN in deployed environments;
	align the schema name with `agent_control`; remove the production in-memory
	fallback.
* Enforce model-free runtime gating and add two-worker, PostgreSQL-backed
	restart and lease-loss coverage with app-role tokens.

### Deferred Scope

* Confirm Entra tenant and app-role topology, initial trigger policy, operating
	limits, and ACA ingress/role topology as recorded in the planning log.
* Decide the recovered run identity contract and the minimal approved redacted
	tool context for initial structured proposals.

## Overall Status

**Needs Rework.** Critical deployment, authentication, route availability,
workflow-runtime, and recovery gaps block activation. Re-run the full command
set, including `python -m pytest apps/agent-worker/tests`, after the required
rework and environment setup are complete.
