<!-- markdownlint-disable-file -->
# Socket.IO Realtime Transport Layer — Research

Research for Issue #11: completing the realtime transport layer for the zzyix collaborative mosaic canvas.

---

## Source Files Analysed

- `apps/server/src/contracts.ts` — full event contracts, typed event maps, SocketData, ConnectionAuth
- `apps/server/src/index.ts` — current server implementation (complete)
- `apps/server/src/index.test.ts` — unit test patterns
- `apps/server/src/index.integration.test.ts` — snapshot/reconnect tests
- `apps/server/src/index.concurrency.test.ts` — concurrency/first-write-wins tests
- `apps/server/package.json` — socket.io@4.8.2
- `docs/decisions/2026-07-15-deployment-architecture-v01.md` — ACA deployment with sticky sessions, 1–3 replicas

---

## Research Questions & Findings

---

### Q1: op_seq ordering — how to include sequence numbers so clients can detect missed ops

#### Current State

`AuthoritativeSessionState` already has `lastOpSeq: number` (index.ts lines 24–29):

```typescript
type AuthoritativeSessionState = {
  session: Session
  clients: Map<string, ClientPresence>
  lastOpSeq: number
}
```

`nextOpSeq` increments it per operation (line 130 area), and both `applyPlaceTile` and `applyRemoveTile` return `opSeq` in their result objects. The unit tests in `index.concurrency.test.ts` assert on `opSeq` values.

**Gap:** `opSeq` is computed server-side but is NOT included in broadcast events (`TilePlacedPayload`, `TileRemovedPayload`) in `contracts.ts`. It is also not included in `PlaceTileAck` or `RemoveTileAck`.

#### Recommended Pattern: Include `opSeq` in both acks and broadcasts

**Step 1 — Extend contracts.ts payloads:**

```typescript
// In contracts.ts — add opSeq to broadcast payloads
export type TilePlacedPayload = {
  tile: TileInstance
  placedBy: string
  opSeq: number          // ← add
}

export type TileRemovedPayload = {
  tileId: string
  removedBy: string
  opSeq: number          // ← add
}

// Extend acks so the placing client knows its sequence number too
export type PlaceTileAck =
  | { placed: TileInstance; rejected: false; opSeq: number }
  | { placed: null; rejected: true; reason: PlaceTileRejectReason; opSeq: number }

export type RemoveTileAck = {
  removed: boolean
  opSeq: number          // ← add
}
```

**Step 2 — Propagate from index.ts domain functions (already return opSeq):**

In `applyPlaceTile` (index.ts ~line 175), the returned `ack` must include `opSeq`:

```typescript
// applyPlaceTile — already returns { opSeq, ack, event? }
// Wire opSeq into ack:
return {
  opSeq,
  ack: {
    placed: tile,
    rejected: false,
    opSeq,          // ← add
  },
  event: {
    tile,
    placedBy,
    opSeq,          // ← add to broadcast payload
  },
}
```

**Step 3 — Client-side gap detection:**

The client tracks `lastKnownOpSeq`. On each `tile_placed` / `tile_removed` broadcast:

```typescript
// Client pseudocode
socket.on('tile_placed', (payload) => {
  const expected = lastKnownOpSeq + 1
  if (payload.opSeq === expected) {
    lastKnownOpSeq = payload.opSeq
    applyTilePlaced(payload)
  } else {
    // gap detected — request full snapshot
    socket.emit('request_snapshot')  // or simply reconnect to trigger session_snapshot
  }
})
```

**Gap detection strategy for zzyix:** Because the server sends a full `session_snapshot` on every `connection` event, the simplest recovery strategy is to reconnect when a gap is detected. The client's last known `opSeq` can be compared on reconnect to determine whether the snapshot covers everything needed.

**Key insight:** The `opSeq` counter never resets between reconnects (it's per-session, not per-socket). The server stores `lastOpSeq` in `AuthoritativeSessionState` which persists in the `sessions` Map across reconnects for the same `sessionId`. This means a client that reconnects and receives `session_snapshot` can use the tile count and last seen `opSeq` to verify it is fully caught up.

**For 1–3 replica ACA with sticky sessions:** Because sticky sessions ensure a client always hits the same replica, and the `sessions` Map is in-memory per process, there is no cross-replica `opSeq` synchronisation problem in single-replica mode. In multi-replica mode with a Postgres or Redis adapter, `opSeq` is local to each replica — the snapshot approach (always send full state on reconnect) is the safe choice.

---

### Q2: Ack callback signature for place/remove operations

#### Socket.IO 4.x TypeScript ack contract

The typed event map in `contracts.ts` already follows the correct pattern:

```typescript
// contracts.ts — already correct
export interface ClientToServerEvents {
  place_tile: (payload: PlaceTilePayload, ack: (response: PlaceTileAck) => void) => void
  remove_tile: (payload: RemoveTilePayload, ack: (response: RemoveTileAck) => void) => void
  pointer_move: (payload: PointerMovePayload) => void
}
```

Socket.IO 4.x types the ack callback as the **last argument** in the handler function signature. The `Server<C,S,I,D>` generic enforces this, so `socket.on('place_tile', (payload, ack) => …)` is fully typed.

#### The `invokeAckSafely` guard — why it exists and the correct pattern

The server's `invokeAckSafely` (index.ts lines 87–91):

```typescript
export const invokeAckSafely = <T>(ack: unknown, response: T): void => {
  if (typeof ack === 'function') {
    ;(ack as (result: T) => void)(response)
  }
}
```

This is the **correct pattern** for robustness. Socket.IO does not guarantee the client will provide an ack callback (the client could call `socket.emit('place_tile', payload)` without a callback). The guard handles this gracefully.

**Best practice for conflict detection in acks:**

The discriminated union in `PlaceTileAck` is the recommended Socket.IO 4.x pattern for type-safe result/error reporting:

```typescript
// contracts.ts — discriminated union (already in place, just extend with opSeq)
export type PlaceTileAck =
  | { placed: TileInstance; rejected: false; opSeq: number }
  | { placed: null; rejected: true; reason: PlaceTileRejectReason; opSeq: number }
```

On the client:

```typescript
// Client — type-narrowed ack handler
socket.emit('place_tile', payload, (ack) => {
  if (ack.rejected) {
    // ack.reason is typed as PlaceTileRejectReason
    removeOptimisticTile(localId)
    showRejectionFeedback(ack.reason)
  } else {
    // ack.placed is typed as TileInstance (non-null)
    reconcileOptimisticTile(localId, ack.placed)
  }
})
```

**Server handler pattern (index.ts ~line 410):**

```typescript
socket.on('place_tile', (payload, ack) => {
  const result = handlePlaceTileRequest(state, payload, clientId)
  invokeAckSafely(ack, result.ack)   // already implemented correctly
  if (result.event) {
    io.to(sessionId).emit('tile_placed', result.event)
  }
})
```

No changes needed to the ack dispatch pattern — it is already correct. The only change is propagating `opSeq` through the ack and event payloads (Q1 above).

---

### Q3: Reconnection and session_snapshot — `on 'connection'` vs middleware

#### Current implementation (index.ts lines 370–395)

```typescript
io.on('connection', (socket) => {
  const { sessionId, clientId } = socket.data
  const state = getSessionState(sessionId)
  const joinedAt = Date.now()

  socket.join(sessionId)
  state.clients.set(clientId, { clientId, joinedAt })

  socket.emit('session_snapshot', {
    session: state.session,
    clients: [...state.clients.values()],
  })

  socket.to(sessionId).emit('client_joined', { client: { clientId, joinedAt } })
  // …
})
```

#### Verdict: `on 'connection'` is the correct place

The `connection` event handler is the right place for the `session_snapshot` emit. Middleware (`io.use()`) runs before the socket is assigned to a room, so you cannot broadcast to the room yet from middleware. Middleware is for authentication/validation only.

Socket.IO 4.6.0 introduced **connection state recovery** (`socket.recovered`), but this feature is NOT suitable for zzyix's use case:
- It requires `connectionStateRecovery` option at server init
- It stores missed packets in memory for `maxDisconnectionDuration` (typically 2 minutes)
- Neither the Redis adapter nor the Postgres adapter currently support it as a built-in feature
- The in-memory adapter supports it, but single-replica only

**Recommended pattern for zzyix** (already in place, no change needed):

```typescript
io.on('connection', (socket) => {
  // 1. Middleware already validated auth and set socket.data.sessionId/clientId
  // 2. Join room first — required before any room-targeted emit
  socket.join(sessionId)

  // 3. Register client presence
  state.clients.set(clientId, { clientId, joinedAt })

  // 4. Send full snapshot to the connecting socket (covers first connect AND reconnect)
  socket.emit('session_snapshot', {
    session: state.session,          // authoritative tile array
    clients: [...state.clients.values()],
  })

  // 5. Notify peers of new presence
  socket.to(sessionId).emit('client_joined', { client: { clientId, joinedAt } })
})
```

**Why full snapshot on every connect is correct for zzyix:**
- The `session_snapshot` includes the full canonical tile array — the client can completely replace its local state
- The `sessions` Map persists across reconnects for the same `sessionId`, so the snapshot reflects all tiles placed while the client was disconnected
- No server-side queue of missed events is needed; the snapshot is the source of truth

**Optional optimisation (not required for v1):**
If `socket.recovered` is true (only when `connectionStateRecovery` is configured), skip the snapshot:

```typescript
io.on('connection', (socket) => {
  if (!socket.recovered) {
    // New connection or unrecoverable — send full snapshot
    socket.emit('session_snapshot', { … })
    socket.to(sessionId).emit('client_joined', { … })
  }
  // If recovered, Socket.IO already replayed missed events from its in-memory store
})
```

This optimisation only applies if `connectionStateRecovery` is enabled, which requires single-node or Redis Streams / MongoDB adapter.

---

### Q4: @socket.io/postgres-adapter vs @socket.io/redis-adapter for ACA 1–3 replicas

#### Feature comparison (from official Socket.IO docs)

| Feature | Redis adapter | Postgres adapter |
|---|---|---|
| Socket management | ✅ YES (since v6.1.0) | ✅ YES (since v0.1.0) |
| Inter-server communication | ✅ YES (since v7.0.0) | ✅ YES (since v0.1.0) |
| Broadcast with acks | ✅ YES (since v7.2.0) | ✅ YES (since v0.3.0) |
| Connection state recovery | ❌ NO | ⏳ WIP (not available) |

**Both still require sticky sessions** — enabling session affinity on ACA ingress is mandatory with either adapter.

#### Mechanism

- **Redis adapter** — uses Redis Pub/Sub (or sharded Pub/Sub with Redis 7+). Every broadcast is published to a channel; all replicas receive and fan out to their own connected clients. No data stored in Redis.
- **Postgres adapter** — uses PostgreSQL NOTIFY/LISTEN. Packets ≤ 8 KB are sent inline in the NOTIFY payload; larger packets are written to a `socket_io_attachments` table and the row ID is notified. Periodic cleanup removes old rows.

#### Tradeoffs for ACA 1–3 replicas

**Redis adapter — advantages:**
- Lower latency (Pub/Sub is very fast for small messages)
- No table writes for normal-size packets
- Well-tested at scale
- `ioredis` package recommended (the `redis` package has known subscription-recovery bugs on reconnect — see https://github.com/redis/node-redis/issues/2155)

**Redis adapter — disadvantages:**
- Requires a separate Redis instance (Azure Cache for Redis: minimum ~$16–50/month on Basic tier)
- Additional infrastructure to provision, secure, and monitor
- No connection state recovery support

**Postgres adapter — advantages:**
- No extra infrastructure if the project already runs a Postgres database
- NOTIFY/LISTEN is native to every Postgres instance, including Azure Database for PostgreSQL
- Heartbeat mechanism (default 5 s interval, 10 s timeout) detects dead nodes
- Setup requires only creating one table: `socket_io_attachments`

**Postgres adapter — disadvantages:**
- Higher latency than Redis Pub/Sub (DB write round-trip for large payloads)
- The `socket_io_attachments` table can grow if cleanup is missed; needs monitoring
- More overhead per packet for large binary payloads (>8 KB)
- Older package (latest: v0.5.0, November 2025 vs Redis adapter v8.3.0, March 2024)
- Connection state recovery is "WIP" — not available

#### Recommendation for zzyix ACA 1–3 replicas

**If a Postgres database is already part of the infrastructure: use `@socket.io/postgres-adapter`.** It eliminates the need for a separate Redis instance and all zzyix payloads (`tile_placed`, `tile_removed`, `pointer_update`) are well within the 8 KB NOTIFY threshold.

**If no Postgres DB exists or Redis is already available: use `@socket.io/redis-adapter` with `ioredis`.**

**For v1 (single replica, sticky sessions):** Neither adapter is required. The in-memory adapter is sufficient and eliminates all infrastructure overhead. The ADR already confirms sticky sessions are sufficient for the initial deployment.

**Deferred adapter setup (recommended for v1):**

```typescript
// index.ts — ready to add adapter later, no changes needed now
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  { cors: { … } }
)
// When scaling: io.adapter(createAdapter(pool)) for Postgres
//              io.adapter(createAdapter(pubClient, subClient)) for Redis
```

#### Installation when needed

Postgres adapter:
```bash
npm install @socket.io/postgres-adapter pg
npm install --save-dev @types/pg
```

Redis adapter (prefer ioredis):
```bash
npm install @socket.io/redis-adapter ioredis
```

---

### Q5: Presence management — reliable client_joined/client_left including abrupt disconnects

#### Current implementation

**On connect (index.ts ~line 388):**
```typescript
state.clients.set(clientId, { clientId, joinedAt })
socket.to(sessionId).emit('client_joined', { client: { clientId, joinedAt } })
```

**On disconnect (index.ts ~line 435):**
```typescript
socket.on('disconnect', () => {
  state.clients.delete(clientId)
  io.to(sessionId).emit('client_left', { clientId })
  cleanupSessions()
})
```

#### Verdict: Current pattern is correct for abrupt disconnects

Socket.IO's `disconnect` event fires **for both clean and abrupt disconnects** — it is triggered on:
- `transport close` (network loss, WiFi → 4G switch)
- `ping timeout` (client unresponsive)
- `transport error`
- Clean `socket.disconnect()` calls

Socket.IO handles room cleanup automatically on disconnect (rooms are left automatically). The `socket.data.clientId` and `socket.data.sessionId` values are preserved in the closure, so `state.clients.delete(clientId)` works reliably even when `socket.rooms` would be empty.

**Why `disconnect` not `disconnecting`:**
- `disconnecting` fires before rooms are left — `socket.rooms` still contains the session room
- `disconnect` fires after rooms are left — `socket.rooms` is empty
- Since the clientId comes from `socket.data` (not rooms), either event works
- The current code uses `disconnect`, which is the simpler and more common pattern
- `disconnecting` would only be needed if you needed to inspect `socket.rooms` at that moment (e.g., to check if it was the last socket in the room)

**One improvement: use `io.to(sessionId)` not `socket.to(sessionId)` for `client_left`**

The current code correctly uses `io.to(sessionId).emit('client_left', …)`, which sends to ALL sockets in the room including the departing client if it were still connected. This is the right choice for broadcast-to-all.

`socket.to(sessionId).emit()` would exclude the sender — which is correct for `client_joined` (you don't need to tell yourself you joined) but `io.to(sessionId)` is also fine there.

**Presence map consistency:**

A subtle race condition exists when the same `clientId` reconnects before the disconnect handler fires. The current `state.clients.set(clientId, { clientId, joinedAt })` on connect correctly overwrites the old presence entry. On disconnect, `state.clients.delete(clientId)` then removes the entry even though the socket for the new connection is still active.

**Fix for multi-socket presence (if same clientId can have multiple simultaneous sockets):**

```typescript
// Track socket count per clientId to avoid deleting presence prematurely
// Option A: use socket.id in the presence key
state.clients.set(socket.id, { clientId, joinedAt })  // keyed by socket.id

// Option B: reference-count per clientId
// On connect: increment count
// On disconnect: decrement; only delete from clients map when count reaches 0
```

For zzyix's use case (one session per clientId, tabs close on navigate), the current single-entry pattern is likely acceptable. If multi-tab is a concern, Option B is recommended.

---

### Q6: Socket.IO 4.x TypeScript typed event maps — pattern used in contracts.ts

#### Verification of the existing contracts.ts pattern

The existing `contracts.ts` implements the **exact correct pattern** from the Socket.IO 4.x TypeScript documentation. Key points confirmed:

**1. Server instantiation with four generics (contracts.ts comment block, line 16):**
```typescript
const io = new Server<
  ClientToServerEvents,    // events FROM client, received on server
  ServerToClientEvents,    // events FROM server, received on client
  InterServerEvents,       // for serverSideEmit() in multi-server clusters
  SocketData               // type of socket.data attribute
>(httpServer)
```

**2. Client-to-server ack callback is last arg:**
```typescript
// contracts.ts line ~260
export interface ClientToServerEvents {
  place_tile: (payload: PlaceTilePayload, ack: (response: PlaceTileAck) => void) => void
  remove_tile: (payload: RemoveTilePayload, ack: (response: RemoveTileAck) => void) => void
  pointer_move: (payload: PointerMovePayload) => void
}
```
This is the canonical Socket.IO 4.x pattern. The TypeScript compiler infers the ack type in the handler: `socket.on('place_tile', (payload, ack) => { /* ack typed as (response: PlaceTileAck) => void */ })`.

**3. Server-to-client event map for broadcasts:**
```typescript
// contracts.ts line ~270
export interface ServerToClientEvents {
  session_snapshot: (payload: SessionSnapshotPayload) => void
  tile_placed: (payload: TilePlacedPayload) => void
  tile_removed: (payload: TileRemovedPayload) => void
  pointer_update: (payload: PointerUpdatePayload) => void
  client_joined: (payload: ClientJoinedPayload) => void
  client_left: (payload: ClientLeftPayload) => void
}
```
`io.to(sessionId).emit('tile_placed', event)` is type-checked against `TilePlacedPayload` — TypeScript will error if the shape doesn't match.

**4. `SocketData` types `socket.data`:**
```typescript
// contracts.ts line ~215
export type SocketData = {
  clientId: string
  sessionId: string
}
```
`socket.data.clientId` and `socket.data.sessionId` are fully typed (no `any`).

**5. `InterServerEvents` is currently empty** — this is correct for single-server and single-adapter deployments. When a Redis or Postgres adapter is added, `serverSideEmit` can use typed inter-server events here.

#### What the TypeScript types do NOT enforce

As noted in the Socket.IO docs:
> "These type hints do not replace proper validation/sanitization of the input. Never trust user input."

The existing `isPlaceTilePayload()` and `isRemoveTilePayload()` guards in `index.ts` correctly implement runtime validation. The TypeScript types are compile-time only.

---

## Summary of What is Already Correct

| Concern | Status | Notes |
|---|---|---|
| Typed event maps | ✅ Correct | Follows Socket.IO 4.x pattern exactly |
| `session_snapshot` on `connection` | ✅ Correct | Right event; middleware can't join rooms |
| Ack discriminated union | ✅ Correct | `PlaceTileAck` union is the recommended pattern |
| `invokeAckSafely` guard | ✅ Correct | Handles missing ack callback gracefully |
| Presence `client_left` on disconnect | ✅ Correct | `disconnect` fires for both clean and abrupt |
| `io.to(room).emit` for broadcast | ✅ Correct | All peers including sender receive it |
| `socket.to(room).emit` for pointer | ✅ Correct | Excludes sender (fire-and-forget presence) |
| Room join before snapshot emit | ✅ Correct | `socket.join(sessionId)` before `socket.emit` |

## Summary of What Needs Adding

| Concern | Change Required | File |
|---|---|---|
| `opSeq` in broadcast payloads | Add `opSeq: number` to `TilePlacedPayload`, `TileRemovedPayload` | contracts.ts |
| `opSeq` in ack payloads | Add `opSeq: number` to `PlaceTileAck` both branches and `RemoveTileAck` | contracts.ts |
| Propagate `opSeq` into event objects | Wire `result.opSeq` into `result.event` and `result.ack` | index.ts |
| `SessionSnapshotPayload` include `lastOpSeq` | Add `lastOpSeq: number` so client knows current sequence | contracts.ts |
| Adapter (deferred) | None needed for v1 single-replica | N/A |

## Concrete `contracts.ts` Additions for opSeq

```typescript
// Add to SessionSnapshotPayload
export type SessionSnapshotPayload = {
  session: Session
  clients: ClientPresence[]
  lastOpSeq: number          // ← client uses this to detect gaps after snapshot
}

// Extend TilePlacedPayload
export type TilePlacedPayload = {
  tile: TileInstance
  placedBy: string
  opSeq: number              // ← monotonically increasing per session
}

// Extend TileRemovedPayload  
export type TileRemovedPayload = {
  tileId: string
  removedBy: string
  opSeq: number
}

// Extend PlaceTileAck (both branches)
export type PlaceTileAck =
  | { placed: TileInstance; rejected: false; opSeq: number }
  | { placed: null; rejected: true; reason: PlaceTileRejectReason; opSeq: number }

// Extend RemoveTileAck
export type RemoveTileAck = {
  removed: boolean
  opSeq: number
}
```

## Concrete `index.ts` Changes for opSeq propagation

In `createAuthoritativeSessionState` (index.ts ~line 120): already has `lastOpSeq: 0` ✅

In `applyPlaceTile` (index.ts ~line 174):
```typescript
// Add opSeq to both ack branches and the event
return {
  opSeq,
  ack: {
    placed: tile,
    rejected: false,
    opSeq,            // ← add
  },
  event: {
    tile,
    placedBy,
    opSeq,            // ← add
  },
}
// Also for reject branch:
return {
  opSeq,
  ack: {
    placed: null,
    rejected: true,
    reason: toRejectReason(validation.reason),
    opSeq,            // ← add
  },
}
```

In `applyRemoveTile` (index.ts ~line 205):
```typescript
// All return branches: add opSeq to ack
return { opSeq, ack: { removed: false, opSeq } }
return { opSeq, ack: { removed: true, opSeq }, event: { tileId: payload.tileId, removedBy, opSeq } }
```

In `io.on('connection')` snapshot emit (index.ts ~line 385):
```typescript
socket.emit('session_snapshot', {
  session: state.session,
  clients: [...state.clients.values()],
  lastOpSeq: state.lastOpSeq,   // ← add
})
```

---

## External References

- Socket.IO TypeScript docs: https://socket.io/docs/v4/typescript/
- Socket.IO Rooms: https://socket.io/docs/v4/rooms/
- Socket.IO Server API (Socket events, socket.recovered): https://socket.io/docs/v4/server-api/
- Socket.IO Connection State Recovery: https://socket.io/docs/v4/connection-state-recovery/
- Socket.IO Redis adapter: https://socket.io/docs/v4/redis-adapter/
- Socket.IO Postgres adapter: https://socket.io/docs/v4/postgres-adapter/
- `redis` package reconnect bug: https://github.com/redis/node-redis/issues/2155
