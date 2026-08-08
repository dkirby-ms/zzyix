---
title: Fantome Resident Agent Phase 2 Validation
description: Revalidation of the Phase 2 control plane and trigger semantics against the current workspace.
ms.date: 2026-08-07
ms.topic: assessment
---

## Status

**Partial.** The current workspace contains the planned control-plane schema,
restricted role, lease compare-and-set behavior, active-trigger deduplication,
stale-claim metadata, and checkpoint compare-and-set implementation. The
Phase 2 through-line is not complete because PostgreSQL crash recovery does not
resume a run that remains `running`, and requeued triggers bypass the
configured pending-queue limit. PostgreSQL coverage also does not exercise the
new recovery paths or the complete canonical write boundary.

## Scope And Method

This validation re-read the Phase 2 plan and details, changes log, research,
planning log, and current migration, worker control-plane, supervisor, workflow,
and PostgreSQL test files. It compared each Phase 2 checklist item and success
criterion with current source evidence. No implementation, plan, research, or
changes-log file was modified.

## Requirement Coverage

| Requirement | Evidence | Result |
| --- | --- | --- |
| Dedicated control-plane schema and restricted role | [Migration 0012](../../../../apps/server/migrations/0012_agent_control_plane.sql#L1) creates assignments, runs, leases, checkpoints, triggers, outcomes, metadata, audit, and `agent_control_worker`; [migration 0013](../../../../apps/server/migrations/0013_agent_control_recovery.sql#L56) grants sequence use. | Covered at SQL privilege level |
| One active lease per quilt | [Lease primary key and expiry takeover](../../../../apps/server/migrations/0012_agent_control_plane.sql#L59) allow one row per quilt and replace it only after expiry; [worker adapter](../../../../apps/agent-worker/src/control_plane.py#L337) uses the same compare-and-set shape. | Covered; PostgreSQL concurrency race is not directly tested |
| Renewal bound to owner and run | [Renewal query](../../../../apps/agent-worker/src/control_plane.py#L370) requires quilt, run, owner, generation, and an unexpired lease; the [PostgreSQL test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L138) verifies wrong-owner failure and matching-owner success. | Covered |
| Trigger identity and active deduplication | [Partial unique index](../../../../apps/server/migrations/0012_agent_control_plane.sql#L137) prevents duplicate pending or claimed keys; the [test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L165) performs concurrent same-key inserts. | Covered for active keys |
| Configurable and bounded pending queue | [Migration 0013](../../../../apps/server/migrations/0013_agent_control_recovery.sql#L24) serializes insert checks with `FOR UPDATE`, fixing concurrent distinct inserts on the insert path. However, [requeue](../../../../apps/agent-worker/src/control_plane.py#L510) changes `claimed` to `pending` with `UPDATE`, while the limit trigger is [insert-only](../../../../apps/server/migrations/0012_agent_control_plane.sql#L228). | Partial; requeue can exceed the bound |
| Stale claim reclaim and requeue | [Claim query](../../../../apps/agent-worker/src/control_plane.py#L262) records claimant and reclaims claims after the configured timeout; [requeue](../../../../apps/agent-worker/src/control_plane.py#L510) clears claim metadata. | Implemented in adapter; no PostgreSQL recovery test |
| Versioned checkpoint CAS and pending IDs | [Checkpoint schema](../../../../apps/server/migrations/0012_agent_control_plane.sql#L81) stores version and pending IDs; [adapter CAS](../../../../apps/agent-worker/src/control_plane.py#L448) requires the expected version; [test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L242) verifies the stale write is rejected. | Covered for same-run CAS |
| Pending trigger checkpoint before execution | [Test graph](../../../../apps/agent-worker/src/workflow.py#L104) and [framework graph](../../../../apps/agent-worker/src/workflow.py#L209) callback an initial `load_context` checkpoint before the first tool node. | Covered in worker code; not PostgreSQL-backed |
| Cross-run recovery after worker loss | [Supervisor](../../../../apps/agent-worker/src/supervisor.py#L62) passes the trigger run ID, but [Postgres start/resume](../../../../apps/agent-worker/src/control_plane.py#L319) excludes `running` runs. A crash leaves the old run `running`, so the retry creates a new run; [checkpoint loading](../../../../apps/agent-worker/src/control_plane.py#L399) then searches only that new run. | Failed |

## Changes Log Comparison

The changes log claims migration `0012`, integration coverage for lease
ownership, trigger deduplication, checkpoint CAS, and restricted-role denial,
plus later recovery changes in migration `0013` and `control_plane.py`. The
claimed files exist and the current code contains the claimed recovery fields,
reclaim query, requeue method, and checkpoint callback.

The changes log overstates PostgreSQL recovery evidence. The dedicated
PostgreSQL test contains four cases: lease renewal, same-key deduplication and
sequential capacity, same-run checkpoint CAS, and one `patches` denial. It has
no stale-claim reclaim, requeue-bound, crashed-run resume, cross-run checkpoint,
or lease-acquisition race case. The worker tests provide in-memory recovery
coverage, but they do not validate the PostgreSQL adapter or migration behavior
([worker recovery tests](../../../../apps/agent-worker/tests/test_supervisor.py#L160)).

No unrelated current source file was treated as a Phase 2 implementation
change. Migration `0013` is a direct Phase 2 recovery follow-up even though the
changes log lists it among later rework.

## Findings

### Critical: PostgreSQL Crash Recovery Does Not Resume The Prior Run

The research requires recovery from the latest committed checkpoint, and Phase
2 requires durable run and checkpoint state. The PostgreSQL adapter does not
satisfy that scenario:

* [Claiming](../../../../apps/agent-worker/src/control_plane.py#L262) can reclaim a stale trigger and returns its existing `run_id`.
* [Start/resume](../../../../apps/agent-worker/src/control_plane.py#L319) resumes only runs whose status is `failed` or `cancelled`; a process killed after claiming leaves its run `running` and therefore starts a new run.
* [Supervisor loading](../../../../apps/agent-worker/src/supervisor.py#L81) loads the checkpoint using the resulting run ID, and [checkpoint loading](../../../../apps/agent-worker/src/control_plane.py#L399) filters by that run when one is supplied. The new run cannot see the old run's committed checkpoint.
* The [run schema](../../../../apps/server/migrations/0012_agent_control_plane.sql#L38) permits a `running` row with no end timestamp, so a crash leaves exactly the state that the resume query excludes.

The in-memory test passes because its `start_or_resume_run` resumes any known
run regardless of status ([test](../../../../apps/agent-worker/tests/test_supervisor.py#L160));
that behavior diverges from the PostgreSQL adapter. There is no PostgreSQL test
for a stale claimed trigger linked to a running prior run with a checkpoint.

### Major: Requeue Bypasses The Configured Pending Queue Bound

Migration `0013` correctly locks the singleton limit row before counting
pending rows for inserts ([`FOR UPDATE`](../../../../apps/server/migrations/0013_agent_control_recovery.sql#L34)).
That fixes the original concurrent-distinct-insert race on the insert path.
However, the trigger is created as `BEFORE INSERT` only
([migration 0012](../../../../apps/server/migrations/0012_agent_control_plane.sql#L228)),
while [requeue](../../../../apps/agent-worker/src/control_plane.py#L510)
performs an `UPDATE` from `claimed` to `pending` without checking the current
pending count or serializing against the limit row.

A full queue can therefore accept additional pending work through lease-loss or
lease-unavailable requeue, violating the Phase 2 success criterion that queue
limits are enforced. The current PostgreSQL test only fills the queue through
inserts ([test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L165))
and cannot detect this transition path.

### Minor: Restricted-Role Negative Evidence Covers Only One Canonical Table

The migration revokes DML privileges on all current `public` tables
([migration 0012](../../../../apps/server/migrations/0012_agent_control_plane.sql#L250)),
which is consistent with the required boundary. The only executable negative
assertion updates `patches` ([test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L289)).
There is no direct denial test for `quilts`, `tiles`, ownership, or
authorization tables. The planning log records this same gap as WI-07
([planning log](../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L104)).
This is a validation gap rather than evidence that the current grants permit
those writes.

### Minor: PostgreSQL Test Does Not Prove The New Recovery And Distinct-Key Paths

The test name says it enforces a bounded queue, but its concurrent portion uses
the same deduplication key, where the partial unique index is the deciding
mechanism ([test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L165)).
It does not concurrently insert distinct keys, reclaim a stale claim, requeue at
capacity, or take over a lease while another worker is active. The SQL locking
change is a credible implementation fix for concurrent inserts, but the
required discriminating PostgreSQL evidence is absent.

## Unmet Requirements

* PostgreSQL crash recovery must retain or locate the prior running run and load its latest checkpoint after stale-trigger reclaim.
* Pending queue limits must apply to `claimed` to `pending` requeue transitions, not only inserts.
* PostgreSQL tests must cover stale reclaim, cross-run checkpoint recovery, requeue-at-capacity, and concurrent distinct trigger keys.
* Restricted-role tests should cover representative quilt, tile, ownership, and authorization writes.

The planning log's unresolved producer/coalescing policy and production limits
remain activation prerequisites, but they are not counted as Phase 2 defects;
they are explicitly recorded as DR-02 and DR-03 ([planning log](../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L14)).

## Executed Validation

| Check | Result |
| --- | --- |
| Source and artifact comparison | Completed against current workspace |
| `npm --prefix apps/server test -- src/db/agentControlPlane.postgres.integration.test.ts` | Blocked: the invoked environment reported `python` is unavailable before Vitest ran |
| Direct Vitest invocation | Blocked/interrupted by the workspace test environment; no reliable test result was produced |
| Worker recovery tests | Read-only inspection only; host Python test tooling is unavailable per the changes log |

The findings above are therefore source- and test-evidence findings; this
session does not claim a fresh passing PostgreSQL execution.

## Coverage Assessment

Phase 2 is **partially implemented**. Schema, grants, active deduplication,
lease owner/run checks, stale-claim metadata, and same-run checkpoint CAS are
present. The implementation does not yet demonstrate or deliver durable
PostgreSQL cross-run recovery, and queue bounds are not preserved through
requeue. The available evidence supports roughly 70 percent coverage of the
Phase 2 requirements, but the recovery failure is a release-blocking gap for
the resident-agent control plane.

## Clarifying Questions

* After a worker crash, should a stale `running` run be resumed in place, or should it be marked recoverable and linked explicitly to a replacement run?
* Should the pending queue limit count globally, per quilt, or both when a claimed trigger is requeued?
* Should requeue preserve the original trigger's `run_id`, or clear it until a new run claims the trigger?

## Recommended Next Validations

* Add a PostgreSQL test that leaves a run `running`, ages its claimed trigger, commits a checkpoint, and verifies the next claim resumes that checkpoint.
* Add a PostgreSQL test that fills the pending queue, then attempts a requeue and verifies the configured bound remains enforced.
* Add concurrent distinct-key insert coverage and a direct lease-acquisition race using separate PostgreSQL connections.
* Add representative restricted-role denial assertions for quilts, tiles, ownership, and authorization tables.
* Re-run the focused server test and the full worker pytest suite in an environment with the repository's required test tooling.
