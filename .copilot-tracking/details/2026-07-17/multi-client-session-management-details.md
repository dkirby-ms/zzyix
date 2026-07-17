<!-- markdownlint-disable-file -->
# Implementation Details: Multi-Client Session Management

## Context Reference

Sources: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md, apps/client/src/interaction/controller.ts, apps/client/src/App.tsx, apps/server/src/contracts.ts, apps/server/src/index.ts

---

## Implementation Phase 1: Client revision tracking and expectedRevision wiring

<!-- parallelizable: false -->

### Step 1.1: Add `revision` to `SequencedTilesState` and update all constructors and reconcile helpers

The current `SequencedTilesState` type (controller.ts:25-29) tracks `tiles`, `lastOpSeq`, and `requiresSnapshot` but has no `revision` field. The server already assigns a canvas revision alongside `opSeq` during each mutation (inferred from `expectedRevision` contract support in contracts.ts:205-215); the client just never consumes or tracks it.

Add `revision: number` to the type and propagate it through all construction and reconciliation paths.

Files:
* apps/client/src/interaction/controller.ts — Extend type and update all helpers

Changes in controller.ts:

1. Extend `SequencedTilesState` (lines 25-29) to add `revision: number`:

```ts
export type SequencedTilesState = {
  tiles: TileInstance[]
  lastOpSeq: number
  revision: number        // NEW: authoritative canvas revision from server acks/snapshot
  requiresSnapshot: boolean
}
```

2. Extend `SequencedSnapshot` (lines 11-14) to carry `revision`:

```ts
export type SequencedSnapshot = {
  tiles: TileInstance[]
  lastOpSeq: number
  revision: number        // NEW
}
```

3. Update `createInitialSequencedTilesState` (lines 63-66) to initialize `revision: 0`.

4. Update `applySequencedSnapshot` (lines 68-73) to pass through `revision` from snapshot payload.

5. Extend `OptimisticPlacementAck` (lines 30-32) to carry `newRevision` on successful placement:

```ts
export type OptimisticPlacementAck =
  | { placed: null; rejected: true }
  | { placed: TileInstance; rejected: false; opSeq: number; newRevision: number }
```

6. Update `reconcileOptimisticPlacementAck` (lines 75-100) to advance `revision` from `ack.newRevision` on success. On rejection, `revision` is unchanged.

7. `reconcileSequencedTilePlaced` and `reconcileSequencedTileRemoved` do not need `revision` because broadcast deltas do not carry a revision; only acks do. Leave these unchanged.

Discrepancy references:
* Addresses DD-01 (revision tracking gap identified in research)

Success criteria:
* TypeScript reports no errors on controller.ts after changes
* All existing controller.test.ts cases pass

Context references:
* apps/client/src/interaction/controller.ts (Lines 25-29) — SequencedTilesState type
* apps/client/src/interaction/controller.ts (Lines 63-66) — createInitialSequencedTilesState
* apps/client/src/interaction/controller.ts (Lines 68-73) — applySequencedSnapshot
* apps/client/src/interaction/controller.ts (Lines 75-100) — reconcileOptimisticPlacementAck

Dependencies:
* None; this is the first step

---

### Step 1.2: Extend `PlaceTileAck` and `RemoveTileAck` contracts with `newRevision`

The current `PlaceTileAck` (contracts.ts:229-231) returns `{ placed, rejected, opSeq, idempotent? }` on success. `RemoveTileAck` (contracts.ts:253-254) returns `{ removed, opSeq, idempotent? }` on success. Neither carries `newRevision`.

Files:
* apps/server/src/contracts.ts — Extend ack union types
* apps/client/src/App.tsx — Update `onSnapshot` to pass `revision` to `applySequencedSnapshot` (required because `SequencedSnapshot.revision` becomes a required field in Step 1.1)

Changes:

1. `PlaceTileAck` success branch: add `newRevision: number`.

```ts
export type PlaceTileAck =
  | { placed: TileInstance; rejected: false; opSeq: number; newRevision: number; idempotent?: boolean }
  | { placed: null; rejected: true; reason: PlaceTileRejectReason }
```

2. `RemoveTileAck` success branch: add `newRevision: number`.

```ts
export type RemoveTileAck =
  | { removed: true; opSeq: number; newRevision: number; idempotent?: boolean }
  | { removed: false; reason?: RemoveTileRejectReason }
```

3. Also extend `SessionSnapshotPayload` (contracts.ts:267-271) to include `revision: number` so the client can initialize its revision from the snapshot:

```ts
export type SessionSnapshotPayload = {
  session: Session
  clients: ClientPresence[]
  lastOpSeq: number
  revision: number        // NEW
}
```

Discrepancy references:
* Addresses DD-02 (newRevision omitted from acks; completing the contract before server enforcement)

4. **App.tsx `onSnapshot` call site**: After adding `revision` to `SequencedSnapshot`, the `applySequencedSnapshot` call in App.tsx (lines 86-94) must pass `revision: payload.revision`. Failure to do so causes a TypeScript error because `revision` is now a required field on `SequencedSnapshot`. Add one line inside the `applySequencedSnapshot({...})` argument object:

```ts
applySequencedSnapshot({
  tiles: payload.session.tiles,
  lastOpSeq: payload.lastOpSeq,
  revision: payload.revision,   // NEW
})
```

Discrepancy references:
* Addresses DR-03 (App.tsx onSnapshot revision pass-through gap identified in plan validation)

Success criteria:
* TypeScript narrowing on `PlaceTileAck` and `RemoveTileAck` compiles without errors
* `applySequencedSnapshot` call in App.tsx compiles without errors after SequencedSnapshot.revision is required
* Existing server-side type usages of `PlaceTileAck` compile after server handler update (Step 1.3)

Context references:
* apps/server/src/contracts.ts (Lines 229-231) — PlaceTileAck
* apps/server/src/contracts.ts (Lines 253-254) — RemoveTileAck
* apps/server/src/contracts.ts (Lines 267-271) — SessionSnapshotPayload
* apps/client/src/App.tsx (Lines 86-94) — onSnapshot callback

Dependencies:
* Step 1.1 complete (OptimisticPlacementAck updated to accept newRevision)

---

### Step 1.3: Update server mutation handlers to return `newRevision` in acks

The server mutation handlers in `apps/server/src/index.ts` (lines 710, 776 as referenced in research) emit `PlaceTileAck` and `RemoveTileAck`. The authoritative canvas revision is already tracked in the DB schema (`canvases` table). The repository methods return `opSeq` after each transaction.

Determine how `revision` is sourced:
* If the repository already returns a `revision` or `canvasRevision` alongside `opSeq` on success, include it in the ack directly.
* If not, read `canvases.revision` after the transaction (within the same repository call or via a follow-up read inside the handler, keeping it consistent).

Files:
* apps/server/src/db/repository.ts — Extend `persistTilePlacement` and `persistTileRemoval` return types to include `newRevision`; source revision from post-commit canvas state
* apps/server/src/index.ts — Thread `newRevision` from repository result into place_tile and remove_tile ack payloads; include `revision` in session_snapshot emission

Changes:
1. **repository.ts — `persistTilePlacement`**: After the mutation transaction commits, read the updated canvas revision. If the `canvases` table has a `revision` column incremented by the transaction (verify schema), return it as `newRevision` alongside `opSeq`. If no revision column exists on the canvases table, use the allocated `opSeq` as the revision (monotonic, equivalent for Phase 1 purposes) and document this as a schema gap for follow-on work.
2. **repository.ts — `persistTileRemoval`**: Same pattern as placement.
3. **index.ts place_tile handler** (~line 710-730): The result from `persistTilePlacement` now includes `newRevision`. Pass it into the `PlaceTileAck` success object emitted via `invokeAckSafely`. The ack emission is approximately 14 lines after line 710 (~line 724).
4. **index.ts remove_tile handler** (~line 776-795): Same pattern as place_tile. Ack emission is approximately 14 lines after line 776 (~line 790).
5. **index.ts session_snapshot emission** (line ~638): Include `revision` from the snapshot DB query result in the `SessionSnapshotPayload`.

Discrepancy references:
* Addresses DR-04 (repository.ts not listed as explicit change target for newRevision — identified in plan validation)

Success criteria:
* `persistTilePlacement` and `persistTileRemoval` return `newRevision` in their result objects
* Server emits `newRevision` in place_tile and remove_tile acks
* Server emits `revision` in session_snapshot
* Existing server integration tests pass (index.integration.test.ts)

Context references:
* apps/server/src/index.ts (Lines 638) — session_snapshot emission on connect
* apps/server/src/index.ts (Lines 710) — persistTilePlacement call (persistence, not ack emission)
* apps/server/src/index.ts (Lines 776) — persistTileRemoval call (persistence, not ack emission)
* apps/server/src/db/repository.ts (Lines 559) — opSeq allocation in transaction

Dependencies:
* Step 1.2 complete (contracts updated with newRevision)

---

### Step 1.4: Wire `expectedRevision` into `place_tile` and `remove_tile` emissions in App.tsx

The `attemptPlace` function in App.tsx (lines ~220-255) emits `place_tile` with a `PlaceTilePayload` that today omits `expectedRevision`. `handleUndo` (lines ~257-275) emits `remove_tile` without `expectedRevision`. Both should pass `sequencedState.revision` as the precondition.

Files:
* apps/client/src/App.tsx — attemptPlace and handleUndo functions, plus the keydown undo handler (lines ~162-175 in onKeyDown)

Changes in App.tsx:

1. In `attemptPlace`: add `expectedRevision: sequencedState.revision` to the `PlaceTilePayload` object before `socket.emit('place_tile', ...)`.

2. In `handleUndo` and the `'z'` keydown handler: add `expectedRevision: sequencedState.revision` to the `RemoveTilePayload` object.

Note: `sequencedState` must be captured correctly in the closure. Both locations already close over `sequencedState` (it is in scope via state). Verify that the value is the current revision at the time of emission, not a stale closure value. If there is a stale closure risk in the keydown handler, read the revision from a ref instead.

Discrepancy references:
* Addresses core gap identified in research Key Discoveries → Critical gaps (expectedRevision missing)

Success criteria:
* Network tab confirms `expectedRevision` is present in outbound place_tile and remove_tile WS frames
* Server does not reject any previously accepted mutations (because `expectedRevision` remains optional server-side in Phase 1)

Context references:
* apps/client/src/App.tsx (Lines 220-255) — attemptPlace and place_tile emission
* apps/client/src/App.tsx (Lines 257-275) — handleUndo and remove_tile emission
* apps/server/src/contracts.ts (Lines 205-215) — PlaceTilePayload.expectedRevision definition

Dependencies:
* Step 1.1 (sequencedState now carries revision)
* Step 1.2 (contracts extended)

---

### Step 1.5: Update `reconcileOptimisticPlacementAck` to advance `revision` from `newRevision`

After Step 1.1, `OptimisticPlacementAck` carries `newRevision` on success. The `reconcileOptimisticPlacementAck` helper in controller.ts (lines 75-100) must use `ack.newRevision` to update `state.revision`.

Files:
* apps/client/src/interaction/controller.ts — reconcileOptimisticPlacementAck

Changes:
1. In the success branch (`!ack.rejected`): set `revision: ack.newRevision` in the returned state.
2. Also update `App.tsx` to pass the ack typed as `OptimisticPlacementAck` — verify the ack from the socket is cast/narrowed correctly before being passed to the reconciler. The raw `PlaceTileAck` from the server includes `newRevision`; pass it directly since the `OptimisticPlacementAck` shape now matches.

Also update remove_tile reconciliation path in App.tsx (the `handleUndo` and keydown undo callbacks): after a successful remove ack, advance `sequencedState.revision` to `ack.newRevision` using `reconcileSequencedTileRemoved` or an inline state update.

Success criteria:
* After each accepted placement, `sequencedState.revision` increments to match the server's canonical revision
* After each accepted removal, `sequencedState.revision` increments

Context references:
* apps/client/src/interaction/controller.ts (Lines 75-100) — reconcileOptimisticPlacementAck

Dependencies:
* Steps 1.1-1.4 complete

---

### Step 1.6: Add and update unit tests in controller.test.ts for revision progression

Files:
* apps/client/src/interaction/controller.test.ts — Add revision-related test cases

New test cases to add:
1. `applySequencedSnapshot` sets `revision` from snapshot payload.
2. `reconcileOptimisticPlacementAck` advances `revision` to `newRevision` on acceptance.
3. `reconcileOptimisticPlacementAck` leaves `revision` unchanged on rejection.
4. `createInitialSequencedTilesState` initializes `revision` to 0.

Success criteria:
* All new tests pass
* All existing tests continue to pass

Context references:
* apps/client/src/interaction/controller.test.ts — existing test structure

Dependencies:
* Steps 1.1-1.5 complete

---

## Implementation Phase 2: Explicit resync protocol

<!-- parallelizable: false -->

### Step 2.1: Add `resync_required` to `ServerToClientEvents` in contracts.ts

Files:
* apps/server/src/contracts.ts — ServerToClientEvents interface and ResyncRequiredPayload type

Changes:

1. Define a new payload type:

```ts
export type ResyncRequiredPayload = {
  /** The server's current authoritative opSeq at the time of the resync signal. */
  currentOpSeq: number
  reason: 'GAP_DETECTED' | 'REVISION_MISMATCH'
}
```

2. Add `resync_required` to `ServerToClientEvents`:

```ts
resync_required: (payload: ResyncRequiredPayload) => void
```

Success criteria:
* contracts.ts compiles without errors
* Both client and server TypeScript projects see the new event type

Context references:
* apps/server/src/contracts.ts (Lines 305-325) — ServerToClientEvents interface

Dependencies:
* Phase 1 complete

---

### Step 2.2: Emit `resync_required` from server

The server currently does not emit `resync_required`. Add emission points in `apps/server/src/index.ts` for cases where:
* A client-submitted mutation has `expectedRevision` but it does not match the current canvas revision (STALE_REVISION).
* Revision enforcement is added in Phase 2.

Files:
* apps/server/src/index.ts — place_tile and remove_tile handlers

Changes:
1. When a `STALE_REVISION` rejection occurs (or any gap-indicating condition), emit `resync_required` to the socket that sent the stale mutation, with the current `opSeq` and reason `'REVISION_MISMATCH'`.
2. Do not emit `resync_required` on `OVERLAP` or `OUT_OF_BOUNDS` rejections — these are geometry conflicts, not sequencing gaps.

Note: `resync_required` is targeted at the single socket (`socket.emit`), not the room, since it is a per-client correction signal.

Success criteria:
* A client sending a stale-revision mutation receives a `resync_required` event in addition to the rejected ack

Context references:
* apps/server/src/index.ts (Lines 710, 776) — mutation ack emission points

Dependencies:
* Step 2.1 complete

---

### Step 2.3: Subscribe to `resync_required` in `useSocketConnection.ts` and update `requestSnapshot` in App.tsx

Files:
* apps/client/src/network/useSocketConnection.ts — Subscribe to resync_required event
* apps/client/src/App.tsx — Replace disconnect/reconnect in requestSnapshot

Changes in useSocketConnection.ts:
1. Add `onResyncRequired` as a new callback parameter (analogous to `onSnapshot`, `onTilePlaced`, `onTileRemoved`).
2. Register `socket.on('resync_required', onResyncRequired)` and deregister on cleanup.

Changes in App.tsx:
1. `requestSnapshot` currently disconnects and reconnects (lines 77-83). Retain the disconnect/reconnect approach in Phase 2. The server sends `session_snapshot` automatically on every reconnect, so the existing mechanism correctly refreshes state. The `resync_required` handler simply calls `requestSnapshot()`, completing the loop without any new server-side event needed.
2. Add `onResyncRequired` callback: call `requestSnapshot()` and log the reason and `currentOpSeq` from the payload.

Design boundary note: Broadcast events (`tile_placed`, `tile_removed`) do not carry `revision`. A client that has received many broadcasts from other clients without making its own mutations will have an accurate `revision` (initialized from snapshot) but may be one or more mutations behind the server's current revision if those broadcasts occurred after the snapshot. When that client next places a tile, it sends `expectedRevision` from its snapshot-initialized value. If Phase 2 enforces `expectedRevision` as required, a `STALE_REVISION` rejection will trigger `resync_required`, causing a snapshot refresh and one extra round-trip. This is acceptable behavior for Phase 2. A future improvement would add `revision` to broadcast events (follow-on work candidate).

Net effect: `resync_required` from server → `onResyncRequired` in client → `requestSnapshot()` → socket disconnect/reconnect → `session_snapshot` → `applySequencedSnapshot` with fresh revision. This is the same end behavior as today but now event-driven rather than gap-polling-driven.

Success criteria:
* Client receiving `resync_required` triggers a snapshot refresh within one reconnect cycle
* No duplicate snapshot fetches for geometry-based rejections

Context references:
* apps/client/src/network/useSocketConnection.ts (Lines 22-56) — socket lifecycle and event registration
* apps/client/src/App.tsx (Lines 77-83) — requestSnapshot implementation

Dependencies:
* Steps 2.1-2.2 complete

---

### Step 2.4: Add two-client integration tests in apps/server/src/index.integration.test.ts

Files:
* apps/server/src/index.integration.test.ts — New multi-client test scenarios

New test cases:
1. **Two clients join same session, each receives same snapshot**: Connect client A and client B to the same `sessionId`. Assert both receive `session_snapshot` with identical `tiles` and `revision`.
2. **Client A places tile; client B receives broadcast**: Client A emits `place_tile` and gets ack. Assert `tile_placed` is received by Client B with matching `opSeq`.
3. **Concurrent placements on non-overlapping positions**: Client A and B emit `place_tile` simultaneously. Assert both acks are accepted (no overlap) and both clients converge on the same state after receiving broadcasts.
4. **Stale revision triggers resync_required**: Client A places a tile advancing revision. Client B (which hasn't received the broadcast yet) emits `place_tile` with the old `expectedRevision`. Assert Client B receives `resync_required`.

Implementation note: Use the same test socket utility pattern already present in `index.integration.test.ts` and `index.concurrency.test.ts`. Spin up two sockets authenticated to the same `sessionId` but different `clientId` values.

Success criteria:
* All four new integration tests pass
* Existing integration tests continue to pass

Context references:
* apps/server/src/index.integration.test.ts — existing socket client utility and session setup patterns
* apps/server/src/index.concurrency.test.ts — concurrent write test patterns

Dependencies:
* Steps 2.1-2.3 complete (resync_required event available to assert on)

---

## Implementation Phase 3: Per-author undo

<!-- parallelizable: false -->

> **PD-01 confirmed (Option A):** Undo removes the calling client's most recent tile by `clientId`.

### Step 3.1: Store `placedBy` on tiles in client state

`TilePlacedPayload` already carries `placedBy: string` (contracts.ts:273-277). The `TileInstance` type used in client state does not include `placedBy`. Extend the client-side tile representation so the rendering and undo layers can access it.

Files:
* apps/client/src/domain/placementSolver.ts — TileInstance type definition
* apps/client/src/interaction/controller.ts — reconcileSequencedTilePlaced to pass placedBy through

Changes:
1. Add `placedBy?: string` to `TileInstance` (or equivalent tile type in placementSolver.ts).
2. In `reconcileSequencedTilePlaced`, set `placedBy: payload.tile.placedBy` (or derive from `TilePlacedPayload.placedBy`) when merging the tile into state.
3. In `reconcileOptimisticPlacementAck`, set `placedBy: clientId` for the optimistic tile (passed as an additional parameter or sourced from a context variable).

Discrepancy references:
* Addresses DD-03 (per-author undo deferred pending PD-01)

Success criteria:
* Each tile in `sequencedState.tiles` carries `placedBy` after being received via broadcast or ack

Context references:
* apps/server/src/contracts.ts (Lines 273-277) — TilePlacedPayload.placedBy
* apps/client/src/interaction/controller.ts (Lines 102-121) — reconcileSequencedTilePlaced

Dependencies:
* Phase 1 and Phase 2 complete
* PD-01 confirmed as Option A

---

### Step 3.2: Update `handleUndo` in App.tsx to filter by `clientId`

Files:
* apps/client/src/App.tsx — handleUndo and keydown 'z' handler

Changes:
1. In `handleUndo` (lines ~257-275): change the `lastSettled` lookup from:
   ```ts
   [...sequencedState.tiles].reverse().find((tile) => isServerTileId(tile.id))
   ```
   to:
   ```ts
   [...sequencedState.tiles].reverse().find((tile) => isServerTileId(tile.id) && tile.placedBy === clientId)
   ```
2. Apply the same change to the `'z'` keydown handler (lines ~162-175).

Success criteria:
* Pressing undo only removes the current client's most recent tile
* Another client's tiles are not affected

Context references:
* apps/client/src/App.tsx (Lines 162-175) — keydown 'z' undo
* apps/client/src/App.tsx (Lines 257-275) — handleUndo

Dependencies:
* Step 3.1 complete

---

### Step 3.3: Update controller.test.ts for per-author undo behavior

Files:
* apps/client/src/interaction/controller.test.ts

New test cases:
1. Tiles with different `placedBy` values are correctly stored in state after reconciliation.
2. A find-by-clientId filter on tiles returns only the correct client's tile.

Success criteria:
* New tests pass

Context references:
* apps/client/src/interaction/controller.test.ts — existing test structure

Dependencies:
* Steps 3.1-3.2 complete

---

## Implementation Phase 4: Final validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Validation commands:
* `cd apps/client && npm run build` — TypeScript compilation
* `cd apps/client && npm test` — Unit tests (controller, placementSolver, tileGeometry)
* `cd apps/server && npm test` — Unit + integration + concurrency tests

### Step 4.2: Fix minor validation issues

Apply straightforward fixes for type errors, unused imports, or test assertion mismatches introduced during implementation phases. Document any non-trivial fixes here as they are discovered.

### Step 4.3: Report blocking issues

When validation failures require changes beyond minor corrections:
* Document affected files and error messages.
* Provide next steps and recommend additional planning rather than inline fixes.
* Do not attempt large-scale refactoring within this phase.

## Dependencies

* TypeScript 5.x (apps/client and apps/server)
* Socket.IO 4.x
* Vitest (test runner)
* Drizzle ORM + PostgreSQL

## Success Criteria

* All unit and integration tests pass across apps/client and apps/server
* apps/client TypeScript build completes without errors
* `sequencedState.revision` advances on every accepted ack
* `expectedRevision` is present in all outbound place_tile and remove_tile frames
* Two-client integration tests confirm broadcast ordering and resync behavior
