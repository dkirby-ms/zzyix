<!-- markdownlint-disable-file -->
# Release Changes: Multi-Client Session Management

**Related Plan**: multi-client-session-management-plan.instructions.md
**Implementation Date**: 2026-07-17

## Summary

Incrementally hardens the existing server-authoritative session protocol so multiple clients can collaborate on the same canvas with predictable consistency, using `revision` tracking, `expectedRevision` in outbound mutations, deterministic ack propagation, and an explicit resync event.

## Changes

### Added

### Modified

* apps/client/src/interaction/controller.ts — Added `revision` to `SequencedTilesState`, `SequencedSnapshot`, `OptimisticPlacementAck`; updated `createInitialSequencedTilesState`, `applySequencedSnapshot`, `reconcileOptimisticPlacementAck`
* apps/client/src/interaction/controller.test.ts — Updated existing tests with `revision` field; added 4 new revision progression tests; added `createInitialSequencedTilesState` import
* apps/client/src/App.tsx — Updated `onSnapshot` to pass `revision`; added `expectedRevision` to `place_tile` and `remove_tile` emissions; updated removal ack callbacks to advance `revision`
* apps/server/src/contracts.ts — Added `newRevision` to `PlaceTileAck`/`RemoveTileAck` success branches; added `revision` to `SessionSnapshotPayload`
* apps/server/src/index.ts — Added `newRevision` to place_tile and remove_tile ack emissions; added `revision` to session_snapshot payload
* apps/server/src/index.test.ts — Updated pre-existing test for `RemoveTileAck` to include `newRevision`
* apps/server/src/contracts.ts — Added `ResyncRequiredPayload` type and `resync_required` to `ServerToClientEvents`
* apps/server/src/index.ts — Emit `resync_required` to socket on `STALE_REVISION`/`OUT_OF_ORDER_REVISION` rejections
* apps/client/src/network/useSocketConnection.ts — Added `onResyncRequired` optional callback parameter and event registration
* apps/client/src/App.tsx — Added `onResyncRequired` callback (logs + calls `requestSnapshot()`); wired into `useSocketConnection`
* apps/server/src/index.integration.test.ts — Added 4 multi-client collaboration tests in new `'multi-client collaboration'` describe block
* apps/client/src/domain/placementSolver.ts — Added `placedBy?: string` to `TileInstance` type
* apps/client/src/interaction/controller.ts — Propagated `placedBy` through `reconcileOptimisticPlacementAck`
* apps/client/src/interaction/controller.test.ts — Added 2 tests for per-author tile attribution and filtering
* apps/client/src/App.tsx — `onTilePlaced` spreads `placedBy` onto tile; `attemptPlace` sets `placedBy: clientId` on `tempTile`; `handleUndo` and `'z'` keydown filter by `clientId`; `canUndo` filters by `clientId`

### Removed

## Additional or Deviating Changes

* Build-time fix: Added missing `revision: state.revision` to return statements in `reconcileSequencedTilePlaced` and `reconcileSequencedTileRemoved` (broadcast events don't carry revision, so existing revision is preserved)

## Release Summary

All 4 phases completed successfully. 11 files modified across client and server apps.

**Files affected: 11 modified, 0 added, 0 removed**

| File | Purpose |
|------|---------|
| apps/client/src/interaction/controller.ts | Added `revision` to state types; updated reconcilers to advance/carry revision |
| apps/client/src/interaction/controller.test.ts | Updated existing tests; added 6 new tests (4 revision + 2 per-author undo) |
| apps/client/src/App.tsx | `onSnapshot` passes revision; `place_tile`/`remove_tile` send `expectedRevision`; ack handlers advance revision; `handleUndo` and `'z'` handler filter by `clientId`; `canUndo` filters by `clientId`; `onResyncRequired` callback wired |
| apps/client/src/network/useSocketConnection.ts | Added `onResyncRequired` optional callback and event registration |
| apps/client/src/domain/placementSolver.ts | Added `placedBy?: string` to `TileInstance` |
| apps/server/src/contracts.ts | Added `newRevision` to `PlaceTileAck`/`RemoveTileAck`; `revision` to `SessionSnapshotPayload`; `ResyncRequiredPayload` type and `resync_required` in `ServerToClientEvents` |
| apps/server/src/index.ts | Threaded `newRevision` through ack payloads; added `revision` to snapshot; emits `resync_required` on `STALE_REVISION`/`OUT_OF_ORDER_REVISION` rejections |
| apps/server/src/index.test.ts | Updated pre-existing test for `RemoveTileAck` to include `newRevision` |
| apps/server/src/index.integration.test.ts | Added 4 multi-client collaboration tests |

**Validation:** TypeScript clean (both apps). 21/21 client tests pass. 33/33 server tests pass.

**Follow-on items identified:**
- Server `TileInstance` type (contracts.ts) does not carry `placedBy`; if acks ever need to echo it (multi-tab), add the field server-side.
- Broadcast events (`tile_placed`, `tile_removed`) do not carry `revision`; clients that only receive broadcasts without making mutations will have a stale `expectedRevision` on next write, triggering one extra resync round-trip. Adding `revision` to broadcast events would eliminate this round-trip.
- `canvases` table has a `version` column used as revision; the in-memory `applyPlaceTile`/`applyRemoveTile` helpers use `opSeq` as a proxy. A dedicated `revision` column update in the in-memory state would improve accuracy.
