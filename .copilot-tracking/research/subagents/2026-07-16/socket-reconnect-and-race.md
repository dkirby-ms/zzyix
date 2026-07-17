# Research: Socket.IO Reconnection & Ack-vs-Broadcast Race

**Date:** 2026-07-16  
**Status:** Complete  
**Scope:** Socket.IO reconnection behavior, `session_snapshot` payload, and ack-vs-broadcast race condition

---

## Topic 1: Socket.IO client reconnection and `session_snapshot`

### Q1: Does the server always emit `session_snapshot` on EVERY new connection (including reconnects)?

**Answer: YES — unconditionally on every `connection` event, with no reconnect guard.**

Evidence from `apps/server/src/index.ts`:

- Line 383: `io.on('connection', (socket) => {`
- Line 467–473: `initializeConnection` is called on every `connection` event:
  ```ts
  const initializeConnection = async (): Promise<void> => {
    const joinedAt = Date.now()
    socket.join(sessionId)
    const connectionState = await initializeParticipantPresence(sessionId, clientId, joinedAt)
    ...
    socket.emit('session_snapshot', connectionState.snapshot)   // line 479
    socket.to(sessionId).emit('client_joined', ...)              // line 481
  }
  ```
- There is NO check like `if (socket.recovered)` or any reconnect guard before emitting the snapshot.

The connection middleware (lines 449–464) only validates `auth.sessionId` and `auth.clientId`. It does not tag the socket as a reconnect.

**Every connection — fresh or reconnect — triggers a full `session_snapshot` emission.** This is intentional; the comment in `contracts.ts` (line ~120) confirms: "Server sends `session_snapshot` on reconnect to sync any missed broadcasts."

---

### Q2: Does `socket.io-client` v4 have `connection_state_recovery` that might conflict?

**Answer: The feature exists in Socket.IO ≥ 4.6.0, but it is NOT enabled in this server.**

- Server version: `socket.io: ^4.8.2` (`apps/server/package.json`, line 27).
- `connection_state_recovery` must be explicitly enabled on the **server** with:
  ```ts
  const io = new Server(httpServer, { connectionStateRecovery: {} })
  ```
- Search result: `connectionStateRecovery` does NOT appear anywhere in `apps/server/src/index.ts`.
- The `io = new Server(...)` block (lines 400–410) only configures `cors` — no `connectionStateRecovery`.

**Conclusion: Connection state recovery is disabled. No conflict exists.** The server will always emit `session_snapshot`, and the client must treat every `session_snapshot` event as a full authoritative reset (replacing local state), not as an incremental update.

---

### Q3: What is the `session_snapshot` payload shape? Does it include `lastOpSeq`?

**Answer: YES, `session_snapshot` includes `lastOpSeq`.**

From `apps/server/src/contracts.ts`, lines 240–244:
```ts
export type SessionSnapshotPayload = {
  session: Session        // { id, tiles: TileInstance[], createdAt, updatedAt }
  clients: ClientPresence[]
  lastOpSeq: number       // ← present
}
```

The actual emitted object is built in `initializeParticipantPresence` (`apps/server/src/index.ts`, lines 226–248):
```ts
return {
  joinedClient,
  snapshot: {
    session: record.session,
    clients: record.clients,
    lastOpSeq: record.lastOpSeq,   // ← from DB replay record
  },
}
```

`lastOpSeq` comes from `loadSessionReplayRecord`, which reads the authoritative op counter from the database. This value is what the client must store as its own `lastOpSeq` after applying the snapshot.

The client-side `applySequencedSnapshot` in `apps/client/src/interaction/controller.ts` (lines 63–68) correctly handles this:
```ts
export const applySequencedSnapshot = (snapshot: SequencedSnapshot): SequencedTilesState => ({
  tiles: snapshot.tiles,
  lastOpSeq: snapshot.lastOpSeq,
  requiresSnapshot: false,
})
```

---

## Topic 2: The Ack-vs-Broadcast Race Condition

### Does `reconcileSequencedTilePlaced` correctly handle broadcast-before-ack?

**Answer: PARTIALLY — the opSeq dedup guard works, but leaves the temp tile as a duplicate.**

Code from `apps/client/src/interaction/controller.ts`, lines 71–95:
```ts
export const reconcileSequencedTilePlaced = (
  state: SequencedTilesState,
  payload: SequencedTilePlaced,
): SequencedTilesState => {
  if (payload.opSeq <= state.lastOpSeq) {
    return state                          // ← EARLY RETURN — no-op
  }

  if (payload.opSeq !== state.lastOpSeq + 1) {
    return { ...state, requiresSnapshot: true }
  }

  return {
    tiles: [...state.tiles.filter((tile) => tile.id !== payload.tile.id), payload.tile],
    lastOpSeq: payload.opSeq,
    requiresSnapshot: false,
  }
}
```

**Race scenario walkthrough:**

1. User clicks. Client adds temp tile with ID `"1720000000000-abc123"` (generated in `tryPlaceTile`, line 181: `` id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}` ``). `lastOpSeq = 4`.

2. Client emits `place_tile`. Server validates, assigns `opSeq = 5`, server tile ID = `"server-uuid-xxx"`.

3. **Broadcast arrives FIRST**: `tile_placed { tile: { id: "server-uuid-xxx", ... }, opSeq: 5 }`.
   - `reconcileSequencedTilePlaced` runs: `5 <= 4` is false → not early-returned.
   - `5 === 4 + 1` is true → full path executes.
   - `tiles.filter(t => t.id !== "server-uuid-xxx")` → keeps temp tile (temp ID ≠ server ID).
   - Appends server tile. State now has **both** temp tile + server tile.
   - `lastOpSeq = 5`.

4. **Ack arrives**: `{ placed: { id: "server-uuid-xxx", ... }, opSeq: 5, rejected: false }`.
   - If the ack handler calls `reconcileSequencedTilePlaced` with `opSeq: 5`:
     - `5 <= 5` is **true** → early return, **no state change**.
   - **The temp tile is NOT removed.** The server tile was already added by the broadcast. The array now contains a duplicate: temp tile + server tile for the same logical placement.

**The race is real.** The ack handler cannot use `reconcileSequencedTilePlaced` to remove the temp tile when the broadcast has already advanced `lastOpSeq` to `opSeq`. The ack handler must separately and unconditionally remove the temp tile by its temp ID, regardless of `opSeq`.

### Correct fix pattern for the ack handler

The ack handler needs to:
1. Remove the temp tile by its temp ID (always — regardless of whether the broadcast already arrived).
2. Only add the server tile if `lastOpSeq < opSeq` (i.e., broadcast has NOT already added it).
3. If rejected, simply remove the temp tile.

```ts
// Pseudocode for ack path
const handlePlaceTileAck = (tempId: string, ack: PlaceTileAck, state: SequencedTilesState) => {
  // Step 1: Remove temp tile unconditionally
  const withoutTemp = state.tiles.filter(t => t.id !== tempId)

  if (ack.rejected) {
    return { ...state, tiles: withoutTemp }
  }

  // Step 2: Add server tile only if broadcast hasn't already
  const alreadyPresent = withoutTemp.some(t => t.id === ack.placed.id)
  const tiles = alreadyPresent ? withoutTemp : [...withoutTemp, ack.placed]

  // Step 3: Advance lastOpSeq only if broadcast hasn't already
  const lastOpSeq = Math.max(state.lastOpSeq, ack.opSeq)

  return { ...state, tiles, lastOpSeq, requiresSnapshot: false }
}
```

---

## Topic 3: `tile_placed` sent to sender?

**Answer: YES — `io.to(sessionId)` is used, which INCLUDES the sender.**

Evidence from `apps/server/src/index.ts`, line 525:
```ts
io.to(sessionId).emit('tile_placed', result.event)
```

Contrast with `pointer_update` at line 572:
```ts
socket.to(sessionId).emit('pointer_update', ...)  // excludes sender
```

And `client_joined` at line 481:
```ts
socket.to(sessionId).emit('client_joined', ...)   // excludes sender
```

**The contracts comment (`apps/server/src/contracts.ts`, lines ~161–167) documents this explicitly:**
```
// Broadcast patterns:
//   tile_placed, tile_removed, client_joined, client_left
//     → io.to(sessionId).emit(...)          (all sockets in session room)
//   pointer_update
//     → socket.to(sessionId).emit(...)      (all sockets except sender)
```

Wait — the comment says `client_joined` uses `io.to(...)` but the code at line 481 uses `socket.to(...)`. **Minor documentation discrepancy** — the code is more authoritative. `client_joined` and `client_left` use `socket.to(sessionId)` (excluding sender), but `tile_placed` and `tile_removed` use `io.to(sessionId)` (including sender).

**Implication:** The placing client WILL receive its own `tile_placed` broadcast. `reconcileSequencedTilePlaced`'s opSeq guard (`if (payload.opSeq <= state.lastOpSeq) return state`) is the deduplication mechanism for the normal (non-race) case: after the ack swaps the temp tile and advances `lastOpSeq = N`, the arriving broadcast with `opSeq = N` hits `N <= N = true` and is safely discarded.

---

## Summary of Key Findings

| Topic | Finding |
|-------|---------|
| `session_snapshot` on reconnect | Always emitted — no reconnect guard. Correct and intentional. |
| `connection_state_recovery` | NOT configured. No conflict risk. |
| `session_snapshot.lastOpSeq` | Present (`SessionSnapshotPayload.lastOpSeq`). Client must store it. |
| Race: broadcast before ack | REAL race. Broadcast adds server tile; ack opSeq guard fires; temp tile becomes a stale duplicate. |
| Fix for ack handler | Must remove temp tile by temp ID unconditionally, then check if server tile already present before adding. |
| `tile_placed` includes sender | YES (`io.to(sessionId)`). The opSeq guard in `reconcileSequencedTilePlaced` is the correct dedup path for the non-race case. |
| `tile_placed` dedup guard correctness | Works for non-race case. Fails to clean up temp tile in race case — separate ack temp-removal logic required. |

---

## Edge Cases and Corrections to the Original Analysis

1. **Correction to contracts.ts comment**: The file comment states `client_joined` uses `io.to(sessionId)`, but the code uses `socket.to(sessionId)`. The code is authoritative. Only `tile_placed` and `tile_removed` go to all participants including sender.

2. **`tryPlaceTile` temp ID format**: The temp ID is NOT a UUID — it is `"${Date.now()}-${hex}"` (line 181 of controller.ts). This guarantees it will never collide with a server-assigned UUID, making the filter-by-ID approach in `reconcileSequencedTilePlaced` safe.

3. **The opSeq guard is still valuable for `tile_placed` to sender**: In the NORMAL (non-race) path, the ack arrives first: ack handler sets `lastOpSeq = N`, then broadcast arrives with `opSeq = N`, guard fires, no duplicate. The race condition only creates problems with temp tile cleanup — not with server tile deduplication.

4. **`requiresSnapshot` gap detection**: If any `tile_placed` event arrives with `opSeq !== lastOpSeq + 1`, the client sets `requiresSnapshot: true`. The integration layer must watch for this flag and re-request `session_snapshot` (or the server must proactively push one). No such re-request mechanism is implemented on the client yet.

5. **No `socket.io-client` dependency yet**: The client `package.json` has no `socket.io-client` entry. All socket integration work requires adding the dependency before any socket code can be written.
