<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Issues Plan

* **Repository**: dkirby-ms/zzyix
* **Milestone**: Production and Scale for new issues

## IS001 - Create - Infinite canvas rollout and legacy retirement

Create the parent tracking issue before all child issues and relationships.

IS001 - Similarity: #53=Related (original experience request, narrower than the complete initiative)

* IS001 - issue_number: #93
* IS001 - title: [Epic] Infinite canvas rollout and legacy retirement
* IS001 - state: open
* IS001 - labels: type:epic, enhancement, priority:p0
* IS001 - milestone: Production and Scale
* IS001 - assignees: dkirby-ms

### IS001 - body

```markdown
## Summary

Track delivery and production rollout of the finite wraparound infinite canvas, including the original user experience, patch-scoped architecture, operational gates, and eventual compatibility retirement.

## Delivered Foundation

* Finite toroidal topology with canonical patch and tile identity
* Patch-scoped persistence, authorization primitives, transactions, and recovery
* Protocol-v2 area-of-interest snapshots, replay, aggregates, and bounded rooms
* Bounded client cache, seam rendering, camera-relative aliases, and traversal tests
* Canary controls and full-field migration rehearsal

## Remaining Outcomes

* Integrate stable identity and complete authorization and visibility policy.
* Establish measured production budgets and rollout thresholds.
* Finish migration metadata and release-job ownership.
* Validate authenticated mutation through periodic aliases.
* Instrument production adapter attachment usage.
* Retire protocol v1 and legacy storage only after every rollout gate passes.

## Completion Criteria

* All child issues are complete.
* Production canary evidence satisfies approved thresholds and rollback policy.
* Protocol-v2 mutation uses stable authenticated principals and complete patch policy.
* Legacy compatibility is retired through a separately reviewed contract migration.
```

### IS001 - Relationships

* IS001 - parent-of - #53: Original wraparound user experience request
* IS001 - parent-of - #94 through #100: Remaining release and retirement work

## IS003 - Create - Identity, authorization, and visibility

IS003 - Similarity: Distinct

* IS003 - issue_number: #94
* IS003 - title: [Feature] Establish infinite-canvas identity, authorization, and visibility policy
* IS003 - state: open
* IS003 - labels: type:feature, area:security, area:backend, priority:p0, needs-design
* IS003 - milestone: Production and Scale
* IS003 - assignees: dkirby-ms

### IS003 - body

```markdown
## Summary

Complete the identity and policy model required before protocol-v2 quilt mutation can be enabled broadly.

## Scope

* Select and integrate a stable external identity provider with internal principals.
* Persist patch visibility rules for existence, fine content, aggregates, presence, search, and durable events.
* Persist scoped delegated mutation grants and audited moderator assignments.
* Define claim, transfer, suspension, deletion, and moderation behavior.
* Enforce capabilities for every patch intersected by a mutation.

## Acceptance Criteria

* Runtime authorization never relies on connection IDs, participation, or tile attribution.
* Owner, delegated member, moderator, and denied cases have focused database and API tests.
* Fine data, aggregates, presence, search, and events apply one persisted visibility matrix.
* Cross-patch mutations fail atomically when any affected patch denies access.
* Protocol-v2 mutation remains disabled until the approved identity mapping is active.
```

### IS003 - Relationships

* IS003 - sub-issue-of - #93: Security and identity release gate

## IS004 - Create - Production budgets and canary thresholds

IS004 - Similarity: Distinct

* IS004 - issue_number: #95
* IS004 - title: [Work Item] Benchmark infinite-canvas production budgets and canary thresholds
* IS004 - state: open
* IS004 - labels: type:task, area:qa, area:devops, priority:p0
* IS004 - milestone: Production and Scale
* IS004 - assignees: dkirby-ms

### IS004 - body

```markdown
## Summary

Measure representative infinite-canvas workloads and convert the results into approved production rollout gates.

## Scope

* Capture tile density, room churn, snapshot and event bytes, adapter attachments, pool wait, and lock wait.
* Measure retained cache entries, scene objects, draw calls, and frame time during deterministic multi-lap traversal.
* Exercise normal editing, seam-heavy editing, reconnect, and high-density scenarios.
* Define warning, stop, and rollback thresholds for canary cohorts.
* Document the workload fixtures, environment, and confidence limits.

## Acceptance Criteria

* Benchmarks are repeatable against representative production-like data.
* Every server and client budget has an approved threshold and measurement method.
* Canary dashboards distinguish cohort, quilt, principal, and protocol version.
* Exceeding a stop threshold disables rollout without deleting legacy data.
* Results are linked from the rollout runbook.
```

### IS004 - Relationships

* IS004 - sub-issue-of - #93: Measured rollout gate

## IS005 - Create - Drizzle migration metadata repair

IS005 - Similarity: Distinct

* IS005 - issue_number: #96
* IS005 - title: [Work Item] Repair Drizzle migration metadata for the quilt schema
* IS005 - state: open
* IS005 - labels: type:task, area:data, priority:p1
* IS005 - milestone: Production and Scale
* IS005 - assignees: dkirby-ms

### IS005 - body

```markdown
## Summary

Repair the Drizzle migration metadata gap so the quilt migration has a truthful generated schema history.

## Scope

* Reconcile missing metadata snapshots for migrations preceding the quilt migration.
* Generate or review the quilt snapshot only after earlier history is correct.
* Compare generated metadata with applied SQL and the runtime schema.
* Validate clean apply, repeated apply, rollback compatibility, and schema drift detection.

## Acceptance Criteria

* Migration journal and snapshots represent every applied migration in order.
* Generated schema metadata matches the disposable PostgreSQL schema.
* Quilt tables, indexes, triggers, checks, and attachment storage are represented accurately.
* Existing data-preservation and recovery rehearsal remains green.
```

### IS005 - Relationships

* IS005 - sub-issue-of - #93: Migration integrity gate

## IS006 - Create - Production migration job

IS006 - Similarity: #19=Similar (rollback ownership only; production apply remains distinct)

* IS006 - issue_number: #97
* IS006 - title: [Work Item] Add a one-shot production migration job for the quilt schema
* IS006 - state: open
* IS006 - labels: type:task, area:devops, area:data, priority:p1
* IS006 - milestone: Production and Scale
* IS006 - assignees: dkirby-ms

### IS006 - body

```markdown
## Summary

Establish one release-owned production migration step for the additive quilt schema while application replicas remain verification-only.

## Scope

* Add a deployment job or release stage that invokes the existing one-shot migration command exactly once per release.
* Ensure rolling replicas do not race data-definition changes.
* Add preflight compatibility checks, observability, failure handling, and operator documentation.
* Coordinate with #19 for executable rollback without duplicating rollback ownership.

## Acceptance Criteria

* Exactly one controlled job owns production schema application.
* Application replicas fail clearly on incompatible schema and never apply migrations at startup.
* The job is idempotent, observable, and safe to retry after an interrupted run.
* Apply and rollback procedures are exercised in a production-like environment.
* Deployment documentation identifies ownership and approval gates.
```

### IS006 - Relationships

* IS006 - sub-issue-of - #93: Production migration ownership
* IS006 - related-to - #19: Executable rollback workflow

## IS007 - Create - Authenticated alias mutation E2E

IS007 - Similarity: Distinct

* IS007 - issue_number: #98
* IS007 - title: [Test] Add authenticated protocol-v2 alias mutation E2E coverage
* IS007 - state: open
* IS007 - labels: type:task, area:qa, area:realtime, area:frontend, priority:p0, blocked
* IS007 - milestone: Production and Scale
* IS007 - assignees: dkirby-ms

### IS007 - body

```markdown
## Summary

Prove authenticated protocol-v2 mutations behave identically through canonical and periodic display aliases.

## Scope

* Place and remove tiles through horizontal, vertical, and corner aliases.
* Verify one canonical tile, operation, event stream, and undo identity.
* Exercise authorized owner and delegated capability cases plus atomic denial.
* Reconnect through another replica and confirm cursor convergence after mutation.
* Persist affected chunk IDs for removals so retained removals can replay without snapshot fallback.

## Acceptance Criteria

* Alias placement and removal produce exactly one durable canonical mutation.
* Unauthorized cross-patch operations persist no partial state.
* Optimistic and undo pins survive traversal and clear after acknowledgement or failure.
* Retained removal events replay by chunk scope without unnecessary snapshot fallback.
* Tests run in CI against real PostgreSQL and two server replicas.

## Blocked By

Stable authenticated principal integration and approved delegated capability policy.
```

### IS007 - Relationships

* IS007 - sub-issue-of - #93: Authenticated mutation release gate
* IS007 - blocked-by - #94: Stable identity and capability model

## IS008 - Create - Adapter attachment telemetry

IS008 - Similarity: #20=Similar (fan-out validation only; attachment instrumentation remains distinct)

* IS008 - issue_number: #99
* IS008 - title: [Work Item] Instrument production Postgres adapter attachment telemetry
* IS008 - state: open
* IS008 - labels: type:task, area:realtime, area:devops, priority:p1
* IS008 - milestone: Production and Scale
* IS008 - assignees: dkirby-ms

### IS008 - body

```markdown
## Summary

Measure Socket.IO PostgreSQL adapter attachment usage from the real production path instead of test-control traffic.

## Scope

* Instrument payloads that cross the adapter attachment threshold.
* Record attachment writes, reads, bytes, latency, failures, and cleanup outcomes.
* Correlate measurements with quilt cohort, room scope, and payload type without exposing content.
* Add production-path integration coverage and operational dashboard guidance.
* Coordinate with #20, which owns multi-instance fan-out behavior.

## Acceptance Criteria

* Metrics originate from real adapter attachment operations.
* Oversized snapshot and event payloads are distinguishable from test controls.
* Failed or orphaned attachments are observable and covered by cleanup validation.
* Multi-replica tests prove telemetry without changing delivery semantics.
* Runbook guidance includes alert interpretation and investigation steps.
```

### IS008 - Relationships

* IS008 - sub-issue-of - #93: Production observability gate
* IS008 - related-to - #20: Multi-instance adapter fan-out validation

## IS009 - Create - Legacy retirement

IS009 - Similarity: Distinct

* IS009 - issue_number: #100
* IS009 - title: [Feature] Retire protocol v1 and legacy canvas storage after rollout gates
* IS009 - state: open
* IS009 - labels: type:feature, area:backend, area:data, priority:p1, blocked
* IS009 - milestone: Production and Scale
* IS009 - assignees: dkirby-ms

### IS009 - body

```markdown
## Summary

Retire protocol-v1 fanout and obsolete canvas storage only after the infinite-canvas rollout and rollback gates are approved.

## Entry Criteria

* Stable authenticated principals and complete persisted visibility policy are active.
* Authenticated alias mutation and multi-replica recovery tests pass.
* Full-field parity and migration operations pass in production-like rehearsal.
* Production canary thresholds remain healthy for the approved window.
* Rollback policy and retirement approval are recorded.

## Scope

* Stop protocol-v1 session-wide durable mutation fanout.
* Remove whole-canvas recovery dependencies and legacy read fallback.
* Execute a separately reviewed contract migration for obsolete columns and constraints.
* Preserve stable tile identity and auditable migration evidence.

## Acceptance Criteria

* Protocol-v2 clients receive only scoped durable streams.
* Recovery and undo no longer depend on whole-canvas retained state.
* Legacy data is removed only after rollback no longer depends on it.
* A rollback rehearsal and final parity report are approved before destructive migration.
```

### IS009 - Relationships

* IS009 - sub-issue-of - #93: Final compatibility retirement
* IS009 - blocked-by - #94: Identity and policy
* IS009 - blocked-by - #95: Measured rollout gates
* IS009 - blocked-by - #97: Production migration ownership
* IS009 - blocked-by - #98: Authenticated mutation proof
* IS009 - blocked-by - #99: Production attachment telemetry

## IS002 - Link - Original request

* IS002 - issue_number: #53
* IS002 - title: [Feature] "Infinite" scrolling canvas
* IS002 - state: open
* IS002 - labels: none
* IS002 - milestone: UX Overhaul
* IS002 - assignees: dkirby-ms

### IS002 - Relationships

* IS002 - sub-issue-of - #93: Preserve the original user-facing requirement under the broader initiative
<!-- markdown-table-prettify-ignore-end -->
