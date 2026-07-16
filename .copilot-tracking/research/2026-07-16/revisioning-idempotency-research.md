<!-- markdownlint-disable-file -->
# Task Research: Revisioning and Idempotency

Implement revision tracking and idempotency in the zzyix server (GitHub Issue #13) so retries do not duplicate changes and operation ordering remains deterministic.

## Task Implementation Requests

* Add operation revision metadata and sequence rules.
* Implement idempotency keys and duplicate detection.
* Define conflict behavior for stale or out-of-order operations.
* Document replay and recovery behavior.

## Scope and Success Criteria

* Scope: Server-side — apps/server/src/db/schema.ts, repository.ts, contracts.ts, index.ts, jobs/retention.ts, and a new Drizzle migration. Client is out of scope unless contract changes require it.
* Assumptions:
  * PostgreSQL backing store via Drizzle ORM (confirmed).
  * All mutations go through Socket.IO (no REST mutation endpoints implemented yet).
  * Tile UUIDs are already client-assigned (no server-side defaultRandom on tiles.id).
  * Advisory-lock-per-canvas serialization pattern already in place.
* Success Criteria:
  * Duplicate `place_tile` socket events (same tile UUID) are silently absorbed — no double-write.
  * Duplicate `remove_tile` socket events for an already-removed tile are safely absorbed.
  * Ordering is deterministic: op_seq is always monotonically increasing per canvas (already true via advisory lock; must remain true).
  * Revision and idempotency logic is validated in new Vitest unit + integration tests.
  * Conflict/error shapes are documented in contracts.ts.

## Outline

1. What already exists (large head start)
2. Gaps that Issue #13 must close
3. Selected approach and implementation plan
4. Alternatives considered and rejected
5. Key file references with line numbers
6. Error contract additions
7. Migration plan
8. Test strategy

## Research Executed

### File Analysis

* apps/server/src/db/schema.ts
  * 5 tables: canvases, tiles, participants, operation_log, snapshots, users
  * operation_log has UNIQUE(canvas_id, op_seq) and per-canvas pg_advisory_xact_lock
  * tiles.id is client-assigned (no .defaultRandom()) — this is the idempotency hook
  * canvases has no version column (gap for HTTP optimistic locking)
  * Full table details: .copilot-tracking/research/subagents/2026-07-16/codebase-analysis.md §1

* apps/server/src/db/repository.ts
  * persistTilePlacement accepts optional tileId (L255) — partial idempotency scaffolding already present
  * Advisory lock: pg_advisory_xact_lock(hashtext(sessionId)) wraps every write transaction
  * op_seq computed as MAX(op_seq) + 1 inside advisory-locked transaction — monotone, gap-free
  * markParticipantJoined uses onConflictDoUpdate — already idempotent
  * loadSessionRecord uses onConflictDoNothing — already idempotent
  * Full function table: .copilot-tracking/research/subagents/2026-07-16/codebase-analysis.md §7

* apps/server/src/contracts.ts
  * PlaceTileAck returns opSeq on success — already wired
  * TilePlacedPayload, TileRemovedPayload, SessionSnapshotPayload all carry opSeq
  * No idempotency key type or STALE_REVISION / IDEMPOTENCY_KEY_REUSE error shapes exist yet
  * REST endpoints documented but NOT implemented in index.ts

* apps/server/src/index.ts
  * Only GET /health is implemented as REST; everything else is Socket.IO
  * Write path: place_tile → isPlaceTilePayload guard → loadSessionRecord → validatePlacement → persistTilePlacement → ack + broadcast
  * In-memory sessions map is ephemeral; DB is ground truth

* apps/server/src/db/snapshots.ts
  * SNAPSHOT_EVERY_OPS = 25 (env-configurable)
  * Snapshot + tail-replay pattern for reconnect is correct

* apps/server/migrations/
  * 0000: initial schema creation
  * 0001: check constraint refresh only (no structural change)
  * Next migration needed: add idempotency_keys table (+ optional version column on canvases)

* apps/server/src/index.test.ts, index.integration.test.ts
  * Framework: Vitest
  * Unit tests: pure in-memory via createAuthoritativeSessionState
  * Integration tests: vi.fn() repository mocks — no real DB
  * New tests must follow same pattern

### External Research

* Stripe Idempotent Requests documentation
  * Canonical reference: client generates UUID v4 key, server stores response, 24h TTL, same key + different body → 422
  * Source: https://stripe.com/docs/api/idempotent_requests

* PostgreSQL advisory locks
  * pg_advisory_xact_lock(bigint) serializes per hash within a transaction — already used in zzyix
  * Source: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

* Drizzle ORM update + RETURNING
  * .update().set().where().returning() — zero rows returned signals CAS mismatch
  * Source: https://orm.drizzle.team/docs/update

### Project Conventions

* Drizzle ORM for all DB access (no raw SQL except advisory lock and op_seq MAX)
* Vitest for all tests
* In-memory unit test isolation; vi.fn() mocks for integration tests
* Repository functions are the only DB access layer; index.ts calls repository functions

## Key Discoveries

### What Already Exists (Large Head Start)

1. op_seq: per-canvas monotonic integer sequence, enforced by UNIQUE(canvas_id, op_seq) and advisory lock. Replay-safe.
2. opSeq on the wire: PlaceTileAck, TilePlacedPayload, TileRemovedPayload, SessionSnapshotPayload all already carry opSeq.
3. Client-assigned tile IDs: tiles.id has no server-side default — clients can supply deterministic UUIDs, enabling natural DB-level dedup via INSERT ... ON CONFLICT (id) DO NOTHING.
4. Partial idempotency hook: persistTilePlacement already accepts optional tileId parameter (repository.ts L255).
5. Advisory lock: pg_advisory_xact_lock(hashtext(sessionId)) already serializes all canvas mutations — out-of-order op_seq is structurally impossible.
6. Event sourcing lite: operation_log + snapshots + applyOperationToTiles reducer already in place. No changes needed.
7. Retention job: apps/server/src/jobs/retention.ts already sweeps old ops/snapshots — idempotency key TTL cleanup can be added there.

### Gaps That Must Be Closed

1. No tile-level idempotency: Retrying place_tile with a new UUID (client didn't receive the ACK) creates a duplicate tile. Fix: require client to supply tileId in PlaceTilePayload; use INSERT INTO tiles ON CONFLICT (id) DO NOTHING.
2. remove_tile not idempotent at the application level: A retry after a network drop currently finds no tile and writes no op_log entry — but may have already consumed an op_seq in the in-memory counter. Fix: look up the existing op_log entry by tile-id before inserting a new one.
3. No error contract for idempotency conflicts: No STALE_REVISION or IDEMPOTENCY_KEY_REUSE types in contracts.ts.
4. No version column on canvases: Needed only if HTTP REST mutations are added. Not needed for the Socket.IO-only path.

### Write Path: place_tile (Current)

```
Client → socket.emit('place_tile', payload, ack)
  ↓ isPlaceTilePayload(payload) guard
  ↓ loadSessionRecord(sessionId) — reads canvases + tiles
  ↓ validatePlacement(shape, transform, tiles, bounds) — SAT domain logic
  [invalid] → ack({ rejected: true, reason })
  [valid]
  ↓ persistTilePlacement({ sessionId, payload, placedBy })
    ↓ db.transaction:
        pg_advisory_xact_lock(hashtext(sessionId))
        getNextOpSeq(tx, sessionId) — MAX(op_seq) + 1
        INSERT INTO tiles ... (id from payload.tileId or generated)
        INSERT INTO operation_log (op_seq, op_type='tile_placed', payload)
        UPDATE canvases SET updated_at = now()
        SELECT tiles WHERE canvas_id = sessionId
        return { opSeq, session, ack, event }
  ↓ invokeAckSafely(ack, result.ack)
  ↓ io.to(sessionId).emit('tile_placed', result.event)
  ↓ persistSnapshotIfNeeded(sessionId, opSeq, session) — every 25 ops
```

### Complete Examples

#### Tile idempotency via tileId (recommended core fix)

```typescript
// In repository.ts — persistTilePlacement
// Change INSERT to use ON CONFLICT DO NOTHING and return existing op_seq on dup

const [existingOp] = await tx
  .select()
  .from(operationLog)
  .where(and(
    eq(operationLog.canvasId, sessionId),
    sql`payload->>'tileId' = ${payload.tileId}`
  ))
  .limit(1)

if (existingOp) {
  // Idempotent replay: return cached opSeq without a second write
  return { opSeq: existingOp.opSeq, /* ... */ }
}
```

#### Drizzle schema for idempotency_keys (if HTTP path is added)

```typescript
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    clientId: text('client_id').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    response: jsonb('response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.key, table.clientId] }),
    expiresAtIndex: index('idempotency_keys_expires_at_idx').on(table.expiresAt),
  }),
)
```

#### Conflict error shapes for contracts.ts

```typescript
type PlaceTileRejectReason =
  | 'OUT_OF_BOUNDS'
  | 'OVERLAP'
  | 'GAP_TOO_LARGE'
  | 'PLACEMENT_REJECTED'
  | 'DUPLICATE_OPERATION'  // new: same tileId already placed

type RemoveTileRejectReason =
  | 'TILE_NOT_FOUND'       // new: tile already removed (idempotent path)
```

## Technical Scenarios

### Scenario A: Socket.IO Tile Idempotency (Selected — Primary Issue #13 Scope)

The client generates a UUID for each tile before emitting place_tile. If the ACK is lost and the client retries with the same tileId, the server must absorb the retry without creating a second tile.

**Requirements:**
* PlaceTilePayload must include tileId (currently optional — make required)
* persistTilePlacement must detect existing tiles by id and return the cached opSeq
* remove_tile must detect already-removed tiles and return the existing op_log entry

**Implementation Details:**

Phase 1 — Tile placement idempotency:
1. Make tileId required in PlaceTilePayload (contracts.ts + client)
2. In persistTilePlacement: before INSERT INTO tiles, check if tiles.id already exists in the canvas; if so, look up the associated operation_log entry and return its opSeq as the ack — no new writes.
3. The advisory lock already prevents concurrent double-inserts within the same transaction.
4. Add DUPLICATE_OPERATION to PlaceTileRejectReason or return as non-rejected ack with existing opSeq.

Phase 2 — Tile removal idempotency:
1. In persistTileRemoval: if the tile is not found in tiles table, check operation_log for an existing tile_removed entry for that tileId; if found, return its opSeq; if not found (tile never existed), return { removed: false }.
2. This makes remove_tile fully idempotent.

Phase 3 — Contract error shapes:
1. Add DUPLICATE_OPERATION reject reason.
2. Add STALE_STATE reject reason (for future HTTP path).
3. Document replay behavior in comments.

**File tree changes:**
```
apps/server/src/contracts.ts           — add error shapes
apps/server/src/db/repository.ts       — idempotency checks in persistTilePlacement + persistTileRemoval
apps/server/src/db/schema.ts           — (no change needed for Socket.IO scope)
apps/server/src/index.ts               — (minor: remove guard now that tileId is required)
apps/server/src/index.test.ts          — new unit tests for duplicate ack
apps/server/src/index.integration.test.ts  — new integration tests
```

No new migration needed for the Socket.IO-only scope (tiles.id UNIQUE is already enforced at DB level).

#### Considered Alternatives

**Alternative B: Dedicated idempotency_keys table (HTTP-path pattern)**
Full Stripe-style idempotency table with request hash, TTL, and stored response body. Best for REST APIs with multiple endpoints. Overkill for the current Socket.IO-only mutation path. Requires a new migration, a new table, and retention job changes.

Rejected for primary Issue #13 scope because all mutations are Socket.IO and the tile UUID dedup approach is simpler and already partially scaffolded. Should be revisited if REST mutations are implemented.

**Alternative C: Client sends lastKnownOpSeq for optimistic locking**
Adds lastKnownOpSeq to every mutation payload. Server rejects with STALE_STATE if serverOpSeq > lastKnownOpSeq + 1. Adds collaborative conflict detection (e.g., "two users placed a tile simultaneously").

Rejected for Issue #13 because: (1) advisory lock already serializes, so a stale-rejection would affect every second concurrent user unnecessarily; (2) this is a cooperative canvas, not an adversarial one; (3) the issue scope does not call for collaborative conflict rejection, only for retry idempotency.

**Alternative D: version column on canvases**
Add version INTEGER to canvases for HTTP-level compare-and-swap. Useful only when REST POST/DELETE endpoints are implemented.

Deferred: not needed for Socket.IO scope. Should be added in the same PR that implements the REST tile endpoints.

## File Reference Index

| File | Key Content |
|------|-------------|
| apps/server/src/db/schema.ts | Table definitions — tiles.id client-assigned (no defaultRandom) |
| apps/server/src/db/repository.ts | persistTilePlacement (accepts tileId, L255); persistTileRemoval; advisory lock pattern |
| apps/server/src/db/snapshots.ts | SNAPSHOT_EVERY_OPS=25; persistSnapshotIfNeeded |
| apps/server/src/contracts.ts | PlaceTileAck with opSeq; PlaceTileRejectReason enum |
| apps/server/src/index.ts | place_tile and remove_tile socket handlers; only /health REST endpoint |
| apps/server/src/index.test.ts | Unit test patterns (createAuthoritativeSessionState, Vitest) |
| apps/server/src/index.integration.test.ts | Integration test patterns (vi.fn() repository mocks) |
| apps/server/src/jobs/retention.ts | TTL cleanup job — extension point for idempotency key sweeps |
| apps/server/migrations/ | 0000 initial schema, 0001 check constraint refresh |

## Actionable Next Steps (Implementation)

1. contracts.ts: Add DUPLICATE_OPERATION to PlaceTileRejectReason. Add a new PlaceTileIdempotentAck shape (non-rejected, returns existing opSeq).
2. repository.ts / persistTilePlacement: Inside the advisory-locked transaction, after acquiring the lock, query `SELECT id FROM tiles WHERE id = tileId AND canvas_id = sessionId`; if found, query `SELECT op_seq FROM operation_log WHERE canvas_id = sessionId AND payload->>'tileId' = tileId AND op_type = 'tile_placed'`; return that opSeq without further writes.
3. repository.ts / persistTileRemoval: After failed DELETE (0 rows), query operation_log for an existing tile_removed entry; return its opSeq if found.
4. index.test.ts: Add unit tests — "place_tile with duplicate tileId returns existing opSeq and does not emit tile_placed again".
5. index.integration.test.ts: Add integration tests — "duplicate place_tile ack matches original opSeq".
6. (Optional, deferred) Migration 0002: Add idempotency_keys table for future HTTP path.
7. (Optional, deferred) Migration 0002 or 0003: Add version column to canvases for HTTP optimistic locking.
