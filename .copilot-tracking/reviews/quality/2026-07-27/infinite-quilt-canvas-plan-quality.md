<!-- markdownlint-disable-file -->
# Implementation Quality Review: Infinite Quilt Canvas

## Metadata

* Review date: 2026-07-27
* Scope: Full quality review of changed product files
* Plan: `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md`
* Research: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* Result: Failed

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| Major | 13 |
| Minor | 1 |

Recommendation: Do not enable protocol v2 or advance the quilt canary. Keep the additive schema and legacy compatibility path deployable while the major findings are resolved.

## Findings

### Major: Patch and chunk dimensions are incompatible

Production patch dimensions are not divisible by the 8-unit chunk size. The client derives global chunk counts with `ceil` and assigns each chunk from its starting coordinate, so boundary chunks straddle patches but are attributed to only one patch.

Evidence: `apps/client/src/App.tsx:963-991`

Remediation: Use patch-local chunks or decompose viewport intersections by patch before deriving canonical chunk addresses. Add production-dimension lap and boundary tests.

### Major: Persistence does not enforce canonical patch bounds

The database constrains patch addresses to nonnegative values but does not enforce `row < patch_rows` and `column < patch_columns` for the owning quilt.

Evidence: `apps/server/src/db/schema.ts:140-160`

Remediation: Enforce parent-dependent patch bounds in the database through a trigger or constrained creation procedure, and add PostgreSQL rejection tests.

### Major: Membership grants unconditional mutation permission

Any patch membership grants mutation permission. The stored role and delegated capabilities are ignored, which does not implement the ADR capability model.

Evidence: `apps/server/src/db/repository.ts:794-807`

Remediation: Persist and evaluate explicit mutation capability grants. Add member allow and deny tests, including mixed-permission cross-patch footprints.

### Major: Recovery can return a mixed cursor and state

Patch revision, authoritative tiles, and latest event ID are read through separate statements without a repeatable-read transaction. A concurrent commit can produce a snapshot whose state and cursor describe different revisions.

Evidence: `apps/server/src/db/repository.ts:1501-1575`

Remediation: Read revision, tiles, and event cursor in one repeatable-read transaction or one statement tied to a consistent revision. Add a concurrent reconstruction test.

### Major: Stale event-only cursors discard missed durable events

Event-only subscriptions with stale cursors skip snapshots and replay, then receive the current cursor in the acknowledgement. Missed durable events are silently discarded.

Evidence: `apps/server/src/index.ts:2296-2311`

Remediation: Replay retained events after the requested cursor or return a scoped reconstructable snapshot before advancing the accepted cursor. Test a deliberately stale cursor across replicas.

### Major: Chunk requests do not scope delivery

Requested `chunkIds` affect limits but not room identity, snapshot queries, or publication. Fine subscriptions return the entire patch, while aggregate subscriptions return no aggregate payload.

Evidence: `apps/server/src/realtime/quiltRooms.ts:45-48`, `apps/server/src/index.ts:2296-2326`

Remediation: Include canonical chunk scope in delivery identity or apply it as a mandatory snapshot and event filter. Implement useful aggregate payloads and tests.

### Major: Budget-rejected rooms remain joined

Rooms are joined before snapshot tile and byte budgets are checked. A budget-rejected room remains joined and can continue receiving events.

Evidence: `apps/server/src/index.ts:2265-2282`, `apps/server/src/index.ts:2313-2363`

Remediation: Complete authorization and budget validation before joining, or leave the room on any later rejection. Add a live socket regression test.

### Major: Snapshot chunk scope is not stored in the client cache

Scoped snapshots do not pass chunk IDs into the cache, leaving every patch's `chunkIds` empty. Active-patch calculation therefore cannot protect viewport patches during eviction.

Evidence: `apps/client/src/App.tsx:582-591`, `apps/client/src/App.tsx:779-788`

Remediation: Carry accepted canonical chunk scope through snapshot contracts and cache merges. Test that active viewport patches survive eviction pressure.

### Major: Optimistic and undo cache pins are not wired into the application

Optimistic and undo pin APIs exist only in the cache module and tests. Application placement and undo continue through legacy sequenced state.

Evidence: `apps/client/src/domain/quiltCache.ts:158-183`, `apps/client/src/App.tsx:1218-1268`

Remediation: Route protocol-v2 optimistic operations and undo metadata through the quilt cache before claiming bounded-state completion.

### Major: Periodic visibility uses a fixed viewport

Periodic image enumeration uses a fixed 40 by 30 viewport around `cameraPan`, independent of the actual canvas size and zoom. Visible aliases can be omitted and invisible aliases retained.

Evidence: `apps/client/src/render/MosaicScene.tsx:407-425`

Remediation: Use the actual orthographic camera viewport reported by the scene, including zoom and aspect ratio, for periodic image enumeration.

### Major: Seam E2E does not prove traversal budgets

The traversal E2E alternates wheel movement around one screen point, performs no multi-lap pan, and asserts none of the recorded cache, scene, draw-call, frame-time, snapshot-byte, or grid budgets.

Evidence: `e2e/quilt-seams.spec.ts:93-112`

Remediation: Add deterministic one-axis, corner, and multi-lap traversal with grid-alignment assertions and approved numeric budget gates.

### Major: Canary cohorts do not gate dual-read execution

Canary selection labels telemetry but does not restrict dual-read execution. Any protocol-v2 quilt negotiates v2 regardless of canary membership, while missing principal integration makes real subjects non-canary.

Evidence: `apps/server/src/migration/quiltRollout.ts:52-63`, `apps/server/src/index.ts:1669-1685`

Remediation: Apply canary selection before enabling protocol-v2 or dual-read behavior, and test included and excluded cohorts.

### Major: Migration rehearsal does not prove field parity

The operator parity CLI checks structural counts only. It does not invoke the field comparator, and the rollback fingerprint omits shape, color, material, and timestamps.

Evidence: `apps/server/src/db/quiltParityCli.ts:1-13`, `scripts/verify-quilt-migration.sh:133-137`

Remediation: Wire full-field comparison into the operator command, make mismatches exit nonzero, and include every preserved field in rollback verification.

### Minor: Contract schema version was not advanced

The shared contract remains at schema version `1.0.0` despite adding protocol-v2 handshake and event surfaces under a comment requiring version updates.

Evidence: `apps/server/src/contracts.ts:25-30`

Remediation: Advance the schema version according to the repository's compatibility policy and test negotiation behavior.

## Intentional Deferrals

The following items were not counted as quality defects because the plan and changes log explicitly defer them:

* Authenticated external principal integration
* Protocol-v2 mutation enablement
* Persisted visibility policy
* Measured production thresholds
* Authenticated alias-mutation E2E
* Legacy protocol and storage retirement

## Validation

Static diagnostics were clean for inspected implementation files. Product tests and migration scripts were analyzed but not executed by the quality validator; executable command results are recorded in the parent review log.
