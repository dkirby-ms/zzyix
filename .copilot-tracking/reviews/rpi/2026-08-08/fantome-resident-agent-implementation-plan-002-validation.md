---
title: Fantome Resident Agent Phase 2 Validation
description: Validation of Agent Control Plane and Trigger Semantics against the current implementation.
ms.date: 2026-08-08
ms.topic: assessment
---

<!-- markdownlint-disable-file -->

## Executive Status

**Partial.** Phase 2 has a working dedicated schema, restricted database role,
single-row lease ownership, owner-and-run-bound renewal, active trigger
deduplication, checkpoint compare-and-set, stale-trigger reclaim, and
PostgreSQL checkpoint recovery for a still-running prior run. The phase is not
ready for a passing validation because requeued work bypasses the configured
pending queue limit, and the worker role can directly mutate assignment and
lifecycle-control rows without an ownership or provisioning boundary. Several
important concurrency and recovery paths remain untested in the executable
PostgreSQL suite.

## Scope And Evidence

The comparison used the Phase 2 plan and implementation details, planning log,
primary research, changes log, prior Phase 2 validation, current migration and
Drizzle schema, worker control-plane and supervisor code, and the relevant
server and worker tests. No product source, plan, changes log, or research file
was modified.

The focused command `npm --prefix apps/server test --
src/db/agentControlPlane.postgres.integration.test.ts` passed with 4 tests on
2026-08-08. `npm --prefix apps/server run build` also passed. The worker
source and tests are syntactically compilable according to the recorded
`python3 -m compileall apps/agent-worker/src apps/agent-worker/tests` check,
but the worker PostgreSQL test remains skip-gated by
`AGENT_WORKER_POSTGRES_TEST_DSN` and the host currently has no `pytest`
module.
The worker PostgreSQL test remains skip-gated by
`AGENT_WORKER_POSTGRES_TEST_DSN`; the environment also lacks the
`agent_framework` import needed for the full worker test path.

## Requirement Coverage

| Phase 2 requirement | Evidence | Result |
| --- | --- | --- |
| Dedicated control-plane schema and restricted role | [0012 migration](../../../../apps/server/migrations/0012_agent_control_plane.sql#L1-L21) creates the `agent_control` schema and assignment tables; [0012 migration](../../../../apps/server/migrations/0012_agent_control_plane.sql#L24-L225) defines lifecycle, run, lease, checkpoint, trigger, outcome, metadata, and audit tables; [grants](../../../../apps/server/migrations/0012_agent_control_plane.sql#L250-L264) restrict canonical-table DML. | Covered for schema presence and broad canonical-table denial. |
| One active workflow lease per quilt | The [lease primary key and acquisition SQL](../../../../apps/server/migrations/0012_agent_control_plane.sql#L59-L78) allow one lease row per quilt and expiry-gated takeover; the [PostgreSQL adapter](../../../../apps/agent-worker/src/control_plane.py#L337-L367) uses the same conditional upsert. | Covered in implementation; direct two-connection lease race evidence is incomplete. |
| Renewal ownership | The [renewal CAS](../../../../apps/agent-worker/src/control_plane.py#L370-L387) requires quilt, run, owner, generation, and an unexpired lease. The focused [server test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L71-L153) verifies wrong-owner failure and matching-owner success. | Passed for the tested owner/run path. |
| Assignment and lifecycle ownership | [Assignment uniqueness](../../../../apps/server/migrations/0012_agent_control_plane.sql#L15-L21) gives one assignment per quilt and principal. However, the worker role receives DML on every control-plane table ([grants](../../../../apps/server/migrations/0012_agent_control_plane.sql#L256-L264)), and the adapter's [run and lease methods](../../../../apps/agent-worker/src/control_plane.py#L319-L367) do not independently require an active assignment. | Major gap. |
| Active trigger deduplication | The [partial unique index](../../../../apps/server/migrations/0012_agent_control_plane.sql#L198-L203) covers `pending` and `claimed`; the [concurrent same-key test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L165-L209) observes one inserted row. | Passed for active duplicate keys. |
| Configurable bounded pending queue | The [singleton limit](../../../../apps/server/migrations/0012_agent_control_plane.sql#L119-L132) and [serialized insert trigger](../../../../apps/server/migrations/0013_agent_control_recovery.sql#L24-L52) enforce the limit on inserts. The worker [requeue update](../../../../apps/agent-worker/src/control_plane.py#L510-L519) changes `claimed` to `pending` without invoking that insert trigger or checking the limit. | Failed for requeue transitions. |
| Initial trigger ingestion contract | The [persisted trigger model](../../../../apps/server/migrations/0012_agent_control_plane.sql#L116-L141) carries source, quilt, deduplication key, priority, status, policy version, payload, and timestamps. The [worker claim adapter](../../../../apps/agent-worker/src/control_plane.py#L262-L316) consumes those rows. No production trigger producer or policy-backed coalescing operation is present; the unresolved producer and coalescing decisions remain documented as DR-02. | Partially covered. |
| Pending IDs before workflow execution | The checkpoint schema persists `pending_trigger_ids` ([0012 migration](../../../../apps/server/migrations/0012_agent_control_plane.sql#L81-L99)); worker checkpoint serialization validates a string list ([checkpoints.py](../../../../apps/agent-worker/src/checkpoints.py#L26-L55)); the workflow path emits the initial checkpoint before tool work. | Covered in code; PostgreSQL-backed supervisor execution is not demonstrated. |
| Checkpoint compare-and-set | The adapter [updates only the expected version](../../../../apps/agent-worker/src/control_plane.py#L448-L501), and the [server test](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L242-L286) verifies version advance, pending IDs, and stale-write rejection. | Passed for same-run CAS. |
| Stale reclaim and cross-process recovery | The [claim query](../../../../apps/agent-worker/src/control_plane.py#L262-L316) records the claimant and reclaims an expired claim. The adapter [resumes running, failed, or cancelled runs](../../../../apps/agent-worker/src/control_plane.py#L319-L336), and the skip-gated [worker PostgreSQL test](../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L73-L132) verifies the original run and checkpoint are restored after claim and lease expiry. | Implemented; execution evidence is environment-gated. |

## Findings

### Major: Worker Can Mutate Assignment And Lifecycle Ownership

The migration grants `SELECT, INSERT, UPDATE, DELETE` on all tables in
`agent_control` to `agent_control_worker` and repeats that grant for future
tables ([0012 migration](../../../../apps/server/migrations/0012_agent_control_plane.sql#L256-L264)). This includes
`agent_assignments`, where the worker can create, replace, pause, or disable
the assignment that controls which quilt its reads may target. The assignment
table has foreign keys and uniqueness constraints, but no constraint requiring
the referenced principal to remain an active `agent`, and no separate server-
only provisioning role is established ([0012 migration](../../../../apps/server/migrations/0012_agent_control_plane.sql#L4-L21)).

The adapter's `start_run` and `claim_lease` operations also accept a quilt,
principal, and run without an active-assignment predicate
([control_plane.py](../../../../apps/agent-worker/src/control_plane.py#L319-L367)).
The normal supervisor reaches them after `claim_next_trigger`, which does join
active assignments ([control_plane.py](../../../../apps/agent-worker/src/control_plane.py#L262-L285)),
but the database role and lower-level operations do not enforce that ownership
boundary. This weakens the required pre-provisioned assignment and lifecycle
ownership model and permits a worker credential to self-authorize control-plane
work outside its assigned quilt.

The current negative test proves only that the role cannot update `patches`
([agentControlPlane.postgres.integration.test.ts](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L289-L327));
it does not test assignment mutation or an unassigned run/lease.

The implementation does not expose a producer-side ingestion API or a
coalescing decision function. That is consistent with the research decision to
defer producer policy, but it means Step 2.2 validates the storage and claim
contract only. Non-test trigger producers should remain disabled until DR-02
is resolved.

### Major: Requeue Bypasses The Pending Queue Limit

The limit function returns early only for non-pending rows and is installed as
a `BEFORE INSERT` trigger ([0012 migration](../../../../apps/server/migrations/0012_agent_control_plane.sql#L219-L247)). Migration 0013
serializes the limit row before counting pending rows, which fixes concurrent
distinct-key inserts ([0013 migration](../../../../apps/server/migrations/0013_agent_control_recovery.sql#L24-L52)). However,
`requeue_trigger` performs a direct `UPDATE` from `claimed` to `pending`
([control_plane.py](../../../../apps/agent-worker/src/control_plane.py#L510-L519)).

When the queue is already at its configured pending limit, a lease-unavailable
or lease-lost workflow can therefore requeue another row and exceed the bound.
The focused PostgreSQL test fills the queue only with inserts
([agentControlPlane.postgres.integration.test.ts](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L165-L239));
it does not exercise this transition. This directly violates the Phase 2
success criterion that configurable queue size limits are enforced.

### Minor: PostgreSQL Concurrency And Recovery Coverage Is Incomplete

The focused server suite passes, but contains four cases: lease owner renewal,
same-key deduplication and insert capacity, same-run checkpoint CAS, and one
`patches` permission denial ([agentControlPlane.postgres.integration.test.ts](../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L54-L327)).
It does not directly cover concurrent distinct-key inserts, two competing lease
acquisitions, stale claim reclaim, requeue at capacity, or assignment
ownership.

The worker PostgreSQL test does cover two concurrent trigger claims and a
checkpoint restore after stale claim and lease expiry
([test_control_plane_postgres.py](../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L73-L132)),
but it is skipped unless `AGENT_WORKER_POSTGRES_TEST_DSN` is configured. The
in-memory supervisor tests cover the same conceptual recovery path
([test_supervisor.py](../../../../apps/agent-worker/tests/test_supervisor.py#L208-L299)),
but cannot validate PostgreSQL transaction, trigger, grant, or migration
behavior.

The PostgreSQL claim query returns `candidate.claimed_by_agent_principal_id`
after updating the row ([control_plane.py](../../../../apps/agent-worker/src/control_plane.py#L298-L316)),
so a reclaimed `TriggerRecord` reports the previous claimant rather than the
new owner. The supervisor does not currently consume that field, making this a
metadata correctness gap rather than a demonstrated lease-safety failure.

## Verified Passes

* The control-plane migration creates the expected dedicated namespace and
  durable tables, with canonical public-table DML revoked from the worker role.
* Lease acquisition is one-row-per-quilt and takeover is expiry-gated; renewal
  checks owner, run, generation, and expiry.
* Active trigger deduplication is enforced by a partial unique index, and the
  focused test passes its concurrent same-key assertion.
* Checkpoint versions and pending trigger identifiers are persisted, and the
  focused test proves stale same-run writes are rejected.
* Stale claim reclaim and PostgreSQL recovery now retain the original `run_id`
  and load its committed checkpoint because `start_or_resume_run` accepts a
  still-`running` run ([control_plane.py](../../../../apps/agent-worker/src/control_plane.py#L319-L336)).
* Focused PostgreSQL control-plane validation passed: 4 tests.
* Worker source and tests passed Python bytecode compilation.

## Changes Log Comparison

The changes log accurately identifies migrations 0012 and 0013, the worker
control-plane adapter, supervisor recovery additions, and the skip-gated
PostgreSQL worker test ([changes log](../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L9-L86)).
Its claim of checkpoint recovery is now supported by the current adapter and
the added PostgreSQL test, subject to that test's DSN gate. Its broader claim
of control-plane recovery evidence overstates queue-bound and assignment-
ownership coverage because those paths are not tested or enforced as described
above.

## Coverage Assessment

Phase 2 coverage is approximately **75 percent by requirement surface**, but
the missing queue invariant and assignment ownership are control-plane safety
properties, so the overall phase status is **Partial**, not Passed. The
implementation is suitable for continued local development and focused test
execution. It is not sufficient evidence for enabling the worker in a shared
environment until requeue capacity and assignment/lifecycle authority are
closed.

## Remaining Gaps And Recommended Validations

* Make pending-limit enforcement apply atomically to `claimed` to `pending`
  updates, then add a PostgreSQL requeue-at-capacity test.
* Separate server-controlled assignment/provisioning writes from worker run,
  lease, trigger, and checkpoint writes, or enforce assignment ownership in
  database constraints and transactional operations.
* Add PostgreSQL tests for distinct-key concurrent inserts and competing lease
  acquisition using separate connections.
* Add denial tests for `quilts`, `tiles`, ownership, authorization, and
  assignment/provisioning mutations under the worker role.
* Keep production trigger producers disabled until the source, coalescing key,
  policy version, and payload contract are approved; then add producer-level
  ingestion tests.
* Run `apps/agent-worker/tests/test_control_plane_postgres.py` with a migrated
  `AGENT_WORKER_POSTGRES_TEST_DSN`, then run the full worker pytest suite in an
  environment with its declared dependencies, including `agent_framework`.
* Add a real worker-process restart fixture to verify checkpoint recovery beyond
  adapter-level behavior.

## Clarifying Questions

* Should assignment creation, reassignment, pause, and disable be server-only
  operations, with the worker limited to append-only lifecycle events and
  execution state?
* When requeue would exceed the pending limit, should the trigger remain
  claimed, be dropped, or be coalesced into an existing active key?
* Is the intended queue bound global across all quilts, or should it also have
  a per-quilt limit?