<!-- markdownlint-disable-file -->
# Implementation Review: Infinite Quilt Canvas

## Review Metadata

* Review date: 2026-07-27
* Related plan: `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md`
* Research: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* Review scope: All eight implementation phases and current worktree changes
* Conversation context: Included

## Summary

The implementation establishes useful foundations, and every executable repository gate passes when PostgreSQL is available. It does not yet satisfy the completed-phase claims for canonical topology, patch persistence, scoped recovery, bounded client state, or migration parity.

Three critical correctness defects affect canonical subscriptions, persisted patch identity, and durable reconnect recovery. Fourteen major findings affect authorization, snapshot consistency, area-of-interest delivery, cache eviction, rendering, canary control, migration proof, and test coverage. Protocol v2 and quilt canary rollout should remain disabled while these findings are corrected.

| Severity | Count |
|---|---:|
| Critical | 3 |
| Major | 14 |
| Minor | 3 |

## RPI Validation

### Phase 1: Product and Security Contract

Status: Partial

The ADR covers most product and security decisions. Runtime authorization does not implement delegated mutation capabilities, and no product or threat-model approval artifact establishes the Phase 1 exit gate.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-001-validation.md`

### Phase 2: Shared Topology Domain

Status: Failed

The pure topology primitives are sound, but client chunk enumeration is not periodic for production dimensions because 62.4 world units is not divisible by the 8-unit chunk size. An exact quilt lap can add a canonical chunk subscription.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-002-validation.md`

### Phase 3: Additive Persistence and Identity Expansion

Status: Failed

The additive schema and compatibility backfill exist. Persistence does not enforce patch addresses within parent quilt dimensions, the named backfill tests do not exercise database restart or field preservation, and no deployment job owns the one-shot migration command.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-003-validation.md`

### Phase 4: Patch-Scoped Correctness and Recovery

Status: Partial

Sorted patch transactions and PostgreSQL concurrency tests are present. Membership grants unconditional write access, runtime v2 mutation remains unavailable by design, and reconstruction can combine revision, tiles, and cursor from different commits.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-004-validation.md`

### Phase 5: Protocol V2 Area-of-Interest Delivery

Status: Failed

Protocol contracts, bounded room resolution, v1 suppression, and a two-process adapter harness exist. Requested chunks do not scope data, aggregate rooms return no useful aggregate, stale event-only cursors discard missed operations, and budget-rejected rooms remain joined. The replica test does not exercise a deliberately stale cursor.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-005-validation.md`

### Phase 6: Client Virtualization and Seam Rendering

Status: Partial

Cache and periodic-image primitives are implemented. Snapshot chunk scope is not stored, optimistic and undo pins are not connected to application workflows, rendering uses a fixed synthetic viewport, and E2E does not perform or enforce the claimed multi-lap traversal and budget scenarios.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-006-validation.md`

### Phase 7: Migration Canary and Legacy Retirement

Status: Partial

Steps 7.1 and 7.2 are only partially complete, and Step 7.3 correctly remains blocked. Client-runtime telemetry is normally unreachable, canary cohorts do not gate dual reads, operator parity is structural rather than field-level, and rehearsal covers only the expanded canvas size.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-007-validation.md`

### Phase 8: Final Validation

Status: Partial

All prescribed executable commands pass when run serially with PostgreSQL. The migration rehearsal does not prove the full field-preservation contract, so passing commands do not establish every Phase 8 release criterion.

Evidence: `.copilot-tracking/reviews/rpi/2026-07-27/infinite-quilt-canvas-plan-008-validation.md`

## Implementation Quality

Quality validation found 13 major and one minor issue before severity normalization and cross-phase deduplication. The detailed quality report is `.copilot-tracking/reviews/quality/2026-07-27/infinite-quilt-canvas-plan-quality.md`.

### Critical Findings

1. Exact quilt laps do not preserve canonical chunk subscriptions for production dimensions. A 62.4-unit quilt width and 8-unit chunks can map equivalent viewports to different chunk sets. Evidence: `apps/client/src/App.tsx:963-991` and `apps/client/src/domain/math2d.ts:82-124`.
2. Persisted patch addresses are not constrained to the parent quilt dimensions. Invalid canonical patch identities can be stored despite the architecture requiring exactly one bounded address. Evidence: `apps/server/src/db/schema.ts:140-160`.
3. Event-only subscriptions with stale cursors advance to the current cursor without replay or a scoped snapshot, silently discarding missed durable events. Evidence: `apps/server/src/index.ts:2296-2311`.

### Major Findings

1. Patch membership grants mutation permission without evaluating role capabilities or delegated grants. Evidence: `apps/server/src/db/repository.ts:794-807`.
2. Patch reconstruction reads revision, tiles, and event ID in separate autocommit statements, allowing mixed state and cursors. Evidence: `apps/server/src/db/repository.ts:1501-1575`.
3. Requested chunk IDs affect budgets but not room identity, snapshot queries, or publication scope. Evidence: `apps/server/src/realtime/quiltRooms.ts:43-48` and `apps/server/src/index.ts:2296-2326`.
4. Aggregate subscriptions return neither fine tiles nor useful aggregate content. Evidence: `apps/server/src/contracts.ts:524-530` and `apps/server/src/index.ts:2313`.
5. Rooms are joined before tile and payload budgets are evaluated, and later rejection does not leave the room. Evidence: `apps/server/src/index.ts:2265-2282` and `apps/server/src/index.ts:2313-2363`.
6. Scoped snapshots do not store accepted chunk scope in the client cache, so active viewport patches are not protected reliably during eviction. Evidence: `apps/client/src/App.tsx:582-591` and `apps/client/src/App.tsx:779-788`.
7. Optimistic and undo cache pins are implemented as isolated helpers but are not wired into protocol-v2 placement and undo workflows. Evidence: `apps/client/src/domain/quiltCache.ts:158-183` and `apps/client/src/App.tsx:1218-1268`.
8. Periodic image enumeration uses a fixed 40-by-30 viewport instead of the actual orthographic camera bounds and zoom. Evidence: `apps/client/src/render/MosaicScene.tsx:407-425`.
9. Seam E2E does not perform deterministic seam and multi-lap traversal or assert cache, scene, draw-call, frame-time, snapshot-byte, and grid budgets. Evidence: `e2e/quilt-seams.spec.ts:93-112`.
10. Canary cohorts label telemetry but do not gate dual-read or protocol-v2 execution. Evidence: `apps/server/src/migration/quiltRollout.ts:52-63`, `apps/server/src/index.ts:1669-1685`, and `apps/server/src/db/repository.ts:604-639`.
11. Client-runtime telemetry is registered only after an oversized snapshot rejection, making normal canary measurements unreachable. Evidence: `apps/server/src/index.ts:2327-2364` and `apps/client/src/App.tsx:918-933`.
12. Operator parity and rollback rehearsal do not compare every preserved tile field. Evidence: `apps/server/src/db/quiltParityCli.ts:1-13` and `scripts/verify-quilt-migration.sh:133-137`.
13. Migration rehearsal covers expanded canvases only, not classic and vast sizes or a representative boundary dataset. Evidence: `scripts/verify-quilt-migration.sh:100-129`.
14. The backfill test file covers pure geometry helpers rather than database idempotency, restart, complete field preservation, and no-owner guarantees. The rehearsal exercises part of this behavior but does not provide focused regression fixtures. Evidence: `apps/server/src/db/quiltBackfill.test.ts` and `apps/server/src/db/quiltBackfill.ts:204-227`.

### Minor Findings

1. Contract schema version remains `1.0.0` after adding protocol-v2 surfaces. Evidence: `apps/server/src/contracts.ts:25-30`.
2. Attachment telemetry measures a test-control path rather than production PostgreSQL adapter attachment use. Evidence: `apps/server/src/index.ts:1508-1514`.
3. Server runbook language overstates the count-only operator parity command as full persisted-field parity. Evidence: `apps/server/README.md:65-71`, `apps/server/README.md:103-109`, and `apps/server/src/db/quiltParityCli.ts:1-13`.

## Validation Commands

| Command | Status | Review result |
|---|---|---|
| `npm run lint` | Passed | Client and server Oxlint completed without findings |
| `npm run build` | Passed | Client and server builds completed; Vite emitted a non-failing bundle-size advisory |
| `npm run test` without PostgreSQL | Failed | Two PostgreSQL integration suites could not connect to `127.0.0.1:5432` |
| `npm run test` with PostgreSQL | Passed | Client 129 of 129; server 116 of 116 |
| `npm run test:e2e:ci` | Passed | Seven of seven tests |
| Multi-replica Playwright | Passed | One of one test |
| `scripts/verify-quilt-migration.sh` | Passed | Migration, repeated backfill, structural parity, rollback, and four recovery tests completed |
| `git diff --check` | Passed | No whitespace errors |
| VS Code diagnostics | Passed | No diagnostics in the current workspace |

PostgreSQL was stopped after validation. Ports 3001, 5173, 3101, 4173, 3201, 3202, and 5432 were verified free.

## Missing Work and Deviations

* Phase 2 is marked complete despite incorrect exact-lap subscription behavior for production dimensions.
* Phase 3 is marked complete despite missing canonical patch-address enforcement and focused database backfill tests.
* Phase 4 is marked complete despite mixed-state reconstruction and incomplete capability authorization.
* Phase 5 is marked complete despite missing stale-cursor convergence, chunk-scoped delivery, and aggregate payloads.
* Phase 6 is marked complete despite unwired cache pins and incomplete traversal E2E.
* Phase 7 correctly remains incomplete at Step 7.3, but Steps 7.1 and 7.2 also require rework.
* Phase 8 commands pass, but the rehearsal does not validate every field-level migration release criterion.

## Follow-Up Work

### Deferred From Scope

* Select and integrate the authenticated external identity provider
* Persist the complete visibility policy
* Establish measured room, payload, cache, scene, and frame-time thresholds
* Add authenticated alias mutation E2E
* Repair Drizzle snapshots 0003 through 0005
* Add the production one-shot migration job
* Retire protocol v1 and legacy storage only after all approved exit gates pass

### Discovered During Review

* Correct non-chunk-aligned periodic subscription arithmetic
* Enforce canonical patch bounds in PostgreSQL
* Make patch snapshots transactionally consistent
* Implement stale-cursor replay or scoped snapshot fallback
* Scope snapshot and event delivery by accepted chunks
* Complete aggregate delivery and pre-join budget checks
* Wire client cache scope, optimistic operations, and undo pins
* Use actual camera bounds for periodic images
* Strengthen seam traversal, canary telemetry, and full-field migration tests
* Advance the shared contract schema version

## Overall Status

Needs Rework

## Reviewer Notes

The additive schema and legacy compatibility path should remain deployable. Protocol v2 and quilt canary rollout should stay disabled until the critical and major findings are resolved and the focused regressions pass. Green baseline commands demonstrate that existing assertions pass; they do not invalidate the untested edge cases identified through source review.
