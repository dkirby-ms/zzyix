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
* apps/server/src/contracts.ts — Added `request_snapshot` client event; added `revision` to `TilePlacedPayload` and `TileRemovedPayload`; added optional `placedBy` to server `TileInstance`
* apps/server/src/index.ts — Added `request_snapshot` handler; removed reconnect dependency from snapshot flow by serving explicit snapshot response; updated in-memory state sync after initial and requested snapshots
* apps/server/src/db/repository.ts — Preserved `placedBy` in tile mapping and replay operations; propagated `revision` in tile placed/removed events for broadcast revision advancement
* apps/client/src/App.tsx — Replaced reconnect-based `requestSnapshot` with explicit `request_snapshot`; updated broadcast reconciliation to consume event `revision`; fixed keydown undo callback to avoid stale closure while preserving expectedRevision correctness
* apps/client/src/interaction/controller.ts — Added `revision` to sequenced broadcast payload types and now advances `revision` from authoritative broadcast payload
* apps/client/src/interaction/controller.test.ts — Added regression tests for passive-client revision advancement and snapshot `placedBy` durability
* apps/server/src/index.integration.test.ts — Added tests for peer-broadcast revision advancement, explicit snapshot-request behavior, and replay snapshot `placedBy` durability
* apps/server/src/index.test.ts — Added event revision assertions for `tile_placed` and `tile_removed`

### Removed

## Additional or Deviating Changes

* Reviewed and replaced prior temporary broadcast-revision workaround: broadcast payloads now carry authoritative `revision`, so passive clients no longer stall on stale revision until next local mutation.

## Release Summary

All 4 phases completed successfully, including review-driven rework. 8 source/test files modified in this final pass (plus existing review artifacts).

**Files affected (final pass): 8 modified, 0 added, 0 removed**

| File | Purpose |
|------|---------|
| apps/server/src/contracts.ts | Added `request_snapshot`; added `revision` to `tile_placed`/`tile_removed` payloads; server tile shape now supports optional `placedBy` for snapshot durability |
| apps/server/src/db/repository.ts | Preserved `placedBy` in snapshot/replay tile mapping and replay-applied operations; added event revision propagation |
| apps/server/src/index.ts | Implemented explicit `request_snapshot` round-trip and synchronized in-memory session state from authoritative replay snapshots |
| apps/server/src/index.integration.test.ts | Added regression tests for passive revision advance, explicit snapshot request, and reconnect/resync undo attribution durability |
| apps/server/src/index.test.ts | Added revision assertions for broadcast event payloads |
| apps/client/src/App.tsx | Replaced reconnect resync with `request_snapshot` emit; consumes broadcast `revision`; keydown undo now reads current state safely |
| apps/client/src/interaction/controller.ts | Sequenced broadcast reconcilers now accept and apply authoritative `revision` from payloads |
| apps/client/src/interaction/controller.test.ts | Added passive-client broadcast revision and snapshot `placedBy` durability tests |

**Validation:**
- `npm run test --workspace apps/server` passed (36/36 tests)
- `npm run test --workspace apps/client` passed (24/24 tests)
- `npm run build --workspace apps/client` passed (Vite chunk-size warning only)
- `npm run build --workspace apps/server` passed

**Follow-on items identified:**
- Consider adding an end-to-end socket integration test that exercises the live `request_snapshot` event on a running Socket.IO server instance.
- Evaluate whether `resync_required.currentOpSeq` should be renamed to `currentRevision` for protocol clarity (current payload contains revision value).
