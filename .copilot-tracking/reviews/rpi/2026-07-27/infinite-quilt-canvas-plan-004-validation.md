---
title: Infinite Quilt Canvas Phase 004 Validation
description: Validation of Phase 4 implementation coverage against the plan, changes log, planning log, and primary research
ms.date: 2026-07-27
ms.topic: reference
---

## Validation Status

**Status:** Partial

Phase 4 implements and directly tests the patch-scoped placement transaction,
real PostgreSQL concurrency behavior, authoritative-row recovery, and retention
orchestration. The transaction is not connected to a production mutation handler,
membership is treated as mutation permission without a persisted capability grant,
and patch reconstruction does not read its cursor and tile state from one database
snapshot.

## Scope

* Plan: `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md`
* Planning log: `.copilot-tracking/plans/logs/2026-07-27/infinite-quilt-canvas-log.md`
* Changes log: `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md`
* Research: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* Phase: 4
* Inspection areas: patch transaction, authentication gate, PostgreSQL concurrency, recovery, retention, and tests

## Phase Requirements

Phase 4 contains four checklist steps in the implementation plan:

* Move placement correctness into one patch-scoped transaction
* Add real PostgreSQL concurrency coverage
* Establish reconstructable recovery and retention
* Run the focused PostgreSQL, retention, lint, and build validations

The detailed plan requires server-side canonicalization, complete footprint and
collision-halo derivation, deterministic patch locks, in-transaction authorization
and revision checks, nearby authoritative reads, atomic tile, spatial-reference, and
history writes, and publication only after commit. Evidence:
`.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:206-229`.

The research also requires a stable authenticated principal, mutation permission for
every intersected patch, a role or capability-aware ACL, and recovery where current
state remains reconstructable at every supported retention age. Evidence:
`.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md:177-193`,
`.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md:350-367`, and
`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:141-175`.

## Plan-to-Change Comparison

| Plan item | Changes log claim | Verified status |
|-----------|-------------------|-----------------|
| 4.1 Patch-scoped placement transaction | Repository adds principal-only placement, sorted locks, in-transaction validation, reconstruction, snapshots, and retention; server keeps legacy mutation behind a compatibility gate | Partial. Repository behavior exists, but no production handler calls it |
| 4.2 Real PostgreSQL concurrency | New PostgreSQL suite covers seam serialization, lock order, idempotency, distant writes, and atomic rejection | Complete for placement behavior; all five tests passed against PostgreSQL 18 |
| 4.3 Recovery and retention | Recovery suite proves reconstruction across operation and snapshot ages; retention prunes audit data without using it as current state | Partial. Retention-age behavior passes, but cursor and tile reads are not transactionally consistent during concurrent mutation |
| 4.4 Correctness validation | Focused tests, server lint, and server build pass | Complete in this session after starting the repository PostgreSQL service |

All Phase 4 implementation files discovered during source inspection are represented
in the changes log. No related unlisted implementation file was found.

## Verified File Evidence

### Patch Transaction

* The repository canonicalizes the requested anchor, derives geometry and halo patch
	sets, sorts patch identifiers, and locks those rows with `FOR UPDATE` inside one
	transaction. Evidence: `apps/server/src/db/repository.ts:703-791`.
* Permission, lifecycle, expected revision, nearby-tile reads, and periodic geometry
	validation occur after locks are acquired. Evidence:
	`apps/server/src/db/repository.ts:793-829`.
* Tile, spatial-reference, patch-operation, and patch-revision writes use the same
	transaction. Evidence: `apps/server/src/db/repository.ts:831-905`.
* Operation retries are serialized by an operation advisory lock and return the
	existing durable result. Evidence: `apps/server/src/db/repository.ts:714-740`.

### Authentication Gate

* Protocol-v2 initialization loads no external identity, resolves no principal, and
	advertises `mutationEnabled: false`. Evidence: `apps/server/src/index.ts:1665-1684`.
* Both placement and removal reject protocol-v2 requests. Evidence:
	`apps/server/src/index.ts:1751-1758` and `apps/server/src/index.ts:1864-1867`.
* `persistQuiltTilePlacement` is referenced only by its own module and PostgreSQL
	integration tests; no production handler invokes it. Evidence:
	`apps/server/src/db/repository.ts:703-916`,
	`apps/server/src/db/repository.postgres.integration.test.ts:4-30`, and
	`apps/server/src/db/recovery.postgres.integration.test.ts:4-82`.

### PostgreSQL Concurrency

* The test helper creates isolated databases on a loopback PostgreSQL server, applies
	real migrations, and exposes one-connection pools for independent blockers and
	observations. Evidence: `apps/server/src/test/postgresTestDatabase.ts:19-57`.
* Tests cover one seam-conflict winner, reversed lock order, idempotent durable row
	counts, progress under an unrelated row lock, and zero partial rows after rejected
	writes. Evidence:
	`apps/server/src/db/repository.postgres.integration.test.ts:86-192`.

### Recovery and Retention

* Patch reconstruction uses authoritative tile rows and spatial references rather than
	operation replay or snapshots. Evidence: `apps/server/src/db/repository.ts:1399-1412`.
* The retention job creates current patch snapshots before pruning operations and old
	snapshots, while authoritative rows remain untouched. Evidence:
	`apps/server/src/db/snapshots.ts:24-28`, `apps/server/src/jobs/retention.ts:8-21`, and
	`apps/server/src/db/repository.ts:1585-1644`.
* PostgreSQL tests verify active and quiet patch reconstruction after operation and
	snapshot expiry. Evidence:
	`apps/server/src/db/recovery.postgres.integration.test.ts:94-130`.

### Executed Validation

* `npm run test:server -- src/db/repository.postgres.integration.test.ts src/db/recovery.postgres.integration.test.ts src/jobs/retention.test.ts`: passed, 3 files and 10 tests
* `npm run lint:server`: passed
* `npm run build:server`: passed

## Findings

### Critical

No Critical findings.

### Major

#### MAJ-01 Patch-scoped mutation has no production entry point

The implemented transaction is test-only. Protocol v2 explicitly disables mutation,
and its placement and removal handlers reject requests before the repository path can
run. This is a fail-closed response to the unresolved identity-provider dependency,
but it does not satisfy Step 4.1's planned thin authenticated request handler and
post-commit publication path. The planning log records authenticated principal
integration as release-blocking follow-on work, while the Phase 4 checklist is marked
complete. Evidence: `apps/server/src/index.ts:1665-1684`,
`apps/server/src/index.ts:1751-1758`, `apps/server/src/index.ts:1864-1867`, and
`.copilot-tracking/plans/logs/2026-07-27/infinite-quilt-canvas-log.md:91-93`.

Recommendation: keep mutation disabled until provider assertions are validated and
mapped server-side, then route protocol-v2 placement and removal through authenticated
patch transactions and publish only their committed events.

#### MAJ-02 Membership is treated as unconditional mutation permission

The transaction selects only membership patch IDs and authorizes any member. It does
not select or evaluate membership role or a delegated mutation capability. The schema
stores only `member` and `owner`, while the approved contract says members can mutate
only when the patch ACL grants that capability. A future read-only member would gain
write access if runtime mutation were enabled. Evidence:
`apps/server/src/db/repository.ts:793-809`, `apps/server/src/db/types.ts:13-13`, and
`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:160-175`.

Recommendation: persist explicit capabilities or define capability-bearing roles,
select them under the patch lock, and test allowed and denied member mutations for
every intersected patch.

#### MAJ-03 Recovery cursor and tile state are not read atomically

`reconstructPatchState` reads patch revision and authoritative tiles in two separate
autocommit statements. Under PostgreSQL `READ COMMITTED`, a placement can commit
between those statements, yielding an older `opSeq` paired with newer tile state.
Retention-age reconstruction is covered, but no test races reconstruction with a
concurrent mutation. This weakens the scoped cursor contract used for reconnect and
can cause a snapshot to describe state beyond its cursor. Evidence:
`apps/server/src/db/repository.ts:1399-1412`,
`apps/server/src/db/repository.ts:1499-1566`, and
`apps/server/src/db/recovery.postgres.integration.test.ts:94-130`.

Recommendation: read revision and tile rows in one transaction with a consistent
snapshot or lock the patch row while constructing the snapshot, then add a concurrent
placement-versus-snapshot PostgreSQL test.

### Minor

No Minor findings.

## Coverage Assessment

Phase 4 coverage is **Partial**.

The repository-level placement algorithm and retention-age recovery behavior are
substantially implemented and validated with real PostgreSQL. All focused executable
checks passed. The phase cannot be considered passed because the transaction is not
reachable from production, the persisted ACL cannot distinguish a member with mutation
permission from one without it, and concurrent snapshot consistency is unverified and
currently vulnerable to a mixed cursor/state read.

| Area | Assessment |
|------|------------|
| Patch transaction | Implemented and tested at repository level |
| Authentication gate | Securely fail-closed, but runtime integration is incomplete |
| Real PostgreSQL concurrency | Covered and passing for placement |
| Recovery | Correct across retention ages; concurrent snapshot consistency is incomplete |
| Retention | Implemented, wired, and passing focused tests |
| Tests and static checks | Focused suite, lint, and build pass |

## Clarifying Questions

* Should Phase 4 be considered complete at the repository boundary despite Step 4.1
	naming authenticated request handling and post-commit publication, or should its
	checklist remain open until the identity-provider release gate is resolved?
* Which persisted role or capability grants patch members mutation access? The current
	schema and ADR do not encode that distinction.

## Recommended Next Validations

* [ ] Add and execute an authenticated protocol-v2 placement and removal integration
	suite after external principal mapping is wired
* [ ] Add PostgreSQL tests for member capability allow and deny cases, including a
	cross-patch footprint with mixed permissions
* [ ] Add a concurrent reconstruction test that proves cursor and authoritative tile
	state come from one database snapshot
* [ ] Validate post-commit scoped publication and prove rejected or rolled-back
	transactions publish no event
* [ ] Revalidate the full server suite after the three Major findings are resolved
