<!-- markdownlint-disable-file -->
# Implementation Review: Fantome Resident Agent Implementation

## Review Metadata

* Date: 2026-08-08
* Related plan: `.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md`
* Research: `.copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md`
* Review method: Fresh phase validation, implementation-quality review, executable checks, and comparison with prior review findings.
* Status: Complete

## Summary

The implementation is substantial and closes several findings from the prior
review, including startup route registration, app-role route coverage,
durable-DSN startup enforcement, production framework-path selection, stale
trigger reclaim, checkpoint compare-and-set, managed-identity token code, and
safe default feature gates. It remains **Needs Rework** for activation.

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Major    | 12 |
| Minor    | 5 |

The critical findings are missing deployed identity/RBAC bindings and missing
real worker-process restart evidence. Major findings cover authorization scope,
queue enforcement, checkpoint fidelity, provider context, runtime
verification, database-role binding, worker telemetry export, worker
PostgreSQL coverage, worker-inclusive e2e coverage, issuer/audience
separation, durable worker-read auditing, and unresolved activation limits.

## Per-Phase Validation

| Phase | Status | Evidence |
|-------|--------|----------|
| 1. Server identity and reads | Partial | [Phase 1 validation](../rpi/2026-08-08/fantome-resident-agent-implementation-plan-001-validation.md) verifies startup registration, app-role auth, principal mapping, and bounds, but finds quilt-wide rather than patch-scoped assignment and no durable worker-read audit. |
| 2. Control plane and triggers | Partial | [Phase 2 validation](../rpi/2026-08-08/fantome-resident-agent-implementation-plan-002-validation.md) verifies lease/CAS/deduplication and reclaim paths, but finds worker assignment authority and requeue queue-bound bypass. |
| 3. Python worker MVP | Partial | [Phase 3 validation](../rpi/2026-08-08/fantome-resident-agent-implementation-plan-003-validation.md) verifies the production adapter by inspection, but finds incomplete checkpoint state, omitted Foundry context, and no real framework runtime evidence. |
| 4. Deployment and telemetry | Partial | [Phase 4 validation](../rpi/2026-08-08/fantome-resident-agent-implementation-plan-004-validation.md) confirms imperative CD deployment, but finds missing app-role/RBAC assignment, an opaque DSN, and no worker telemetry export. |
| 5. End-to-end validation | Partial | [Phase 5 validation](../rpi/2026-08-08/fantome-resident-agent-implementation-plan-005-validation.md) verifies focused lower-level coverage, but finds no real worker restart, no executed worker PostgreSQL test, no worker-inclusive multi-replica e2e, and no full worker pytest run. |

## Critical Findings

### C1: Deployed identity permissions are missing

The CD step creates the worker system identity, but neither CD nor Bicep
assigns the protected server `agent.runtime` app role or Foundry RBAC. The
manual runbook does not constitute deployment evidence. See
[cd.yml](../../../.github/workflows/cd.yml#L814) and
[fantome-agent-entra-setup.md](../../../docs/fantome-agent-entra-setup.md#L172-L194).

### C2: Durable process-level restart recovery is unverified

The restart-named test uses an in-memory control plane and calls `process_once`
in one process. No fixture starts, terminates, and restarts a production worker
against PostgreSQL. See
[test_supervisor.py](../../../apps/agent-worker/tests/test_supervisor.py#L231-L259).

## Major Findings

* Assignments are quilt-scoped rather than patch-scoped, so an assigned agent
	can read sibling patches. See
	[0012_agent_control_plane.sql](../../../apps/server/migrations/0012_agent_control_plane.sql#L4-L21).
* The worker role can mutate assignments and lifecycle-control rows, while
	lower-level claim/run operations do not independently enforce active
	assignment ownership. See
	[0012_agent_control_plane.sql](../../../apps/server/migrations/0012_agent_control_plane.sql#L256-L264).
* Requeue updates bypass the pending-trigger capacity trigger. See
	[control_plane.py](../../../apps/agent-worker/src/control_plane.py#L510-L519).
* Intermediate checkpoints omit tool outputs and proposal state, so resumed
	workflow suffixes can run with empty context. See
	[checkpoints.py](../../../apps/agent-worker/src/checkpoints.py#L8-L18).
* Foundry payload construction measures but does not send the validated
	`tool_context`. See
	[gateway.py](../../../apps/agent-worker/src/gateway.py#L114-L123).
* The pinned Agent Framework production path has no runtime execution evidence;
	host pytest and `agent_framework` are unavailable. See
	[workflow.py](../../../apps/agent-worker/src/workflow.py#L215-L242).
* The deployed DSN is opaque and is not proven to authenticate as
	`agent_control_worker`. See
	[cd.yml](../../../.github/workflows/cd.yml#L744-L794).
* Worker telemetry does not configure an Azure Monitor/OpenTelemetry exporter.
	See [telemetry.py](../../../apps/agent-worker/src/telemetry.py#L10-L31).
* Worker PostgreSQL contention/recovery tests were not executed, and the
	multi-replica Playwright harness starts no worker. See
	[test_control_plane_postgres.py](../../../apps/agent-worker/tests/test_control_plane_postgres.py#L20-L132).
* Agent issuer/audience settings can fall back to human authentication
	settings, weakening trust-boundary separation. See
	[config.ts](../../../apps/server/src/auth/config.ts#L71-L79).
* Durable worker-read authorization audit records are not implemented or
	evidenced; telemetry alone is not a durable audit substitute. See
	[agentReads.ts](../../../apps/server/src/routes/agentReads.ts#L89-L157).

## Minor Findings

* Explicit overflow tests for context, snapshots, and serialized responses are
	missing.
* Lease-loss coverage does not exercise an in-flight blocked HTTP or provider
	call.
* PostgreSQL tests do not directly cover requeue-at-capacity, assignment
	ownership, or competing lease acquisition.
* The worker telemetry export and gate paths lack focused tests.
* The ignored local environment file contains live-looking credentials that
  require rotation and removal as operational security hygiene.

## Implementation Quality

The detailed quality assessment is recorded in
[fantome-resident-agent-implementation-quality.md](fantome-resident-agent-implementation-quality.md).
It confirms the findings above and records the verified strengths. The prior
review's findings about lazy route registration, production in-memory fallback,
static worker bearer/API-key authentication, and the production local graph
path are closed by the current changes or focused evidence.

## Validation Commands

| Command | Status | Result |
|---------|--------|--------|
| `npm --prefix apps/server test` | Passed | 40 files passed, 1 skipped; 247 tests passed, 1 skipped in the current review. |
| `npm --prefix apps/server run build` | Passed | TypeScript compilation succeeded. |
| `az bicep build --file infra/bicep/main.bicep` | Passed | Bicep compilation succeeded. |
| `az bicep build-params --file infra/bicep/main.bicepparam` | Passed | Parameter compilation succeeded. |
| `python3 -m compileall apps/agent-worker/src apps/agent-worker/tests` | Passed | Worker source and tests compiled. |
| `docker build -f apps/agent-worker/Dockerfile apps/agent-worker` | Historical pass | The changes log records a successful build; no fresh Docker build was completed in this review. |
| `bash -n scripts/bootstrap-cd-environment.sh` | Passed | Deployment script syntax is valid. |
| `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml'))"` | Passed | CD workflow parsed successfully. |
| `git diff --check` | Passed | No whitespace errors in the worktree diff. |
| `python3 -m pytest apps/agent-worker/tests` | Blocked | Host Python reports `No module named pytest`. |
| `get_errors` on touched server and worker files | Passed | No language-service errors reported. |

## Missing Work And Deviations

* Phase 1 is not complete until the assignment boundary is resolved and
	worker-read audit semantics are implemented or explicitly accepted.
* Phase 2 is not complete until worker control-plane authority and requeue
	queue bounds are enforced.
* Phase 3 is not complete until checkpoint recovery preserves or deliberately
	replays required state, provider context is included, and the real pinned
	framework path is executed.
* Phase 4 is not complete until identity/RBAC, restricted DSN binding, and
	worker telemetry export are deployed and verified.
* Phase 5 is not complete until worker pytest, worker PostgreSQL integration,
	and real process-level restart evidence are available. The current e2e
	harness does not include a worker.

## Follow-Up Work

### Required Rework

* Automate or externally attest the server app-role and Foundry RBAC bindings
	for the deployed worker identity.
* Bind and verify the worker DSN as `agent_control_worker`, including canonical
	write denial.
* Add a real two-process PostgreSQL worker restart fixture.
* Fix checkpoint state/replay semantics and include bounded redacted tool
	context in governed provider payloads.
* Restrict worker control-plane grants and enforce assignment ownership;
	enforce queue capacity on requeue transitions.
* Resolve patch-versus-quilt authorization and add sibling-patch denial tests.
* Add a worker telemetry exporter and verify ingestion/redaction.
* Install worker test dependencies and run the full pytest suite.
* Rotate and remove the live-looking credentials present in the ignored local
	`scripts/gh-vars.env`; this file is not tracked, but its contents should be
	treated as exposed operational material.

### Deferred From Scope Or Environment

* Entra tenant topology, production operating limits, trigger policy, and
	platform ownership of RBAC remain deployment decisions recorded in the
	planning log.
* Host dependency availability blocked worker pytest and the worker PostgreSQL
	test in this review; this is evidence still required, not a product defect
	by itself.

## Overall Status

**Needs Rework.** The implementation is suitable for continued development and
focused validation, but the missing worker deployment and identity bindings,
process-level recovery gap, and major authorization, durability, and
observability findings block production activation.
