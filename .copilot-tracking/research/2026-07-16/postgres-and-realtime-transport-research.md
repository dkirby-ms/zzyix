<!-- markdownlint-disable-file -->
# Task Research: Postgres Data Model and Realtime Transport Layer

Research covering GitHub Issues #10 (Postgres data model) and #11 (Realtime transport layer) for the zzyix collaborative mosaic canvas application.

## Task Implementation Requests

* **Issue #10**: Define Postgres tables for users, canvases, participants, tiles, operation_log, and snapshots — with indexes, constraints, migration strategy, and retention/archival documentation.
* **Issue #11**: Implement realtime transport for collaborative edits, presence, and operation acknowledgments — choosing transport channels, supporting presence/connection events, adding acknowledgment and retry-safe delivery, and defining reconnect behavior and sequencing guarantees.

## Scope and Success Criteria

* Scope: Server-side data persistence and transport design; excludes client UI changes unless needed for transport integration.
* Assumptions:
  * Postgres is the chosen database (per issue title).
  * Socket.IO is already partially implemented (see apps/server/src/index.ts and contracts.ts).
  * The server currently uses an in-memory `sessions` Map; Postgres replaces or augments this.
  * The project targets Azure Container Apps deployment (per docs/decisions/2026-07-15-deployment-architecture-v01.md).
* Success Criteria:
  * Postgres schema with all required tables implemented with proper constraints and indexes.
  * Migration strategy defined (tool, versioning, rollback).
  * Realtime transport working for multi-user canvas sessions with presence and acks.
  * Delivery guarantees and reconnect behavior documented and tested.

## Outline

1. Current server state model (in-memory sessions Map)
2. Postgres schema design — table-by-table analysis
3. Migration strategy and tooling options
4. Retention and archival implications
5. Realtime transport — current Socket.IO implementation
6. Transport channel options (WebSocket/Socket.IO, SSE, WebRTC, etc.)
7. Presence and connection state events
8. Acknowledgment and retry-safe delivery
9. Reconnect behavior and sequencing guarantees
10. Integration pattern: how #10 and #11 interact

## Potential Next Research

* How operation_log + snapshots enable efficient reconnect replay
  * Reasoning: Critical for sequencing guarantees in #11 and archival in #10
  * Reference: contracts.ts session_snapshot event, op_seq pattern already in code
* Postgres migration tooling best fit for Node.js/TypeScript monorepo
  * Reasoning: Migration strategy is explicit scope in #10
  * Reference: apps/server/package.json dependencies
* Socket.IO adapter for Redis or Postgres (multi-instance ACA scaling)
  * Reasoning: ACA can scale horizontally; Socket.IO rooms need shared state
  * Reference: docs/decisions/2026-07-15-deployment-architecture-v01.md

## Research Executed

### Subagent Research

* .copilot-tracking/research/subagents/2026-07-16/postgres-schema-tooling-research.md
  * Drizzle ORM vs Prisma vs raw pg comparison with ACA deployment implications
  * @socket.io/postgres-adapter NOTIFY 8 KB limit, sticky sessions requirement, no Connection State Recovery
  * testcontainers vs pg-mem test strategy; pg-mem lacks LISTEN/NOTIFY
  * Retention: node-cron TTL deletion initially; monthly RANGE partitioning at scale
* .copilot-tracking/research/subagents/2026-07-16/socketio-realtime-patterns-research.md
  * Gap analysis: `opSeq` tracked internally but not yet in broadcast/ack payloads
  * Confirmed: `io.on('connection')` is correct for session_snapshot (not middleware)
  * Presence `client_left` on `disconnect` covers both clean and abrupt disconnects
  * Typed event map pattern in contracts.ts is already canonical Socket.IO 4.x correct
  * No changes needed to ack signature or broadcast patterns — only opSeq wiring is missing

### File Analysis

* apps/server/src/contracts.ts
  * Lines 1–30: Schema version, domain primitives (Vec2, TileShape, MaterialVariant, Transform2D, TileInstance, Session, ClientPresence)
  * Lines 140–200: Socket.IO event contracts, ConnectionAuth (sessionId + clientId), SocketData, broadcast patterns
  * op_seq (lastOpSeq) already tracked per session in AuthoritativeSessionState
* apps/server/src/index.ts
  * Lines 1–30: Imports, AuthoritativeSessionState type defined as { session, clients Map, lastOpSeq }
  * Lines 100–200: Session management helpers — createAuthoritativeSessionState, shouldCleanupSession, cleanupSessions, getSessionState, applyPlaceTile
  * Current storage: `const sessions = new Map<string, AuthoritativeSessionState>()` — purely in-memory, no persistence

### Project Conventions

* Standards referenced: TypeScript strict mode, Socket.IO for realtime, Express for REST
* Instructions followed: Deployment architecture decision in docs/decisions/

## Key Discoveries

### Project Structure

* The server is a Node.js/Express + Socket.IO app in apps/server/
* Domain logic (placement solver, tile geometry, math2d) is shared between server and client
* The authoritative state model: `{ session: Session, clients: Map<clientId, ClientPresence>, lastOpSeq: number }`
* Session lifecycle: created on first access, cleaned up when empty or stale (30 min default)
* No persistence layer exists yet — all state is lost on server restart

### Implementation Patterns

* `TileInstance` has: id (UUID), shape, color, material, transform (position, rotation, mirrored), createdAt
* `Session` has: id, tiles (TileInstance[]), createdAt, updatedAt
* `ClientPresence` has: clientId, joinedAt, pointer (Vec2 optional)
* op_seq (`lastOpSeq`) is per-session sequence counter; already used in ack responses
* Socket.IO rooms are already used — `socket.join(sessionId)` on connect
* `session_snapshot` event already defined for reconnect sync

### Current Socket.IO Event Protocol (from contracts.ts)

Broadcast patterns already designed:
* `tile_placed`, `tile_removed`, `client_joined`, `client_left` → `io.to(sessionId).emit(...)` (all in room)
* `pointer_update` → `socket.to(sessionId).emit(...)` (all except sender)
* `place_tile`, `remove_tile` → Socket.IO acknowledgements (inline result)
* `session_snapshot` → emitted to connecting socket on reconnect

## Technical Scenarios

### Scenario A: Postgres Schema Design

#### Table: users

Represents authenticated users (future auth integration).

```sql
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  TEXT NOT NULL UNIQUE,   -- maps to current clientId
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Table: canvases (maps to current "sessions")

```sql
CREATE TABLE canvases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX canvases_updated_at_idx ON canvases (updated_at);
```

#### Table: participants

Join table linking users/clients to canvases with presence metadata.

```sql
CREATE TABLE participants (
  canvas_id  UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at    TIMESTAMPTZ,
  PRIMARY KEY (canvas_id, client_id)
);
CREATE INDEX participants_canvas_id_idx ON participants (canvas_id);
```

#### Table: tiles

Current settled tile state on a canvas.

```sql
CREATE TABLE tiles (
  id          UUID PRIMARY KEY,
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  shape       TEXT NOT NULL CHECK (shape IN ('square','triangle','rectangle','l-shape')),
  color       TEXT NOT NULL,
  material    TEXT NOT NULL CHECK (material IN ('ceramic','glass','stone')),
  pos_x       FLOAT8 NOT NULL,
  pos_y       FLOAT8 NOT NULL,
  rotation    FLOAT8 NOT NULL,
  mirrored    BOOLEAN NOT NULL DEFAULT FALSE,
  placed_by   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tiles_canvas_id_idx ON tiles (canvas_id);
```

#### Table: operation_log

Append-only log of all operations; enables replay and audit.

```sql
CREATE TABLE operation_log (
  id          BIGSERIAL PRIMARY KEY,
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  op_seq      INT NOT NULL,
  op_type     TEXT NOT NULL CHECK (op_type IN ('tile_placed','tile_removed')),
  payload     JSONB NOT NULL,
  client_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canvas_id, op_seq)
);
CREATE INDEX op_log_canvas_seq_idx ON operation_log (canvas_id, op_seq);
CREATE INDEX op_log_canvas_created_idx ON operation_log (canvas_id, created_at);
```

#### Table: snapshots

Periodic full-state snapshots for fast reconnect recovery (avoids full log replay).

```sql
CREATE TABLE snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id   UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  op_seq      INT NOT NULL,               -- last op_seq included in this snapshot
  state       JSONB NOT NULL,             -- full TileInstance[] array
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX snapshots_canvas_seq_idx ON snapshots (canvas_id, op_seq DESC);
```

### Scenario B: Migration Strategy Options

**Option 1 (Rejected): node-postgres (pg) with manual SQL migrations**
- Raw SQL migration files in `apps/server/migrations/`
- Simple, no abstraction, full control
- Lacks built-in versioning; must manage migration table manually
- No TS type safety for queries — types drift from schema over time

**Option 2 (Selected): Drizzle ORM with `drizzle-kit`**
- TypeScript-first ORM (~31 KB runtime, zero extra dependencies)
- Schema defined in `apps/server/src/db/schema.ts` (TypeScript)
- `drizzle-kit generate` produces versioned SQL migration files in `apps/server/migrations/`
- Runtime: `drizzle-orm/node-postgres` with `pg` driver
- Same `pg.Pool` instance used by Drizzle queries AND passed to `createAdapter(pool)` for Socket.IO
- Rollback: migration files are SQL; reverse migrations authored alongside each forward migration
- Versions: `drizzle-orm@^1.0.0-beta.2`, `drizzle-kit@rc` (rc track as of July 2026)

**Option 3 (Rejected): Prisma**
- Requires `ignoreDeprecations: "6.0"` for TypeScript 6 compatibility
- Generated client adds 5–15 MB to container image vs Drizzle's ~31 KB
- Mandatory `prisma generate` codegen step complicates CI
- Platform-specific Prisma engine binaries add ACA deployment friction

**Option 4 (Rejected): Flyway / Liquibase**
- JVM-based; awkward in Node.js pipelines

### Scenario C: Realtime Transport — Current State vs. Needed

**Current State (from contracts.ts + index.ts analysis):**
- Socket.IO is installed and partially implemented
- TypeScript typed event maps in contracts.ts follow the exact canonical Socket.IO 4.x pattern — confirmed correct
- `io.on('connection')` is the correct place for `session_snapshot` — confirmed (middleware runs before room join)
- Presence `client_left` on `disconnect` covers both clean and abrupt disconnects — confirmed correct
- `invokeAckSafely` guard for missing ack callbacks — correct pattern
- `io.to(sessionId).emit()` for broadcast and `socket.to(sessionId).emit()` for pointer-only — both correct

**The One Confirmed Gap — `opSeq` not wired into payload types:**
The server already computes `opSeq` per operation (concurrency tests assert on it), but it is not yet included in:
- `TilePlacedPayload` (broadcast to all clients)
- `TileRemovedPayload` (broadcast to all clients)
- `PlaceTileAck` (inline ack to placing client)
- `RemoveTileAck` (inline ack to removing client)
- `session_snapshot` (needs `lastOpSeq` for gap detection)

Adding `opSeq` to these types enables clients to detect gaps and trigger snapshot recovery — critical for sequencing guarantees.

**Transport Channel Options:**
1. **Socket.IO (current)** — WebSocket with automatic fallback, rooms, acks, reconnect built-in. **Keep; no migration needed.**
2. **Raw WebSocket (ws library)** — More control, less features; reimplements rooms, acks, reconnect. Not recommended.
3. **SSE (Server-Sent Events)** — One-way server-to-client; poor fit for bidirectional collaborative editing.
4. **WebRTC** — High complexity, not appropriate for server-authoritative model.

### Scenario D: Multi-Instance Scaling (Socket.IO Adapter)

For ACA horizontal scaling with multiple server replicas:
- Socket.IO's default in-memory adapter only works with a single process
- Need shared adapter for `io.to(sessionId).emit(...)` to reach all replicas
- **Note: Sticky sessions (ACA session affinity) are still required even with an adapter** — the adapter only synchronizes room broadcasts, not HTTP session routing

**Options:**
1. **@socket.io/postgres-adapter** — Uses Postgres LISTEN/NOTIFY. No separate Redis infra. Payloads up to 8 KB use NOTIFY inline (zzyix tile payloads are well under 1 KB). Aux table fallback for larger messages. Same `pg.Pool` instance used for queries. No Connection State Recovery (clients rely on `session_snapshot` instead).
2. **@socket.io/redis-adapter** — Redis Pub/Sub; standard approach. Requires separate Redis infra. `redis` package has known reconnect subscription bugs.
3. **Sticky sessions only** — Routes same client to same replica. Avoids adapter but fragile for canvases with multiple users on different replicas.

**Selected Approach: @socket.io/postgres-adapter**
- Reuses the existing Postgres `pg.Pool`; no new infrastructure
- zzyix payloads are well under the 8 KB NOTIFY limit
- Simpler operational model for the current ACA scale (1–3 replicas)

### Scenario E: Reconnect Behavior and Sequencing

**Current behavior (from contracts.ts comments):**
- Socket.IO automatic reconnection with exponential backoff
- Client queues mutations during disconnect
- Server sends `session_snapshot` on reconnect to sync missed state

**Proposed full reconnect flow with Postgres:**
1. Client disconnects; reconnects with same `clientId` and `sessionId`
2. Server loads latest snapshot from `snapshots` table (by `canvas_id`, `op_seq DESC`)
3. Server replays any `operation_log` entries with `op_seq > snapshot.op_seq`
4. Server emits `session_snapshot` with current tiles + `lastOpSeq`
5. Client discards any locally queued ops with `op_seq <= lastOpSeq`
6. Client replays remaining queued ops (sends `place_tile` / `remove_tile`)

**Sequencing guarantee:**
- `op_seq` is a per-canvas monotonically increasing integer (UNIQUE constraint in `operation_log`)
- Server validates replayed ops at current state; rejects stale/conflicting ops with existing ack mechanism

### Interaction Between #10 and #11

Issue #10 (Postgres) enables Issue #11 (Realtime) in these ways:
- `operation_log` enables reliable reconnect replay (replaces current in-memory-only snapshot)
- `snapshots` table enables fast full-state recovery without replaying entire log
- `@socket.io/postgres-adapter` uses Postgres LISTEN/NOTIFY — same Postgres connection
- `participants` table provides persistent presence history (complements in-memory ClientPresence)

**Recommended sequencing:** Implement #10 first (schema + migrations + basic CRUD), then #11 (complete Socket.IO integration using the new persistence layer).

## Retention and Archival Implications

* `operation_log` grows unboundedly; needs a retention policy
  * Suggested: Create a snapshot when log exceeds N operations (e.g., 500), then archive older log entries to cold storage or delete
  * Alternatively: Partition `operation_log` by `created_at` (monthly partitions) for easy archival
* `tiles` table is the live view; deletions are instant (cascade on canvas delete)
* `snapshots` table: keep only the N most recent per canvas (e.g., 3); older snapshots can be pruned
* `participants` table: `left_at IS NULL` indicates currently connected; old rows can be archived

## Test Strategy

**Unit tests (no Docker):** pg-mem for schema and query logic.
- Fast, instant state restore, no infra
- **Limitation: pg-mem does not implement LISTEN/NOTIFY** — cannot test the Socket.IO postgres adapter cross-replica path

**Integration tests (Docker required):** testcontainers-node for full Postgres stack.
- Real Postgres with LISTEN/NOTIFY
- Tests the `@socket.io/postgres-adapter` cross-instance broadcast path
- Compatible with GitHub Actions (Docker pre-installed)
- Recommended for: reconnect + snapshot recovery tests, operation_log ordering tests, concurrent placement tests that write to DB

## Actionable Next Steps for Implementation

**Issue #10 — Postgres Data Model:**
1. Add `pg`, `drizzle-orm`, `drizzle-kit`, `pg-mem`, `testcontainers` to `apps/server/package.json`
2. Create `apps/server/src/db/schema.ts` with Drizzle schema (canvases, tiles, operation_log, snapshots, participants, users)
3. Run `drizzle-kit generate` to produce initial migration SQL in `apps/server/migrations/`
4. Create `apps/server/src/db/client.ts` (connection pool, exported `db` instance)
5. Replace `sessions` Map with Postgres-backed read/write in `index.ts`
6. Implement snapshot creation trigger (after N operations, e.g. 500, or on canvas idle)
7. Add `node-cron` job for operation_log TTL cleanup (7-day retention initial policy)

**Issue #11 — Realtime Transport:**
8. Add `opSeq: number` to `TilePlacedPayload`, `TileRemovedPayload`, `PlaceTileAck`, `RemoveTileAck` in contracts.ts
9. Add `lastOpSeq: number` to the `session_snapshot` event payload
10. Add `@socket.io/postgres-adapter` and wire it to the shared `pg.Pool`
11. Confirm/implement `session_snapshot` emission in `io.on('connection')` handler using new Postgres-backed state
12. Write integration tests using testcontainers for reconnect+snapshot recovery and concurrent placement

**ADRs to document:**
- Schema versioning strategy (Drizzle migration files)
- Snapshot trigger policy (threshold, idle timer)
- Adapter choice (postgres adapter rationale)
