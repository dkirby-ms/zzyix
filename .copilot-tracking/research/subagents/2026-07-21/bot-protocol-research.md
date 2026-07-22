# Bot Protocol Research — zzyix Autonomous Tile-Placing Agents

**Status:** Complete  
**Date:** 2026-07-21

---

## Research Topics

1. Bot Service Integration Protocol (Socket.IO auth, events, place_tile)
2. Placement Solver Deep Dive (validatePlacement, solveGuidedPlacement, geometry)
3. DB/Session Persistence (how sessions are stored, joining by ID)
4. Existing Jobs Pattern (retention.ts as structural reference)
5. Monorepo Package Structure (workspaces, dependencies, new apps/bot/ viability)

---

## 1. Bot Service Integration Protocol

### Connection Auth Shape

**File:** `apps/server/src/contracts.ts`, lines 218–227

```ts
/** Passed in socket.handshake.auth when the client connects. */
export type ConnectionAuth = {
  sessionId: string   // UUID of the canvas session to join
  clientId: string    // arbitrary stable client identifier
}

/** Per-socket metadata stored by Socket.IO (accessible as socket.data). */
export type SocketData = {
  clientId: string
  sessionId: string
}
```

A bot connects with:
```ts
io(serverUrl, {
  auth: { sessionId: '<uuid>', clientId: '<bot-stable-id>' },
  transports: ['websocket', 'polling'],
})
```

### Server Auth Middleware (index.ts lines ~970–997)

The server middleware (`io.use`) performs these validations:

1. Reads `socket.handshake.auth` cast to `Partial<ConnectionAuth>`.
2. Rejects if `!auth.sessionId` or `!auth.clientId` (returns Error, disconnects socket).
3. Stores `socket.data.sessionId` and `socket.data.clientId`.
4. **No token/secret validation** — any string clientId is accepted. A bot can generate a UUID at startup and reuse it.

**Critical note:** `clientId` is NOT validated as a UUID (unlike `tileId`). Any non-empty string passes. Use `crypto.randomUUID()` for stability.

### Connection Flow After Auth Passes (index.ts lines ~1003–1044)

```
socket connects
  → socket.join(sessionId)                         // join session room
  → initializeParticipantPresence(sessionId, clientId, joinedAt)
      → markParticipantJoined() in DB
      → loadSessionReplayRecord() from DB
  → sessionState updated from DB snapshot
  → socket.emit('session_snapshot', { ... })       // sent to THIS socket only
  → socket.to(sessionId).emit('client_joined', { client: joinedClient })  // broadcast to others
```

The `session_snapshot` event is the bot's source of truth on connect/reconnect. It contains all existing tiles.

### Session Snapshot Payload

```ts
// contracts.ts lines ~292–298
export type SessionSnapshotPayload = {
  session: Session          // { id, tiles: TileInstance[], boundsPolicy, createdAt, updatedAt }
  canvasConfig?: SessionCanvasConfig
  clients: ClientPresence[]
  lastOpSeq: number
  revision: number
}
```

### place_tile Emit Signature

**File:** `apps/server/src/contracts.ts`, lines ~404–410

```ts
// Emit on socket:
socket.emit('place_tile', payload, (ack: PlaceTileAck) => { ... })

// PlaceTilePayload
export type PlaceTilePayload = {
  expectedRevision?: number   // optional optimistic concurrency; omit for simple bots
  tileId: string              // client-generated UUID; server uses it as-is
  shape: TileShape            // 'square' | 'triangle' | 'rectangle' | 'l-shape'
  color: string               // any CSS-compatible string
  material: MaterialVariant   // 'ceramic' | 'glass' | 'stone'
  transform: Transform2D      // { position: Vec2, rotation: number, mirrored?: boolean }
}

// PlaceTileAck (union)
export type PlaceTileAck =
  | { placed: TileInstance; rejected: false; opSeq: number; newRevision: number; idempotent?: boolean }
  | { placed: null; rejected: true; reason: PlaceTileRejectReason }
```

**tileId requirement:** Must pass the UUID_PATTERN regex `^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$i` (validated in `isPlaceTilePayload`, index.ts ~line 379). Use `crypto.randomUUID()`.

### PlaceTileRejectReason values

```ts
export type PlaceTileRejectReason =
  | 'OUT_OF_BOUNDS'
  | 'OVERLAP'
  | 'GAP_TOO_LARGE'
  | 'PLACEMENT_REJECTED'
  | 'REQUEST_HASH_MISMATCH'
  | 'DUPLICATE_OPERATION'
  | 'STALE_REVISION'
  | 'OUT_OF_ORDER_REVISION'
```

### Complete ClientToServerEvents

**File:** `apps/server/src/contracts.ts`, lines ~414–435

```ts
export interface ClientToServerEvents {
  place_tile: (payload: PlaceTilePayload, ack: (response: PlaceTileAck) => void) => void
  remove_tile: (payload: RemoveTilePayload, ack: (response: RemoveTileAck) => void) => void
  request_snapshot: () => void
  pointer_move: (payload: PointerMovePayload) => void
  selection_update: (payload: SelectionUpdatePayload) => void
  subscribe_chunks: (payload: SubscribeChunksPayload) => void
  unsubscribe_chunks: (payload: UnsubscribeChunksPayload) => void
  request_chunk_snapshot: (payload: RequestChunkSnapshotPayload) => void
}
```

### Complete ServerToClientEvents

**File:** `apps/server/src/contracts.ts`, lines ~437–465

```ts
export interface ServerToClientEvents {
  session_snapshot: (payload: SessionSnapshotPayload) => void
  tile_placed: (payload: TilePlacedPayload) => void
  tile_removed: (payload: TileRemovedPayload) => void
  pointer_update: (payload: PointerUpdatePayload) => void
  selection_update: (payload: SelectionUpdatePayload) => void
  client_joined: (payload: ClientJoinedPayload) => void
  client_left: (payload: ClientLeftPayload) => void
  resync_required: (payload: ResyncRequiredPayload) => void
  chunk_snapshot: (payload: ChunkSnapshotPayload) => void
  chunk_tile_placed: (payload: ChunkTilePlacedPayload) => void
  chunk_tile_removed: (payload: ChunkTileRemovedPayload) => void
  chunk_resync_required: (payload: ChunkResyncRequiredPayload) => void
}
```

### Events a Bot Must Listen To (minimum set)

| Event | Why |
|---|---|
| `session_snapshot` | Initial state + reconnect sync. Bot must rebuild its local tile list from this. |
| `tile_placed` | Another client placed a tile; bot must add it to local settled list. |
| `tile_removed` | Another client removed a tile; bot must remove it from local settled list. |
| `resync_required` | Server signals the bot's revision is stale; must call `request_snapshot`. |

Optional but useful:
- `client_joined` / `client_left` — presence awareness
- `chunk_tile_placed` / `chunk_tile_removed` — if bot uses chunk subscriptions

### Session Join Flow for a Bot

1. `POST /sessions` (creates a new canvas, returns `{ session: { id } }`) OR retrieve an existing session UUID from `GET /sessions` → `ListSessionsResponse`.
2. Construct socket: `io(serverUrl, { auth: { sessionId, clientId }, transports: ['websocket', 'polling'] })`.
3. On `session_snapshot`: populate local tile state.
4. On `tile_placed` / `tile_removed`: maintain local state.
5. Call `place_tile` when the bot wants to place a tile.

---

## 2. Placement Solver Deep Dive

### validatePlacement Signature

**File:** `apps/client/src/domain/placementSolver.ts`, lines ~163–173

```ts
export const validatePlacement = (
  candidateShape: TileShape,
  candidateTransform: Transform2D,
  settled: TileInstance[],
  bounds: MosaicBounds | BoundsPolicy,
): ValidationResult
```

**Inputs:**
- `candidateShape`: `'square' | 'triangle' | 'rectangle' | 'l-shape'`
- `candidateTransform`: `{ position: Vec2, rotation: number, mirrored?: boolean }`
- `settled`: current array of `TileInstance[]` from session snapshot (used for collision + adjacency checks)
- `bounds`: either the raw `MosaicBounds` or a `BoundsPolicy`. Pass `defaultBounds` for default canvas.

**Return type:**

```ts
export type ValidationResult = {
  state: ConfidenceState    // 'valid' | 'near-valid' | 'invalid'
  valid: boolean
  correction: Vec2          // direction to push the tile to fix the violation
  penetration: number       // depth of deepest collision or gap distance
  reason: string            // human-readable: 'ok', 'out-of-bounds (...)', 'overlap (depth ...)', 'gap too large (...)'
}
```

### solveGuidedPlacement Signature

**File:** `apps/client/src/domain/placementSolver.ts`, lines ~248–267

```ts
export const solveGuidedPlacement = (
  pointer: Vec2,            // desired placement position
  candidateShape: TileShape,
  rotation: number,
  mirrored: boolean,
  settled: TileInstance[],
  bounds: MosaicBounds | BoundsPolicy,
): GuidedPlacement
```

**Return type:**

```ts
export type GuidedPlacement = {
  transform: Transform2D
  state: ConfidenceState
  valid: boolean
  magnetStrength: number    // currently always 0 (snapping disabled)
  correction: Vec2
  reason: string
}
```

Note: snapping is currently disabled — `solveGuidedPlacement` always uses raw pointer position. A bot using `validatePlacement` directly is equivalent.

### MAX_GROUT_GAP Rule

**File:** `apps/client/src/domain/placementSolver.ts`, line ~60

```ts
const MAX_GROUT_GAP = 0.22
```

**What it means for a bot:**
- Once the canvas has ANY settled tile, every new tile placement must have its polygon within `0.22` world units edge-to-edge of at least one existing tile.
- A bot placing in open space (gap > 0.22 to all tiles) will receive a `GAP_TOO_LARGE` rejection.
- **Bot strategy:** find a valid position adjacent to an existing tile by iterating positions near the bounding box edges of settled tiles.
- The adjacency check only activates when `settled.length > 0`. The very first tile in an empty session can go anywhere within bounds.
- `near-valid` is returned when gap is between `MAX_GROUT_GAP` and `MAX_GROUT_GAP * 2.5` (0.22–0.55).

### Default Canvas Bounds

**File:** `apps/client/src/domain/placementSolver.ts`, lines ~282–290

```ts
export const defaultBounds: MosaicBounds = {
  minX: -5.2,
  maxX: 5.2,
  minY: -3.4,
  maxY: 3.4,
}
// Canvas is 10.4 × 6.8 world units
```

### Tile Geometry — How Polygons Are Computed

**File:** `apps/client/src/domain/tileGeometry.ts`

Base unit: `const unit = 0.88` (line ~20)

Tile outlines (relative to center, pre-transform):

| Shape | Outline | ConvexParts |
|---|---|---|
| `square` | 4 points ±unit/2 | 1 (same as outline) |
| `rectangle` | 4 points ±unit*0.68 × ±unit*0.36 | 1 |
| `triangle` | 3 points | 1 |
| `l-shape` | 6 points | 2 (split into two rects) |

Transform pipeline (`transformPoint`, line ~83):
1. Mirror: if `mirrored`, negate X.
2. Rotate: apply 2D rotation by `rotation` (radians).
3. Translate: add `position`.

Key exports a bot needs from `tileGeometry.ts`:
```ts
export type TileShape = 'square' | 'triangle' | 'rectangle' | 'l-shape'
export type Transform2D = { position: Vec2; rotation: number; mirrored?: boolean }
export type ConfidenceState = 'valid' | 'near-valid' | 'invalid'
export const transformTile = (shape: TileShape, transform: Transform2D): TileDefinition
export const quantizeRotation = (rotation: number): number   // snaps to π/2 increments
export const normalizeAngle = (rotation: number): number     // wraps to [0, 2π)
```

The server-side `validatePlacement` lives at `apps/server/src/domain/placementSolver.js` (compiled from same logic), imported at index.ts line ~49:
```ts
import { defaultBounds, validatePlacement } from './domain/placementSolver.js'
```

This means the bot can run the same client-side solver locally to pre-check placements before emitting.

---

## 3. DB/Session Persistence

### DB Module Structure

**File:** `apps/server/src/db/`

| File | Purpose |
|---|---|
| `client.ts` | pg pool + drizzle client initialization |
| `schema.ts` | Drizzle table definitions |
| `repository.ts` | All DB read/write functions (`persistTilePlacement`, `loadSessionReplayRecord`, etc.) |
| `snapshots.ts` | Snapshot persistence logic |
| `types.ts` | `materialVariantValues`, `tileShapeValues`, etc. |
| `index.ts` | Re-exports everything |
| `migrate.ts` | Migration runner |

### Key DB Tables (schema.ts)

- `canvases` — one row per session, keyed by UUID
- `tiles` — individual tile rows with `canvas_id` FK
- `participants` — `(canvas_id, client_id)` with join/leave timestamps
- `operation_log` — append-only event log with `op_seq`
- `snapshots` — periodic compacted snapshots
- `idempotencyKeys` — dedup for replay protection

### Session Join by ID

A bot can join an **existing** session by simply:
1. Using the session UUID from the `GET /sessions` REST endpoint.
2. Connecting with `auth: { sessionId: existingUUID, clientId: botId }`.
3. The server calls `initializeParticipantPresence(sessionId, clientId, joinedAt)` which upserts the participant record and loads the replay record (DB snapshot + operation log).
4. The bot receives `session_snapshot` containing all existing tiles.

**No special "rejoin" handshake is needed.** The server auto-hydrates from DB.

### SessionSummaryRecord (repository.ts lines ~100–103)

```ts
export type SessionSummaryRecord = {
  id: string
  participantCount: number
}
```

Returned by `listSessionSummaries()` which powers `GET /sessions`.

---

## 4. Existing Jobs Pattern (retention.ts)

**File:** `apps/server/src/jobs/retention.ts`

Structure:
```ts
import cron from 'node-cron'

// Config from env vars with defaults
const DEFAULT_RETENTION_CRON = process.env.RETENTION_CRON ?? '0 * * * *'

// Pure async business logic function (easily testable)
export const runRetentionPass = async (): Promise<{ deletedOperations, deletedSnapshots, deletedIdempotencyKeys }>

// Factory function returning a ScheduledTask handle
export const startRetentionJob = (): ScheduledTask =>
  cron.schedule(DEFAULT_RETENTION_CRON, async () => {
    try {
      await runRetentionPass()
    } catch (error) {
      console.error('[retention] prune failed', error)
    }
  })
```

Started in `index.ts` at line ~1432:
```ts
const retentionJob = process.env.NODE_ENV === 'test' ? null : startRetentionJob()
```
Stopped on graceful shutdown:
```ts
retentionJob?.stop()
```

**Implication for a bot implemented as a server-side plugin:** Follow exactly this pattern:
- Export `startBotJob(): ScheduledTask | null`
- Guard with `NODE_ENV !== 'test'`
- Wire into the server's graceful shutdown

---

## 5. Monorepo Package Structure

### Root package.json

```json
{
  "name": "zzyix-monorepo",
  "workspaces": ["apps/client", "apps/server"],
  "scripts": { "dev": "npm run dev:server & npm run dev:client", ... }
}
```

Uses **npm workspaces**. Build tool: TypeScript + Vite (client), TypeScript + tsx/nodemon (server).

### socket.io-client Dependency

`apps/client/package.json` has `"socket.io-client": "^4.8.2"` in `dependencies`.  
`apps/server/package.json` has `"socket.io": "^4.8.2"` in `dependencies` (server-side).

**A new `apps/bot/` package would need `socket.io-client` as a direct dependency**, since the client's `node_modules` is scoped to `apps/client`.

### Server package characteristics

- `"type": "module"` — ESM only. All imports need `.js` extensions.
- TypeScript ~7.0.2, Vitest ^4.1.10 for testing.
- `node-cron` already in dependencies.
- Runtime: `node --env-file=../../.env --import tsx/esm` in dev.

---

## Recommended `apps/bot/` Package Structure

If implemented as a **standalone bot package** (preferred for separation of concerns):

```
apps/bot/
  package.json                  # "name": "zzyix-bot", "type": "module"
  tsconfig.json                 # extends ../../tsconfig.base.json
  src/
    index.ts                    # entry: reads env, connects socket, starts agent loop
    bot.ts                      # BotAgent class: connect, listen, placeNext()
    strategy.ts                 # placement strategy: finds valid adjacent position
    placementSolver.ts          # thin re-export or copy of client's validatePlacement
    contracts.ts                # type-only import from ../../server/src/contracts.ts
  test/
    strategy.test.ts
```

**package.json dependencies:**
```json
{
  "name": "zzyix-bot",
  "type": "module",
  "dependencies": {
    "socket.io-client": "^4.8.2"
  },
  "devDependencies": {
    "typescript": "~7.0.2",
    "tsx": "^4.23.1",
    "vitest": "^4.1.10"
  }
}
```

Add `"apps/bot"` to root `package.json` workspaces array.

**Alternatively** — implement as a **server-side plugin** by adding `apps/server/src/jobs/bot.ts`:
- Avoids new package overhead.
- Can reuse `socket.io` server-side directly (emit to room without re-connecting).
- But couples bot logic to server process.
- The `startRetentionJob` pattern applies directly.

**Recommendation:** For a true autonomous agent that can run independently, prefer `apps/bot/`. For a simple timed agent running in-process, use `apps/server/src/jobs/bot.ts`.

---

## Key Implementation Notes for Bot

### Minimal Connection Pseudocode

```ts
import { io } from 'socket.io-client'
import { randomUUID } from 'node:crypto'
import type { ClientToServerEvents, ServerToClientEvents } from '../../server/src/contracts.js'

const sessionId = process.env.SESSION_ID!  // join existing or POST /sessions first
const clientId = randomUUID()

const socket = io(serverUrl, {
  auth: { sessionId, clientId },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
})

let localTiles: TileInstance[] = []

socket.on('session_snapshot', (payload) => {
  localTiles = payload.session.tiles
})

socket.on('tile_placed', (payload) => {
  localTiles.push(payload.tile)
})

socket.on('tile_removed', (payload) => {
  localTiles = localTiles.filter(t => t.id !== payload.tileId)
})

socket.on('resync_required', () => {
  socket.emit('request_snapshot')
})
```

### Minimal place_tile Call

```ts
const tileId = randomUUID()
socket.emit('place_tile', {
  tileId,
  shape: 'square',
  color: '#e2a060',
  material: 'ceramic',
  transform: { position: { x: 0, y: 0 }, rotation: 0 },
}, (ack) => {
  if (!ack.rejected) {
    // success, tile is ack.placed
  } else {
    // handle ack.reason
  }
})
```

### Placement Strategy Constraints

1. First tile on empty canvas: any position within bounds (`minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4`).
2. Every subsequent tile: must be within `MAX_GROUT_GAP = 0.22` edge-to-edge of some settled tile.
3. No polygon overlap (SAT collision detection on convex parts).
4. Strategy: iterate candidate positions around the bounding box of existing tiles, call `validatePlacement` locally, emit when `valid: true`.

---

## References

- `apps/server/src/contracts.ts` — canonical event + type definitions
- `apps/server/src/index.ts` — auth middleware (lines ~959–997), connection handler (lines ~1003+), place_tile handler (lines ~1048+)
- `apps/client/src/domain/placementSolver.ts` — validatePlacement (lines ~163–200), solveGuidedPlacement (lines ~248–267), defaultBounds (lines ~282–290), MAX_GROUT_GAP (line ~60)
- `apps/client/src/domain/tileGeometry.ts` — tile polygon definitions and transform pipeline
- `apps/client/src/network/useSocketConnection.ts` — reference client connection pattern
- `apps/server/src/jobs/retention.ts` — jobs pattern template
- `apps/server/src/db/repository.ts` — session persistence types
- `apps/server/src/db/schema.ts` — DB table layout
- `apps/server/package.json` — server deps (socket.io, node-cron, etc.)
- `apps/client/package.json` — client deps (socket.io-client ^4.8.2)
- `package.json` (root) — npm workspaces config
