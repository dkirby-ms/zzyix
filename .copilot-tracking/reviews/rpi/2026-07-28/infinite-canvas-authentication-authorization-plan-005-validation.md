---
title: Infinite Canvas Authentication and Authorization Phase 005 Validation
description: Current evidence-based validation of implementation phase 5
ms.date: 2026-07-29
ms.topic: reference
---

## Executive Result

* Phase: 5, Claims and Ownership Lifecycle
* Status: Partial
* Coverage: 4 of 4 steps materially implemented, 0 of 4 fully satisfied
* Critical findings: 1
* Major findings: 3
* Minor findings: 0
* Commit: `4bcefa7 feat(auth): add authenticated ownership and mutation lifecycle`
* Branch: `infinite-canvas`

The stale validation reported an unstarted phase. Current code contains the Phase 5
schema, transactions, protected routes, lifecycle helpers, restricted recovery
command, and focused tests. Claims, transfers, abandonment, deletion request,
in-window recovery, and fail-closed deletion checks are materially implemented.

Phase 5 does not pass. Approved deletion completion is not runnable, operation-ID
replays are not bound to their original actor and payload, and required test coverage
is incomplete. Restricted operational recovery is configured but not provisioned by
repository infrastructure.

## Validation Sources

* Plan: `.copilot-tracking/plans/2026-07-28/infinite-canvas-authentication-authorization-plan.instructions.md`
* Planning log: `.copilot-tracking/plans/logs/2026-07-28/infinite-canvas-authentication-authorization-log.md`
* Changes: `.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md`
* Research: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md:302-378`
* Current implementation under `apps/server/src/`
* Deployment workflow: `.github/workflows/cd.yml`

## Git State

Validation used branch `infinite-canvas` at commit `4bcefa7`. Phase 5 implementation
files were clean. Unrelated edits existed in the overall plan review and Phase 2
validation documents; they were not used as implementation evidence or modified.

## Plan-to-Change Comparison

| Plan item | Current evidence | Result |
|-----------|------------------|--------|
| Step 5.1 atomic claims and quotas | Claim transaction checks active human status, patch state, persisted policy, quotas, and existing quilt ownership; updates ownership and membership and audits at `apps/server/src/db/repository.ts:226-373`. Protected route and PostgreSQL tests exist. Replay binding and required quota tests are incomplete. | Partial |
| Step 5.2 transfer and abandonment | Create, accept, cancel, expire, and abandon transactions exist at `apps/server/src/db/repository.ts:431-697`; protected routes and transaction tests exist. Replay identity and HTTP contracts are untested. | Partial |
| Step 5.3 deletion and recovery | Request, recover, and complete transactions exist at `apps/server/src/db/repository.ts:702-817`; protected routes and restricted workflow exist. The deletion job cannot discover or complete approved due accounts. | Partial |
| Step 5.4 validation | All named test files exist. One focused run reported 52 passing server tests before terminal interference; editor diagnostics found no errors in core Phase 5 files. Required behavioral cases remain absent, and a clean final lint/build transcript was not obtained. | Partial |

## Verified Evidence

### Claims and quotas

* `apps/server/src/db/schema.ts:219-275` persists claim policy, globally unique claim
  operation IDs, principal attempt timestamps, outcomes, and reason codes.
* `apps/server/src/db/repository.ts:236-325` locks operation, principal, and patch,
  then checks active human status, unclaimed state, policy, recent attempts, recent
  successes, and active ownership in the target quilt.
* `apps/server/src/db/repository.ts:327-369` records the attempt, updates owner and
  membership atomically, and writes an authorization audit event.
* `apps/server/src/db/ownership.postgres.integration.test.ts:42-135` covers one
  concurrent winner, audit, same-operation replay, disabled policy, three attempts,
  and one active patch per quilt.

### Transfer and abandonment

* `apps/server/src/db/repository.ts:431-489` creates a seven-day pending offer without
  changing ownership and requires an active human recipient and current owner.
* `apps/server/src/db/repository.ts:500-589` requires the active intended recipient,
  an unexpired offer, unchanged sender ownership, and recipient quota before changing
  ownership and membership atomically.
* `apps/server/src/db/repository.ts:591-697` implements audited cancellation, expiry,
  and abandonment.
* `apps/server/src/db/ownership.postgres.integration.test.ts:137-225` verifies offer,
  acceptance, cancellation, expiry, unchanged ownership before acceptance, and
  abandonment state and membership.

### Deletion and operational recovery

* `apps/server/src/db/repository.ts:702-817` implements immediate deletion pending,
  30-day recovery, ownership and retention gates, mapping deletion, profile clearing,
  deleted status, and lifecycle audit.
* `apps/server/src/operations/principalRecovery.ts:4-44` requires operator ID,
  support ticket, and reason and exposes only recovery or transfer cancellation.
* `.github/workflows/cd.yml:37-111` uses an `operational-recovery` environment,
  GitHub OIDC Azure login, immutable `github.actor_id`, required ticket and reason,
  and a configured Container Apps recovery job.
* `apps/server/src/db/principal.postgres.integration.test.ts:33-62` covers immediate
  disablement, in-window recovery, ownership and retention denial, mapping retention
  on denial, and external-subject exclusion from general audit JSON.

## Findings

### Critical

#### V005-01 Approved due-account deletion completion is not runnable

`apps/server/src/jobs/principalDeletion.ts:4-10` accepts one supplied principal ID and
always calls completion with `retentionApproved: false`. It does not enumerate due
deletion-pending principals or read the approval values published by CD.
`apps/server/package.json:6-19` has no principal-deletion job command. The workflow
passes `AUTH_RETENTION_POLICY_APPROVED` and
`AUTH_DELETION_COMPLETION_POLICY_APPROVED`, but no Phase 5 job consumes them.

Deletion can be requested and recovered but cannot complete after ownership resolution
and approval. This is missing Step 5.3 functionality, separate from intentional
fail-closed behavior while approval remains absent.

### Major

#### V005-02 Idempotency replay is not bound to actor and payload

Claim replay returns a stored outcome without checking principal or patch at
`apps/server/src/db/repository.ts:236-250`. Transfer creation returns an existing
transfer ID without checking sender, recipient, or patch at lines 437-446. Accept,
cancel, abandon, and deletion recovery use `findCompletedAudit`, which matches only
operation ID and event type at lines 389-405.

Reusing an operation ID with another actor or target can report success for an
operation never applied to that target, and transfer creation can return the previous
transfer ID. UUID unpredictability reduces exposure but cannot replace authorization
and correctness. Replay must compare a canonical command fingerprint containing the
command type, authenticated actor, and target payload.

#### V005-03 Required behavior lacks focused tests

No test proves a successful claim followed by a second cross-quilt claim within 24
hours, inactive or non-human claim denial, mismatched operation-ID reuse, successful
deletion completion, or pre-deadline deletion denial. No test references any route
under `/ownership/*` or `/account/deletion*`. The changes log therefore overstates
safe lifecycle HTTP and complete focused validation.

#### V005-04 Operational recovery is not provisioned end to end

The workflow correctly gates recovery through a GitHub Environment and Azure OIDC,
but only starts `RECOVERY_JOB_NAME`. No Bicep resource provisions that job or its
narrow role assignment. The planning log retains WI-10 as blocking work for the job,
Azure RBAC, and environment reviewers. Step 5.3 lacks end-to-end deployment evidence.

### Minor

No Minor findings.

## Validation Execution

* One focused Phase 5 Vitest selection reported 52 passing server tests before queued
  terminal commands switched workspace and interrupted the process.
* Later reruns were inconclusive because previously queued commands interleaved and
  exited with code 130 before a final target-suite summary.
* Editor diagnostics found no errors in `apps/server/src/db/repository.ts`,
  `apps/server/src/index.ts`, `apps/server/src/jobs/principalDeletion.ts`, or
  `apps/server/src/operations/principalRecovery.ts`.
* A server TypeScript build completed during the initial batch, but interleaving
  prevents claiming a clean final combined exit status.

Terminal interference is a validation limitation, not an implementation finding.

## Coverage Assessment

* Step 5.1: Partial. Core transaction and limits exist; replay binding and required
  eligibility and quota tests are incomplete.
* Step 5.2: Partial. Transfer, expiry, cancellation, and abandonment exist; replay
  binding and HTTP tests are incomplete.
* Step 5.3: Partial. Lifecycle and recovery code exist; approved due-account completion
  and provisioned recovery infrastructure are absent.
* Step 5.4: Partial. Named tests exist and substantial tests pass, but the required
  matrix and a clean final command transcript are incomplete.

Status is **Partial** because one Critical missing completion path and three Major
correctness, coverage, and deployment gaps prevent acceptance.

## Clarifying Questions

* What component should enumerate due deletion-pending principals and invoke deletion
  completion?
* Which approved value should authorize completion, and must both retention and
  unresolved-ownership policy approvals be required?
* Has the recovery job, GitHub Environment, and narrow Azure RBAC role been provisioned
  outside this repository despite WI-10 remaining open?

## Recommended Next Validations

* Add mismatched replay tests and canonical actor and payload binding.
* Add successful and pre-deadline deletion completion tests, including mapping,
  profile, attribution, and audit assertions.
* Add cross-quilt 24-hour claim and inactive-principal tests.
* Add authenticated HTTP tests for every ownership and deletion route.
* Validate a runnable due-account deletion job with approval-gate wiring.
* Validate the provisioned recovery job, environment reviewers, OIDC identity, and
  least-privilege role assignment in staging.
* Rerun focused tests, `npm run lint:server`, and `npm run build:server` in a fresh
  terminal without queued commands.
