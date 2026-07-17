<!-- markdownlint-disable-file -->
# Task Research: Client-Server Integration (Issue #12)

Integrate the React/WebGL client with the authoritative Socket.IO server so that local tile operations are optimistic, reconciled against server acknowledgements, and rebased after remote broadcasts.

## Task Implementation Requests

* Apply local operations optimistically in the React client (show immediately, resolve against server ack).
* Handle `place_tile` ack outcomes: accepted (replace temp tile with server tile), rejected (remove temp tile + UI feedback).
* Handle incoming `tile_placed` / `tile_removed` broadcasts from other clients via `reconcileSequencedTilePlaced` / `reconcileSequencedTileRemoved`.
* Rebase pending local operations after remote updates (sequence-gap detection already in controller.ts).
* Provide session lifecycle management (create/join session, connect socket, reconnect).
* Cover failure and rollback paths in tests.

## Scope and Success Criteria

* Scope: `apps/client/` only. The server is complete and authoritative. No server changes expected.
* Assumptions:
  * `socket.io-client` must be added as a client dependency.
  * The server's `contracts.ts` is importable by the client (path alias or relative import).
  * `TileInstance` on the client carries an optional `settleFrom` field for animation; server's `TileInstance` does not — the client extends the server type.
  * A single session is used per browser session for now; multi-session UI is out of scope.
* Success Criteria:
  * Placing a tile sends `place_tile` to server; tile appears immediately (optimistic); on ack the temp ID is replaced with the server UUID.
  * Rejected placements remove the optimistic tile and trigger the existing `invalidPulse` feedback.
  * Incoming `tile_placed` / `tile_removed` from peers update local state via the sequenced reconciler.
  * `session_snapshot` on connect/reconnect resets `SequencedTilesState` via `applySequencedSnapshot`.
  * Undo sends `remove_tile` to server (no more local-only `tiles.slice(0, -1)`).
  * `requiresSnapshot: true` on a reconciler call triggers a re-sync request.
  * Tests cover: optimistic accept, optimistic reject, peer broadcast reconciliation, reconnect snapshot application, undo via remove_tile.

## Outline

1. Dependency: add `socket.io-client` to `apps/client/package.json`.
2. Session bootstrap: create or join session via REST (`POST /sessions` or `GET /sessions/:id`).
3. Socket connection hook: connect with `{ sessionId, clientId }` in auth; handle `session_snapshot`.
4. `SequencedTilesState` store: replace bare `TileInstance[]` state in `App.tsx` with sequenced state.
5. Optimistic placement: generate a temp tile immediately; on ack swap or remove.
6. Broadcast listeners: `tile_placed`, `tile_removed` events drive `reconcileSequenced*` calls.
7. Undo integration: `remove_tile` socket event instead of local splice.
8. Gap recovery: when `requiresSnapshot: true`, emit `session_snapshot` re-request (reconnect strategy).
9. Pointer sharing: `pointer_move` emit on pointer update (fire-and-forget).
10. Tests for all reconciliation and failure paths.

## Potential Next Research

* How `socket.io-client` reconnection interacts with ACA sticky-session requirements.
  * Reasoning: ACA session affinity ensures reconnects land on the same replica.
  * Reference: `docs/decisions/2026-07-15-deployment-architecture-v01.md` — sticky sessions section.
* Whether the client should import types directly from `apps/server/src/contracts.ts` or maintain local copies.
  * Reasoning: Shared monorepo — direct relative imports are simpler; separate package adds overhead.
  * Reference: `apps/client/src/interaction/controller.ts` already defines `SequencedSnapshot`, `SequencedTilePlaced`, `SequencedTileRemoved` — these mirror server contract types.

## Research Executed

### Subagent Findings

#### Subagent 1: Socket reconnect and race condition
Source: `.copilot-tracking/research/subagents/2026-07-16/socket-reconnect-and-race.md`

* **`session_snapshot` always sent on reconnect** (`index.ts` line 479): `initializeConnection` runs unconditionally on every `connection` event. No `socket.recovered` guard. `connection_state_recovery` is NOT enabled on the server. Clean.
* **Ack-vs-broadcast race is REAL and CRITICAL:** Temp tile IDs are `"${Date.now()}-${hex}"` (controller.ts line 181), not UUIDs. `reconcileSequencedTilePlaced` adds the server tile by UUID and never touches the temp tile. When the broadcast arrives first:
  1. Broadcast at `opSeq=N` → server UUID tile added, temp tile remains (duplicate), `lastOpSeq=N`.
  2. Ack arrives with `opSeq: N` → `N <= N` dedup guard fires → no-op. **Temp tile is never cleaned up.**
  * **Fix:** The ack handler must unconditionally remove the temp tile by its temp ID (not depend on the reconciler). See corrected ack handler in Scenario A.
* **`io.to(sessionId)` includes sender** (line 525): `tile_placed` IS sent back to the placing client. The opSeq guard handles the normal path; the ack handler handles the race path.

#### Subagent 2: TileInstance type and store design
Source: `.copilot-tracking/research/subagents/2026-07-16/tiletype-and-store.md`

* **`settleFrom` is optional** (`placementSolver.ts` line 20: `settleFrom?: Transform2D`). The renderer (`MosaicScene.tsx` line 82) uses `tile.settleFrom ?? tile.transform` — no crash when absent. Server tiles can be passed directly to the renderer.
* **React useState is correct** — no zustand needed. Existing keyboard handlers already use functional update form `setTiles(prev => ...)`, which works from socket callbacks.
* **No Vite proxy needed** — use `VITE_SERVER_URL=http://localhost:3001` in `.env.local`; `socket.io-client` connects directly.
* `MaterialVariant` on server (`contracts.ts`) is `'ceramic' | 'glass' | 'stone'` — matches client type exactly.

### File Analysis

* `apps/server/src/contracts.ts`
  * Lines 1–330: Complete source of truth — typed event maps, payload types, error codes, formal agreement section.
  * Server commits to: assigning tile IDs, validating all placements, broadcasting `tile_placed` / `tile_removed` / `pointer_update` to room.
  * Client commits to: optimistic placement, ack-based reconciliation, snapshot merge on reconnect, all error code handling.
  * `SCHEMA_VERSION = '1.0.0'` — client must verify on connect.
  * Error scenario documentation at lines 88–138: explicit guidance for PLACEMENT_REJECTED, SESSION_NOT_FOUND, TILE_NOT_FOUND, disconnect/reconnect, INVALID_REQUEST, INTERNAL_ERROR.

* `apps/server/src/index.ts`
  * Lines 460–600: Complete Socket.IO event handlers.
  * `io.on('connection')` → `initializeConnection`: joins room, calls `initializeParticipantPresence`, emits `session_snapshot` to connecting socket, broadcasts `client_joined` to room.
  * `place_tile` handler: validates payload, calls `persistTilePlacement`, emits ack, broadcasts `io.to(sessionId).emit('tile_placed', result.event)`.
  * `remove_tile` handler: validates, calls `persistTileRemoval`, emits ack, broadcasts `io.to(sessionId).emit('tile_removed', result.event)`.
  * `pointer_move`: broadcasts `pointer_update` to room except sender.
  * `disconnect`: calls `finalizeParticipantPresence`, broadcasts `client_left`.
  * Connection middleware (lines 456–470): validates `auth.sessionId` and `auth.clientId`; returns error if missing.

* `apps/client/src/interaction/controller.ts`
  * Lines 1–200: Already contains full reconciliation infrastructure.
  * `SequencedSnapshot`, `SequencedTilePlaced`, `SequencedTileRemoved`, `SequencedTilesState` — typed at lines 8–28.
  * `createInitialSequencedTilesState()` — initial state factory.
  * `applySequencedSnapshot(snapshot)` — resets state from server snapshot.
  * `reconcileSequencedTilePlaced(state, payload)` — handles opSeq ordering, gap detection (sets `requiresSnapshot: true`), deduplication.
  * `reconcileSequencedTileRemoved(state, payload)` — same pattern.
  * `tryPlaceTile` at line 183: generates client-side temp ID (`${Date.now()}-${random}`). **This must be replaced with a two-phase approach: emit optimistically with temp ID, then swap on ack.**

* `apps/client/src/App.tsx`
  * Lines 1–160: **No Socket.IO connection.** Uses bare `useState<TileInstance[]>([])` — fully local state.
  * `attemptPlace()` at line 110: calls `tryPlaceTile`, adds to local state. **Must become optimistic + socket emit.**
  * Undo at line 82 (keyboard) and line 146 (ControlsPanel): `setTiles(prev => prev.slice(0, -1))` — local only. **Must become `remove_tile` socket event.**
  * Clear at line 147: `setTiles([])` — for multi-tile clear, needs consideration (server has no bulk-clear event; would require sequential `remove_tile` calls or a new event).

* `apps/client/package.json`
  * Lines 1–40: `socket.io-client` is **NOT** listed in dependencies. Must be added.
  * `zustand` v5 is already present — suitable for the socket/session store.

* `apps/client/src/interaction/controller.test.ts`
  * Lines 1–80: Tests cover ghost easing, accept/reject, and sequenced reconciliation. Good baseline; new tests needed for socket integration behavior.

### Code Search Results

* `TileInstance` type definition — client vs server:
  * Server (`contracts.ts` line 48): `{ id, shape, color, material, transform, createdAt }`
  * Client (`placementSolver.ts`): same fields + `settleFrom?: Transform2D` for animation
  * Client controller returns `settleFrom` in `tryPlaceTile` result
  * **Pattern**: client's `TileInstance` extends the server's; `settleFrom` is stripped before emitting to server.

* Existing reconciler type mirror:
  * `SequencedSnapshot` in `controller.ts` = `{ tiles: TileInstance[], lastOpSeq: number }` — matches `SessionSnapshotPayload` minus `clients`
  * These are local mirror types, not imported from server. Consistent with monorepo boundary.

### Project Conventions

* Standards referenced: `apps/server/src/contracts.ts` formal agreement (lines 300–330).
* Instructions followed: Formal agreement section documents both team commitments; client integration must fulfill client-side commitments fully.

## Key Discoveries

### Project Structure

The codebase is a monorepo with `apps/client` (Vite + React + R3F) and `apps/server` (Express + Socket.IO + Postgres). The server is **production-ready and complete**. The client is a standalone local-only app with all domain logic, rendering, and interaction implemented, but no network layer.

The `contracts.ts` file at `apps/server/src/contracts.ts` is the single source of truth for the client-server protocol. The client team is expected to import types from it directly (monorepo relative imports).

### Implementation Patterns

**Controller.ts has reconciliation infrastructure but no network layer.** The client's controller.ts defines:
- `SequencedTilesState` — the sequenced state model
- `reconcileSequencedTilePlaced` / `reconcileSequencedTileRemoved` — pure functions, ready to use
- `applySequencedSnapshot` — ready to use on connect/reconnect
- `tryPlaceTile` — returns a tile with client-generated temp ID; this is the optimistic tile

**Two-phase tile placement flow (what needs to be built):**
```
1. User clicks → tryPlaceTile() → temp tile (client UUID or timestamp-ID)
2. setTiles(prev => [...prev, tempTile])  ← optimistic add
3. socket.emit('place_tile', payload, ack => {
     if (ack.rejected) {
       setTiles(prev => prev.filter(t => t.id !== tempTile.id))  ← rollback
       triggerInvalidPulse()
     } else {
       setTiles(prev => prev.map(t =>
         t.id === tempTile.id
           ? { ...ack.placed, settleFrom: tempTile.settleFrom }  ← swap with server tile, preserve animation
           : t
       ))
     }
   })
```

**Broadcast reconciliation — tile_placed event:**
```
socket.on('tile_placed', (payload: TilePlacedPayload) => {
  // Skip if this is a tile we already placed (ack already handled it)
  // reconcile via sequenced state
  setSequencedState(prev => reconcileSequencedTilePlaced(prev, {
    tile: payload.tile,
    opSeq: payload.opSeq,
  }))
})
```

**Gap recovery (`requiresSnapshot: true`):**
The reconciler flags this when `payload.opSeq !== state.lastOpSeq + 1`. Recovery = request a fresh snapshot. Simplest approach: reconnect the socket (server sends `session_snapshot` on every connection). More advanced: a dedicated `request_snapshot` event (not in current server contract — would require server change).

**Undo via remove_tile:**
```
// Currently: setTiles(prev => prev.slice(0, -1))
// Needs to be:
const lastTile = tiles[tiles.length - 1]
if (lastTile?.id && isServerTileId(lastTile.id)) {  // only if settled (not pending)
  socket.emit('remove_tile', { tileId: lastTile.id }, ack => {
    // ack.removed may be false if already removed by peer — reconcile
  })
}
```

### Complete Examples

**Socket connection hook (new file: `apps/client/src/network/useSocketConnection.ts`):**
```typescript
import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '../../../server/src/contracts'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export const useSocketConnection = (
  serverUrl: string,
  sessionId: string,
  clientId: string,
  onSnapshot: (payload: SessionSnapshotPayload) => void,
  onTilePlaced: (payload: TilePlacedPayload) => void,
  onTileRemoved: (payload: TileRemovedPayload) => void,
): AppSocket | null => {
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    const socket: AppSocket = io(serverUrl, {
      auth: { sessionId, clientId },
    })

    socket.on('session_snapshot', onSnapshot)
    socket.on('tile_placed', onTilePlaced)
    socket.on('tile_removed', onTileRemoved)

    socketRef.current = socket
    return () => { socket.disconnect() }
  }, [serverUrl, sessionId, clientId])

  return socketRef.current
}
```

**Session bootstrap (new file: `apps/client/src/network/session.ts`):**
```typescript
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const ensureSession = async (): Promise<string> => {
  const stored = sessionStorage.getItem('zzyix_session_id')
  if (stored) return stored

  const res = await fetch(`${SERVER_URL}/sessions`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create session')
  const data = await res.json() as { session: { id: string } }
  sessionStorage.setItem('zzyix_session_id', data.session.id)
  return data.session.id
}

export const ensureClientId = (): string => {
  const stored = localStorage.getItem('zzyix_client_id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('zzyix_client_id', id)
  return id
}
```

**Optimistic place in App.tsx:**
```typescript
const attemptPlace = (): void => {
  const result = tryPlaceTile(activeTile, ghost, sequencedState.tiles)
  if (!result.placed) {
    triggerInvalidPulse()
    return
  }

  const tempTile = result.placed  // has client-generated temp ID + settleFrom

  // Optimistic add
  setSequencedState(prev => ({
    ...prev,
    tiles: [...prev.tiles, tempTile],
  }))

  const payload: PlaceTilePayload = {
    shape: tempTile.shape,
    color: tempTile.color,
    material: tempTile.material,
    transform: tempTile.transform,
  }

  socket.emit('place_tile', payload, (ack) => {
    if (ack.rejected) {
      // Rollback
      setSequencedState(prev => ({
        ...prev,
        tiles: prev.tiles.filter(t => t.id !== tempTile.id),
      }))
      triggerInvalidPulse()
    } else {
      // Swap temp ID → server ID, preserve settleFrom for animation
      setSequencedState(prev => ({
        ...prev,
        tiles: prev.tiles.map(t =>
          t.id === tempTile.id
            ? { ...ack.placed, settleFrom: tempTile.settleFrom }
            : t
        ),
        lastOpSeq: ack.opSeq,
      }))
    }
  })
}
```

### API and Schema Documentation

**Server event contracts (from `apps/server/src/contracts.ts`):**

| Direction | Event | Payload | Notes |
|-----------|-------|---------|-------|
| C→S | `place_tile` | `PlaceTilePayload` + ack | Server assigns ID; returns `PlaceTileAck` |
| C→S | `remove_tile` | `RemoveTilePayload` + ack | By server UUID; returns `RemoveTileAck` |
| C→S | `pointer_move` | `PointerMovePayload` | Fire-and-forget |
| S→C | `session_snapshot` | `SessionSnapshotPayload` | On connect + reconnect |
| S→C | `tile_placed` | `TilePlacedPayload` | Broadcast to all in room (including sender) |
| S→C | `tile_removed` | `TileRemovedPayload` | Broadcast to all in room (including sender) |
| S→C | `pointer_update` | `PointerUpdatePayload` | All except sender |
| S→C | `client_joined` | `ClientJoinedPayload` | All in room |
| S→C | `client_left` | `ClientLeftPayload` | All in room |

**PlaceTileAck variants:**
```typescript
type PlaceTileAck =
  | { placed: TileInstance; rejected: false; opSeq: number }   // accepted
  | { placed: null; rejected: true; reason: PlaceTileRejectReason }  // rejected
```

**Connection auth (socket.handshake.auth):**
```typescript
type ConnectionAuth = { sessionId: string; clientId: string }
```

### Configuration Examples

```
# apps/client/.env (local dev)
VITE_SERVER_URL=http://localhost:3001
```

## Technical Scenarios

### Scenario A: Optimistic Placement with Temp-ID Swap

**Description:** User places a tile; it appears immediately with a client-generated temp ID. On ack, the temp ID is replaced with the server's UUID. If rejected, the tile is removed and the pulse feedback fires.

**Requirements:**
* `tryPlaceTile` continues to generate a temp tile with `settleFrom` (animation metadata).
* The socket `place_tile` emit must happen in the same callsite as the optimistic state update.
* Ack callback swaps the tile; the `settleFrom` is preserved from the temp tile (server doesn't know it).
* `tile_placed` broadcast from server will arrive after the ack. The reconciler deduplicates by checking `opSeq <= state.lastOpSeq`.

**Preferred Approach:** Two-phase optimistic update in `App.tsx` as shown in the Complete Examples section above. The `reconcileSequencedTilePlaced` deduplication (`if (payload.opSeq <= state.lastOpSeq) return state`) prevents double-application when the broadcast arrives after the ack swap.

```text
apps/client/src/
  network/
    session.ts          (new — session bootstrap, create/join REST calls)
    useSocketConnection.ts  (new — socket connection hook)
  App.tsx               (updated — socket integration, sequenced state)
  interaction/
    controller.ts       (minor — tryPlaceTile ID generation can stay; no change needed)
```

**Implementation Details:**

The critical ordering concern: the server broadcasts `tile_placed` to ALL sockets including the sender. When the ack arrives and the client swaps the temp tile with `lastOpSeq = ack.opSeq`, the subsequent `tile_placed` broadcast with the same `opSeq` will be dropped by `reconcileSequencedTilePlaced` (opSeq ≤ state.lastOpSeq). This is correct and expected behavior.

**Pitfall:** If the ack swap updates `lastOpSeq` but the broadcast arrives first (before ack), the broadcast will be applied normally, and then the ack will try to swap a tile that already has the server ID. The ack callback must check whether the temp tile still exists before swapping.

**Corrected ack handler (fixes race condition):**
```typescript
// CRITICAL: unconditionally remove temp tile first; reconciler never touches it (different ID format)
socket.emit('place_tile', payload, (ack) => {
  if (ack.rejected) {
    setSequencedState(prev => ({
      ...prev,
      tiles: prev.tiles.filter(t => t.id !== tempTile.id),
    }))
    triggerInvalidPulse()
  } else {
    setSequencedState(prev => {
      // Always strip the temp tile (race: broadcast may have already added the server tile)
      const withoutTemp = prev.tiles.filter(t => t.id !== tempTile.id)
      const alreadyPresent = withoutTemp.some(t => t.id === ack.placed.id)
      if (alreadyPresent) {
        // Broadcast arrived first — server tile is already there; just advance opSeq
        return { ...prev, tiles: withoutTemp, lastOpSeq: Math.max(prev.lastOpSeq, ack.opSeq) }
      }
      return {
        ...prev,
        tiles: [...withoutTemp, { ...ack.placed, settleFrom: tempTile.settleFrom }],
        lastOpSeq: Math.max(prev.lastOpSeq, ack.opSeq),
      }
    })
  }
})
```

#### Considered Alternatives

**Alt A: No optimistic placement (wait for ack):** Simpler but latency is visible; poor UX for local single-user use. Rejected: issue explicitly requires optimistic local edits.

**Alt B: Temp tile uses `crypto.randomUUID()`:** More collision-safe than timestamp+random. Acceptable alternative to current `tryPlaceTile` approach — either works since the ID is only used locally until swapped.

---

### Scenario B: Session Lifecycle and Socket Connection

**Description:** On app load, the client creates or retrieves a session, generates/retrieves a stable client ID, and connects the socket. On `session_snapshot`, the client calls `applySequencedSnapshot` to initialize state.

**Requirements:**
* `sessionId` persisted in `sessionStorage` (tab-scoped, so each tab gets its own session or rejoins).
* `clientId` persisted in `localStorage` (stable across tabs/refreshes for the same user).
* REST `POST /sessions` creates a new session; `GET /sessions/:id` loads existing.
* Socket auth passes both IDs; server middleware validates them.

**Preferred Approach:** A `network/session.ts` module for REST bootstrap, and a React hook `useSocketConnection` for the socket lifecycle. `App.tsx` uses a `useEffect` to bootstrap session on mount.

**Gap recovery via reconnect:** When `requiresSnapshot: true` is set by the reconciler, the client should call `socket.disconnect()` then `socket.connect()` — the server re-emits `session_snapshot` on every new connection. This avoids adding a new server event.

#### Considered Alternatives

**Alt A: Single shared session (hardcoded ID):** Much simpler for demo scenarios but breaks multi-user collaboration. Rejected: issue requires proper session integration.

**Alt B: URL-based session ID:** `?session=<id>` in the URL. Better for sharing, but out of scope per issue — ControlsPanel has no session UI. Can be layered on later.

---

### Scenario C: Undo via `remove_tile`

**Description:** The undo action currently splices the last tile locally. With server authority, it must send `remove_tile` with the server-assigned tile ID.

**Requirements:**
* Undo is only valid for tiles that have been confirmed by the server (have a server UUID, not a temp ID).
* Pending (optimistic) tiles cannot be removed via `remove_tile` because the server doesn't know about them yet.
* On ack `removed: false`, the client should reconcile against the latest broadcast (tile may already be gone).

**Preferred Approach:**
```typescript
const handleUndo = (): void => {
  // Find last settled (non-pending) tile
  const lastSettled = [...sequencedState.tiles].reverse().find(t => isServerTileId(t.id))
  if (!lastSettled) return

  socket.emit('remove_tile', { tileId: lastSettled.id }, (ack) => {
    if (!ack.removed) {
      // Reconcile: the tile may have been removed by a peer — request snapshot
      socket.disconnect(); socket.connect()
    }
  })
}

// isServerTileId: UUID format check (no timestamp prefix)
const isServerTileId = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
```

**Clear all:** Requires sequential `remove_tile` for each tile; no bulk-clear event exists in the server contract. For now, `onClear` should be removed from `ControlsPanel` or disabled when connected.

#### Considered Alternatives

**Alt A: Keep local undo for optimistic tiles, server undo for settled tiles:** More nuanced; allows undoing mid-flight placements. Complex; deferred to a follow-up.

---

### Scenario D: Broadcast Reconciliation from Peers

**Description:** When another client places or removes a tile, the server broadcasts `tile_placed` / `tile_removed` to all room members. The receiving client must apply these via the sequenced reconciler.

**Requirements:**
* `tile_placed` handler calls `reconcileSequencedTilePlaced`.
* `tile_removed` handler calls `reconcileSequencedTileRemoved`.
* Both handlers set state via `setSequencedState`.
* When `requiresSnapshot: true` after reconciliation, trigger reconnect for fresh snapshot.

**Preferred Approach:**
```typescript
socket.on('tile_placed', (payload) => {
  setSequencedState(prev => {
    const next = reconcileSequencedTilePlaced(prev, {
      tile: payload.tile,
      opSeq: payload.opSeq,
    })
    if (next.requiresSnapshot) {
      // Trigger reconnect on next render cycle
      setTimeout(() => { socket.disconnect(); socket.connect() }, 0)
    }
    return next
  })
})

socket.on('tile_removed', (payload) => {
  setSequencedState(prev => {
    const next = reconcileSequencedTileRemoved(prev, {
      tileId: payload.tileId,
      opSeq: payload.opSeq,
    })
    if (next.requiresSnapshot) {
      setTimeout(() => { socket.disconnect(); socket.connect() }, 0)
    }
    return next
  })
})
```

**Note:** Incoming `tile_placed` tiles from peers have no `settleFrom`. The rendering layer must handle tiles without `settleFrom` gracefully (animate from a default position or skip the settle animation).

---

## Testing Strategy

New test coverage needed (in `apps/client/src/interaction/controller.test.ts` and/or a new `App.test.tsx`):

| Test | Description |
|------|-------------|
| Optimistic accept | Temp tile replaced with server tile on accepted ack |
| Optimistic reject | Temp tile removed + `invalidPulse` on rejected ack |
| Broadcast dedup | `tile_placed` with `opSeq ≤ lastOpSeq` is a no-op |
| Snapshot reset | `applySequencedSnapshot` resets all tiles and `lastOpSeq` |
| Gap detection | `tile_placed` with `opSeq !== lastOpSeq + 1` sets `requiresSnapshot` |
| Undo settled | `remove_tile` emitted with server UUID |
| Undo pending | Undo of pending tile is a no-op (no server ID yet) |

Existing tests in `controller.test.ts` cover reconciler pure functions — they remain valid. New integration tests should mock the socket with a simple stub.

## Selected Approach: Phased Integration

**Phase 1 — Foundation (new files):**
1. Add `socket.io-client` to `apps/client/package.json`.
2. Create `apps/client/src/network/session.ts` — `ensureSession()` and `ensureClientId()`.
3. Create `apps/client/src/network/useSocketConnection.ts` — socket hook with typed events.
4. Add `VITE_SERVER_URL` to `.env` and `.env.example`.

**Phase 2 — App.tsx integration:**
1. Replace `useState<TileInstance[]>` with `useState<SequencedTilesState>` initialized via `createInitialSequencedTilesState()`.
2. Add socket bootstrap in `useEffect` on mount (session + socket connect).
3. Wire `session_snapshot` → `applySequencedSnapshot`.
4. Replace `attemptPlace` with two-phase optimistic place.
5. Wire `tile_placed` / `tile_removed` broadcast handlers.
6. Replace undo/clear with `remove_tile` socket calls.

**Phase 3 — Tests:**
1. Extend `controller.test.ts` with socket interaction stubs.
2. Cover all reconciliation and failure paths in the testing strategy table above.

**Rationale:** This phased approach isolates network concerns in `network/`, keeps the controller pure-function (no side effects), and minimizes changes to the existing ghost/render pipeline. The server contract is already fully defined — no server changes are needed.
