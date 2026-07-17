# Research: Revisioning and Idempotency Patterns

**Project:** zzyix (GitHub Issue #13)
**Date:** 2026-07-16
**Status:** Complete

---

## Existing Codebase Context

Before diving into patterns, key facts about the current zzyix implementation:

- **Op-log exists:** `operation_log` table with `(canvas_id, op_seq)` unique constraint; per-canvas sequence via `MAX(op_seq) + 1` inside an advisory-lock transaction.
- **Snapshots exist:** `snapshots` table keyed on `(canvas_id, op_seq)`.
- **Locking strategy:** `pg_advisory_xact_lock(hashtext(canvas_id))` — serializes all mutations per canvas inside a transaction.
- **No idempotency keys yet:** No `idempotency_key` column or table in current schema.
- **Drizzle ORM** with PostgreSQL (drizzle-orm/pg-core).

---

## Q1: Idempotency Key Patterns

### Standard HTTP Idempotency Key Approaches

Clients generate a unique key (typically UUID v4) and include it as a request header:

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

On the server, before executing the operation, check if this key has been seen before:

- **Cache hit:** Return the original cached response (same status code + body).
- **Cache miss:** Execute the operation, store the result, return it.

### Storage Option A — Dedicated `idempotency_keys` Table (Recommended)

```sql
CREATE TABLE idempotency_keys (
  key         TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,           -- scope keys per user/client
  request_hash TEXT       NOT NULL,           -- SHA-256 of method+path+body
  status_code INTEGER     NOT NULL,
  response    JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, user_id)
);
CREATE INDEX ON idempotency_keys (expires_at);  -- for TTL cleanup
```

**Trade-offs:**

| Aspect | Dedicated Table | Inline Column on Operation Table |
|--------|----------------|----------------------------------|
| Separation of concerns | Clean — idempotency logic isolated | Mixed — adds nullable column to every row |
| Cross-operation reuse | Easy — one table covers all endpoints | Hard — must add column per operation type |
| TTL/cleanup | Single DELETE query | Must sweep every table |
| Migration complexity | One new table | Multi-table alteration |
| Query complexity | JOIN or separate lookup | Single-table read |
| Recommended for | Most APIs (Stripe's approach) | Very simple single-operation APIs |

### Storage Option B — Inline `idempotency_key` Column

```sql
ALTER TABLE operation_log
  ADD COLUMN idempotency_key TEXT UNIQUE;
```

Works when all mutations go through one table. In zzyix, the `operation_log` table is a good candidate since all mutations (place/remove) are logged there — but idempotency responses need to include the cached HTTP response body, not just an op log entry.

### TTL and Cleanup

Stripe uses **24-hour TTL** for idempotency keys. This is a practical default: long enough to survive network retries, short enough to not grow the table unboundedly.

```sql
-- Cleanup job (run hourly via pg_cron or Node.js cron)
DELETE FROM idempotency_keys WHERE expires_at < NOW();
```

In Node.js with node-cron:

```typescript
import cron from 'node-cron'

cron.schedule('0 * * * *', async () => {
  const { db } = getDatabaseBundle()
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, new Date()))
})
```

### Returning the Cached Response

The response body and status code must be stored verbatim:

```typescript
// Drizzle insert + retrieve pattern
async function withIdempotency<T>(
  db: DatabaseClient,
  key: string,
  clientId: string,
  requestHash: string,
  handler: () => Promise<{ statusCode: number; body: T }>
): Promise<{ statusCode: number; body: T; fromCache: boolean }> {

  // 1. Check for existing key
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.clientId, clientId)))
    .limit(1)

  if (existing) {
    // Conflict: same key, different payload (Stripe returns 422)
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError('Same key used with different request body')
    }
    return { statusCode: existing.statusCode, body: existing.response as T, fromCache: true }
  }

  // 2. Execute operation
  const result = await handler()

  // 3. Store result (may race — use ON CONFLICT DO NOTHING + re-read)
  await db
    .insert(idempotencyKeys)
    .values({
      key,
      clientId,
      requestHash,
      statusCode: result.statusCode,
      response: result.body,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing()

  return { ...result, fromCache: false }
}
```

### Stripe-Style Idempotency Handling (Reference)

Stripe's documented behavior ([Stripe docs](https://stripe.com/docs/api/idempotent_requests)):
1. Key is scoped per API key (not global) — prevents cross-user replay.
2. Same key + same payload → return cached response.
3. Same key + different payload → HTTP 422 Unprocessable Entity.
4. Concurrent requests with same key → one proceeds, other waits, gets same response.
5. 24-hour TTL.
6. Keys stored server-side; client generates UUID v4.

The "concurrent same key" case requires a database-level lock or a serializable transaction. Simplest PostgreSQL approach:

```sql
-- Advisory lock on the idempotency key hash prevents concurrent execution
SELECT pg_advisory_xact_lock(hashtext('idem:' || $1));
```

This is already the pattern zzyix uses for canvas-level locking — same technique applies.

---

## Q2: Optimistic Locking / Revision Sequences

### Version Column (Compare-and-Swap)

The standard pattern adds an integer `version` (or `revision`) column to the entity table:

```sql
ALTER TABLE canvases ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
```

Every update increments it atomically and rejects stale writes:

```sql
UPDATE canvases
SET    version = version + 1,
       updated_at = NOW()
WHERE  id = $1
AND    version = $expectedVersion   -- compare-and-swap
RETURNING *;
```

If `RETURNING` returns 0 rows → version mismatch → reject with HTTP 409 Conflict.

**In Drizzle ORM:**

```typescript
import { and, eq, sql } from 'drizzle-orm'
import { canvases } from './schema'

async function bumpCanvasVersion(
  db: DatabaseClient,
  canvasId: string,
  expectedVersion: number
): Promise<typeof canvases.$inferSelect | null> {
  const [updated] = await db
    .update(canvases)
    .set({
      version: sql`${canvases.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(canvases.id, canvasId),
      eq(canvases.version, expectedVersion)   // compare-and-swap
    ))
    .returning()

  return updated ?? null  // null → stale version
}
```

### Per-Entity vs Global Sequences

| Approach | Per-entity sequence | Global sequence |
|----------|--------------------|-----------------| 
| Conflict scope | Only within one canvas | Across entire system |
| Gap detection | Easy — gaps in (canvas_id, op_seq) | Hard at per-entity level |
| Ordering guarantee | Per-canvas ordering | Total global ordering |
| Scalability | Scales better (parallel canvases) | Bottleneck at high write rates |
| zzyix fit | **Recommended** — already implemented | Unnecessary complexity |

zzyix already uses per-canvas `op_seq`. This is the right choice: each canvas is an independent CRDT-like collaboration space.

### Detecting and Rejecting Out-of-Order Operations

In the existing zzyix pattern, `op_seq` is assigned server-side (MAX + 1 inside advisory lock). Clients don't send an expected op_seq. If clients need to detect staleness, two patterns work:

**Option A: Client sends `lastKnownOpSeq` (Optimistic)**

```typescript
// Client sends:
{ tileId, shape, ..., lastKnownOpSeq: 14 }

// Server rejects if canvas.lastOpSeq > lastKnownOpSeq + TOLERANCE
if (serverOpSeq > params.lastKnownOpSeq + 1) {
  return { rejected: true, reason: 'STALE_STATE', currentOpSeq: serverOpSeq }
}
```

**Option B: Server always wins (current zzyix approach)**

Operations are serialized via advisory lock. The server assigns the next seq and applies domain validation. Clients don't need to send expected sequences for this pattern. This is simpler and appropriate for a cooperative (not adversarial) game canvas.

### PostgreSQL-specific Techniques

**`FOR UPDATE` (pessimistic locking):**

```sql
SELECT * FROM canvases WHERE id = $1 FOR UPDATE;
-- now update safely, no concurrent modification possible
```

In Drizzle, raw SQL is needed (no native `FOR UPDATE` support as of drizzle-orm v0.29):

```typescript
const [locked] = await tx.execute(
  sql`SELECT * FROM canvases WHERE id = ${canvasId} FOR UPDATE`
)
```

**`RETURNING` for atomic confirmation:**

```typescript
// Atomic: only returns a row if the WHERE matched
const [result] = await db
  .update(canvases)
  .set({ version: sql`${canvases.version} + 1` })
  .where(and(eq(canvases.id, id), eq(canvases.version, expected)))
  .returning()

if (!result) throw new ConflictError('Version mismatch')
```

**`pg_advisory_xact_lock` (current zzyix pattern):**

```typescript
// Already in use — serializes all mutations per canvas
await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`)
```

This is functionally equivalent to pessimistic locking for the canvas. As long as this advisory lock wraps the op_seq assignment, the sequence is always monotonically increasing without gaps.

---

## Q3: Conflict Behavior Strategies

### 3a: Stale-Revision Conflict

Client sent `revision: N` but server is at `N+2`.

| Strategy | Behavior | HTTP Status | Use Case |
|----------|----------|-------------|----------|
| **Reject** | Return 409 with current state | 409 Conflict | Mutations requiring consistency |
| **Last-write-wins** | Ignore client revision, apply anyway | 200 OK | Commutative operations (pointer moves) |
| **Merge** | Apply patch on top of current state | 200 OK | CRDT-compatible operations |
| **Queue** | Buffer and replay when state catches up | 202 Accepted | Eventually-consistent systems |

For zzyix tile placement: **Reject with 409** is safest. Return `currentOpSeq` in the error body so the client can re-sync:

```typescript
// Error response shape
{
  "error": "STALE_REVISION",
  "currentOpSeq": 16,
  "clientSentRevision": 14,
  "message": "Canvas has advanced; fetch current state and retry"
}
```

### 3b: Out-of-Order Arrival (sequence ≠ arrival order)

In zzyix's advisory-lock model, this cannot happen: the advisory lock serializes insertions, and `op_seq` is assigned at commit time. Arrival order = sequence order by construction.

If the project ever moves to a distributed model (multiple server instances without a shared lock), out-of-order ops become possible. Approaches:

- **Sequencer service:** Single goroutine/actor assigns sequences before fan-out.
- **Lamport timestamps:** Each op carries a logical clock; servers reconcile by Lamport order.
- **Vector clocks:** Full causality tracking — overkill for a two-operation domain.

For now: the advisory lock guarantees order. No additional mechanism needed.

### 3c: Idempotency Key with Different Payload

This is the "key reuse abuse" case. Stripe returns **HTTP 422 Unprocessable Entity**. The implementation must hash the request body and compare:

```typescript
import { createHash } from 'node:crypto'

function hashRequest(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method}:${path}:${JSON.stringify(body)}`)
    .digest('hex')
}

// On key conflict with different hash:
if (existing.requestHash !== currentHash) {
  res.status(422).json({
    error: 'IDEMPOTENCY_KEY_REUSE',
    message: 'The same idempotency key was sent with a different request body'
  })
  return
}
```

---

## Q4: Replay and Recovery (Event Sourcing Lite)

### zzyix Already Has Event Sourcing Lite

The `operation_log` + `snapshots` tables constitute an event-sourcing-lite architecture. Current `loadSessionReplayRecord` reconstructs state from a snapshot + subsequent ops.

```typescript
// Current pattern in repository.ts (conceptually):
const snapshot = await getLatestSnapshot(canvasId)
const ops = await getOpsSinceSnapshot(canvasId, snapshot.opSeq)
const tiles = ops.reduce(applyOperationToTiles, snapshot.state.tiles)
```

### Snapshot Strategy

zzyix already calls `persistSnapshotIfNeeded` — the threshold for when to snapshot determines replay cost:

| Snapshot Frequency | Replay Cost | Storage Cost |
|-------------------|-------------|--------------|
| Every N=10 ops | Low (max 10 ops to replay) | High (many snapshots) |
| Every N=50 ops | Medium | Medium |
| Every N=100 ops | Higher | Lower |
| On-demand only | Variable | Lowest |

**Recommended:** N=50 for a small-team project. This limits worst-case replay to 50 ops (typically sub-millisecond), while not bloating snapshot storage.

### Full Replay vs Snapshot + Tail

```typescript
// Full replay (expensive for long-lived canvases)
async function fullReplay(db: DatabaseClient, canvasId: string): Promise<TileInstance[]> {
  const ops = await db
    .select()
    .from(operationLog)
    .where(eq(operationLog.canvasId, canvasId))
    .orderBy(asc(operationLog.opSeq))
  return ops.reduce(applyOperationToTiles, [])
}

// Snapshot + tail (current zzyix pattern — correct approach)
async function replayFromSnapshot(db: DatabaseClient, canvasId: string): Promise<TileInstance[]> {
  const [snap] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.canvasId, canvasId))
    .orderBy(desc(snapshots.opSeq))
    .limit(1)

  const baseSeq = snap?.opSeq ?? 0
  const baseTiles = (snap?.state as { tiles: TileInstance[] })?.tiles ?? []

  const tailOps = await db
    .select()
    .from(operationLog)
    .where(and(
      eq(operationLog.canvasId, canvasId),
      sql`${operationLog.opSeq} > ${baseSeq}`
    ))
    .orderBy(asc(operationLog.opSeq))

  return tailOps.reduce(applyOperationToTiles, baseTiles)
}
```

### Gap Detection in Op Log

If ops are expected to be contiguous, gaps indicate corruption or missed operations:

```typescript
function detectGaps(ops: { opSeq: number }[]): number[] {
  const gaps: number[] = []
  for (let i = 1; i < ops.length; i++) {
    if (ops[i].opSeq !== ops[i - 1].opSeq + 1) {
      gaps.push(ops[i - 1].opSeq + 1)
    }
  }
  return gaps
}
```

In zzyix, the `UNIQUE(canvas_id, op_seq)` constraint prevents duplicate sequences; the advisory lock prevents gaps. Gaps should not occur in normal operation.

---

## Q5: Drizzle ORM Specifics

### Atomic Compare-and-Swap in Drizzle

```typescript
import { and, eq, sql } from 'drizzle-orm'
import { canvases } from './db/schema'

// Returns the updated row, or null if version did not match
async function casCanvasVersion(
  db: DatabaseClient,
  canvasId: string,
  expectedVersion: number
): Promise<typeof canvases.$inferSelect | null> {
  const [row] = await db
    .update(canvases)
    .set({
      version: sql`${canvases.version} + 1`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(canvases.id, canvasId),
        eq(canvases.version, expectedVersion)
      )
    )
    .returning()

  return row ?? null
}
```

### Safe NULL-to-NOT-NULL Column Migration (Drizzle)

Adding a column with a default (no downtime):

```typescript
// Step 1: Add nullable column (instant, no table rewrite)
// Migration 0002:
export async function up(db: Kysely<any> | NodePgDatabase) {
  await db.schema.alterTable('canvases').addColumn('version', 'integer').execute()
}

// Drizzle migration equivalent — write raw SQL in the migration file:
```

```sql
-- 0002_add_canvas_version.sql

-- Step 1: Add nullable column with default (safe, no lock on large tables)
ALTER TABLE canvases ADD COLUMN version INTEGER DEFAULT 0;

-- Step 2: Backfill existing rows (batched if table is large)
UPDATE canvases SET version = 0 WHERE version IS NULL;

-- Step 3: Add NOT NULL constraint (in PostgreSQL 12+, this is a metadata-only
-- change if the column has no NULLs and has a NOT VALID check — or run at
-- low-traffic time for older versions)
ALTER TABLE canvases ALTER COLUMN version SET NOT NULL;
ALTER TABLE canvases ALTER COLUMN version SET DEFAULT 0;
```

For large tables, use the PostgreSQL 12+ `NOT VALID` + `VALIDATE CONSTRAINT` pattern to avoid full table locks:

```sql
-- Safe on large tables (PostgreSQL 12+)
ALTER TABLE canvases ADD COLUMN version INTEGER;
UPDATE canvases SET version = 0 WHERE version IS NULL;
-- Do not set NOT NULL until all rows are backfilled in batches
ALTER TABLE canvases ALTER COLUMN version SET NOT NULL;
```

### Drizzle Schema for Version Column

```typescript
// In schema.ts
export const canvases = pgTable(
  'canvases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    version: integer('version').notNull().default(0),   // <-- add this
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    updatedAtIndex: index('canvases_updated_at_idx').on(table.updatedAt),
  }),
)
```

### Drizzle Schema for Idempotency Keys

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

### Transaction Isolation for Idempotency Checks

The default PostgreSQL isolation level is `READ COMMITTED`. For idempotency checks, this can cause a race: two concurrent requests both read "no existing record" and both proceed.

**Solutions:**

1. **Advisory lock (recommended for zzyix):** Hash the idempotency key and use `pg_advisory_xact_lock`. This is already the pattern in zzyix for canvas mutations.

```typescript
await tx.execute(sql`
  SELECT pg_advisory_xact_lock(hashtext('idem:' || ${key}))
`)
const [existing] = await tx.select().from(idempotencyKeys).where(...)
```

2. **`ON CONFLICT DO NOTHING` + re-read:** Insert the record at the start (before executing the operation), with a placeholder. On conflict, re-read the existing record. This avoids the race but requires two transactions.

3. **`SERIALIZABLE` isolation:** Eliminates phantom reads, but higher overhead and more aborts under contention.

For zzyix scale (small team, low concurrency), advisory lock is the right choice — consistent with the existing pattern.

---

## Trade-off Summary Tables

### Idempotency Storage Approaches

| Criterion | Dedicated Table | Inline Column (`operation_log`) |
|-----------|----------------|--------------------------------|
| Schema clarity | High | Low (mixes concerns) |
| Coverage (multiple endpoints) | All endpoints, one table | Only `operation_log`-backed ops |
| Cached response storage | Explicit `response JSONB` column | Must reconstruct from op log |
| TTL cleanup | Single query | Query per table |
| Migration cost | One new table | Column addition + backfill |
| Implementation effort | Medium | Low |
| **Recommendation** | **Preferred for multi-endpoint APIs** | OK if all ops go through one log |

### Revisioning Approaches

| Criterion | Advisory Lock (current) | Version CAS Column | `FOR UPDATE` |
|-----------|------------------------|--------------------|--------------|
| Conflict detection | Implicit (serialized) | Explicit (caller detects) | Implicit |
| Client participation | None required | Client sends expected version | None required |
| Retry friendliness | Always latest seq assigned | Client must re-fetch + retry | Auto-retry in DB |
| Distributed-safe | No (single node lock) | Yes (DB-enforced) | Yes (row lock) |
| Performance | Good (per-canvas scope) | Good | Good |
| Implementation | Already done | Moderate | Moderate |
| **Recommendation** | **Keep for op_seq** | **Add for HTTP mutations** | For replay safety |

---

## Recommended Approach for zzyix (Small Team + PostgreSQL + Drizzle)

### Summary

The existing advisory-lock + op-log pattern is sound. The recommended additions for Issue #13 are:

1. **Idempotency keys:** Add a dedicated `idempotency_keys` table. Scope keys to `(key, client_id)`. Store `request_hash`, `status_code`, `response`. Use advisory lock on `hashtext('idem:' || key)` inside the existing transaction pattern. TTL = 24 hours; add cleanup to the existing retention job (`jobs/retention.ts`).

2. **Revision column:** Add `version INTEGER NOT NULL DEFAULT 0` to `canvases`. On HTTP mutations (REST POST/DELETE), return the `version` in the response body. Clients may optionally send `X-Expected-Version` header. Server rejects with 409 if version doesn't match. This is additive — Socket.IO flow continues to use advisory lock + op_seq as before.

3. **No op_seq changes needed:** The existing per-canvas `op_seq` is already a correct monotonic revision sequence for the op log. Do not change this.

4. **No event sourcing changes needed:** The snapshot + tail-replay pattern is correct. Tune the snapshot threshold if replay latency becomes measurable.

5. **Conflict behavior:**
   - Stale revision → HTTP 409 with `{ currentVersion, currentOpSeq }` in body.
   - Idempotency key reuse with different body → HTTP 422.
   - Advisory lock prevents out-of-order op_seq at the persistence layer.

### Minimal Implementation Plan

```
Phase 1: Idempotency keys
  - Migration: CREATE TABLE idempotency_keys
  - Middleware: withIdempotency() wrapper
  - Cleanup: extend retention job

Phase 2: Version column
  - Migration: ALTER TABLE canvases ADD COLUMN version
  - Repository: casCanvasVersion() helper
  - HTTP handlers: return version in response, check X-Expected-Version

Phase 3: Error contracts
  - Add STALE_REVISION and IDEMPOTENCY_KEY_REUSE to contracts.ts
  - HTTP status codes: 409 for stale, 422 for key reuse
```

---

## External References

- [Stripe Idempotent Requests](https://stripe.com/docs/api/idempotent_requests) — canonical reference for key scoping, TTL, 422 on payload mismatch
- [Stripe Engineering: Designing Robust and Predictable APIs with Idempotency](https://stripe.com/blog/idempotency) — deep dive into locking strategy and crash recovery
- [Martin Fowler: Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — conceptual foundation
- [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) — `pg_advisory_xact_lock` semantics
- [PostgreSQL: Adding columns safely](https://www.postgresql.org/docs/current/sql-altertable.html) — NOT NULL + DEFAULT without full rewrite (PostgreSQL 11+)
- [Drizzle ORM: Update + RETURNING](https://orm.drizzle.team/docs/update) — `.returning()` chaining
- [Drizzle ORM: Transactions](https://orm.drizzle.team/docs/transactions) — `db.transaction(async tx => ...)`

---

## Follow-on Questions / Clarifications Needed

1. **Does Issue #13 require client-facing revision semantics on the Socket.IO path, or only on the REST HTTP path?** The advisory lock + op_seq already handles Socket.IO. If HTTP clients also need CAS protection, the version column is needed on `canvases`.

2. **What is the expected concurrency level?** For very low concurrency (single-digit concurrent users), the advisory lock is sufficient with no additional changes. For higher concurrency, a version CAS column is safer.

3. **Should idempotency keys be scoped to `client_id` (anonymous user identity) or to authenticated user sessions?** The current schema uses `client_id` (socket identity). If HTTP auth is added, key scoping should align with the auth identity.

4. **Should idempotency apply to tile removal (DELETE) as well as tile placement (POST)?** DELETE operations are naturally idempotent by HTTP semantics (deleting a non-existent tile returns 404 or 204), but if the client needs the exact cached 204 response replayed, an idempotency record is still useful.
