<!-- markdownlint-disable-file -->
# Research: Postgres Schema & Tooling for zzyix Server Migration

Research conducted 2026-07-16. Covers ORM/migration tooling, Socket.IO postgres adapter, testing
strategy, operation-log + snapshot schema pattern, and retention strategy.

---

## Workspace Context (Read Files)

### apps/server/package.json — current state

```json
{
  "type": "module",
  "dependencies": {
    "express": "^4.20.1",
    "socket.io": "^4.8.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.23",
    "@types/node": "^24.13.2",
    "@vitest/coverage-v8": "^4.1.10",
    "nodemon": "^3.1.7",
    "ts-node": "^10.9.2",
    "typescript": "~6.0.2",
    "vitest": "^4.1.10"
  }
}
```

Key constraints:
- `"type": "module"` — ESM-first. Any ORM must be ESM-compatible.
- TypeScript ~6.0.2 — Prisma requires `ignoreDeprecations: "6.0"` in tsconfig.
- Vitest for testing.
- No pg driver yet (must be added).

### apps/server/src/index.ts — current state summary

- In-memory `sessions` Map: `Map<string, AuthoritativeSessionState>`
- `AuthoritativeSessionState` contains: `session: Session`, `clients: Map<string, ClientPresence>`, `lastOpSeq: number`
- `lastOpSeq` increments on every `place_tile`/`remove_tile` — maps directly to future `op_seq` column
- `getSessionState(sessionId)` auto-creates session if missing (lazy init pattern)
- `cleanupSessions()` deletes sessions with no clients and tiles unchanged after 30 min
- Socket.IO: rooms keyed by `sessionId`, broadcasts `tile_placed`, `tile_removed`, `pointer_update`, `client_joined`, `client_left`

### apps/server/src/contracts.ts — data model

Authoritative types that map to Postgres columns:

```typescript
type TileShape = 'square' | 'triangle' | 'rectangle' | 'l-shape'
type MaterialVariant = 'ceramic' | 'glass' | 'stone'

type TileInstance = {
  id: string           // UUID, server-assigned
  shape: TileShape
  color: string        // CSS hex string
  material: MaterialVariant
  transform: Transform2D  // { position: Vec2, rotation: number, mirrored?: boolean }
  createdAt: number    // Unix ms
}

type Session = {
  id: string           // UUID
  tiles: TileInstance[]
  createdAt: number
  updatedAt: number
}
```

Operations:
- `place_tile(PlaceTilePayload, clientId)` → `PlaceTileAck` (accepted/rejected + `TilePlacedPayload` event)
- `remove_tile(RemoveTilePayload, clientId)` → `RemoveTileAck` + `TileRemovedPayload` event

`InterServerEvents` is empty `{}` — signals multi-server sync is not yet designed.

### docs/decisions/2026-07-15-deployment-architecture-v01.md

- Platform: Azure Container Apps (ACA)
- Sticky sessions enabled for single-replica initial deployment
- Multi-replica cross-server state sync deferred (no Redis yet)
- Cross-replica sync will use a pub-sub layer (Redis or similar) — Postgres adapter fits this role
- Container images via GHCR; secrets via GitHub Actions env vars → env vars in containers
- WebSockets: ACA supports natively; 240s idle timeout → heartbeat required

---

## Q1 — ORM / Migration Tooling: Drizzle vs Prisma vs raw pg

### Drizzle ORM + drizzle-kit

Source: https://orm.drizzle.team/docs/overview, https://orm.drizzle.team/docs/migrations,
https://orm.drizzle.team/docs/get-started-postgresql

**Versions (2026-07-16):**
- `drizzle-orm`: v1.0.0-beta.2 (rc tag on npm; v1.0 general release imminent)
- `drizzle-kit`: v1.0.0-rc (drizzle-kit@rc on npm)

**Install:**
```bash
npm i drizzle-orm pg
npm i -D drizzle-kit @types/pg
```

**Schema (TypeScript-first, no code generation):**
```typescript
// src/db/schema.ts
import { pgTable, uuid, text, jsonb, bigint, timestamp, index } from 'drizzle-orm/pg-core'

export const sessions = pgTable('sessions', {
  id:         uuid('id').primaryKey(),
  tiles:      jsonb('tiles').notNull().$type<TileInstance[]>().default([]),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const operationLog = pgTable('operation_log', {
  id:        bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  opSeq:     bigint('op_seq', { mode: 'number' }).notNull(),
  opType:    text('op_type').notNull(),       // 'place_tile' | 'remove_tile'
  opPayload: jsonb('op_payload').notNull(),
  actorId:   text('actor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('operation_log_session_id_idx').on(t.sessionId),
  index('operation_log_created_at_idx').on(t.createdAt),
])
```

**Database connection (ESM, with existing pg Pool):**
```typescript
// src/db/client.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle({ client: pool, schema })
export { pool }  // expose pool for socket.io postgres adapter
```

Note: the `pool` instance is shared between Drizzle queries and `@socket.io/postgres-adapter`
— they use the same `pg.Pool`, no extra connections needed.

**Migration workflow (Option 3 — generate SQL files):**
```bash
# drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/db/schema.ts',
  out:    './drizzle',          // SQL migration files committed to git
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})

# Generate migration SQL from schema diff:
npx drizzle-kit generate

# Apply pending migrations:
npx drizzle-kit migrate

# In CI/CD (ACA deploy): run migrate before starting server
```

**Runtime query safety:**
Fully type-safe: insert/select/update types are inferred from the schema definition.
No runtime code generation.

**Bundle size:**
~31KB (per drizzle docs; "0 dependencies" — the pg pool comes from `pg` which you already need).
Contrast with Prisma Client which is typically 5–15 MB on disk after `prisma generate`.

**ACA compatibility:**
Full compatibility. Pure Node.js library, no native binaries, no sidecar processes.
Migrations run as a startup step in the ACA container init or via a separate migration job.
The `DATABASE_URL` is injected as an env var (matches the existing GitHub Actions → ACA secret pattern).

**drizzle-kit@rc note:**
v1.0.0-beta.2 merged "alternation-engine" into beta. This is production-quality but watch the
changelog; pin to exact version in package.json until v1.0 stable releases.

---

### Prisma ORM

Source: https://www.prisma.io/docs/getting-started/setup-prisma/start-from-scratch/relational-databases-typescript-postgresql

**Install:**
```bash
npm i -D prisma @types/pg
npm i @prisma/client @prisma/adapter-pg pg dotenv
```

**Schema language:** proprietary `.prisma` DSL (not TypeScript).

**Codegen requirement:** `prisma generate` must run before the app builds. This adds a CI step and
produces a large generated client under `node_modules/@prisma/client` or a custom output path.

**TypeScript 6 caveat:** requires `"ignoreDeprecations": "6.0"` in tsconfig.json because Prisma's
generated types depend on deprecated TS APIs that were removed in TS 6.

**ESM support:** functional but Prisma's ESM path is newer and less battle-tested than Drizzle's.
Prisma uses `moduleResolution: "bundler"` which conflicts with Node.js native ESM resolution
(`moduleResolution: "node16"` or `"nodenext"`) in some configurations.

**Bundle size:** ~5–15 MB after codegen; Prisma binaries (query engine) add several MB more.
Significantly heavier than Drizzle for a containerized microservice.

**Migration workflow:** `prisma migrate dev` generates SQL files and applies them. Good tooling
(Prisma Studio GUI), but the extra codegen step complicates CI pipelines.

**ACA compatibility:** Works, but the larger container image and the `prisma generate` build step
add complexity. The Prisma binary is platform-specific (must match ACA's Linux x64/arm64 arch).

---

### Raw pg + SQL migration scripts

**Tools:** `node-postgres` (`pg`) + hand-written `.sql` files + a migration runner.
Options for the runner:
- `db-migrate` npm package
- `flyway` (JVM, adds overhead)
- A minimal custom runner using `pg` + a `schema_migrations` table

**Pros:** Maximum control, no ORM overhead, zero additional abstractions.

**Cons:**
- No TS-first schema; types must be manually maintained alongside SQL
- More boilerplate for type-safe queries
- Higher developer overhead for a small team

---

### Comparison Table

| Criterion                 | Drizzle + drizzle-kit       | Prisma                    | Raw pg + SQL scripts       |
|---------------------------|-----------------------------|---------------------------|----------------------------|
| TS-first schema           | ✅ Native TS                | ⚠️ Custom DSL             | ❌ Manual types             |
| Generated migration files | ✅ SQL files via drizzle-kit| ✅ SQL files via migrate   | ✅ Manual SQL files         |
| Runtime query type safety | ✅ Full inference           | ✅ Full inference          | ⚠️ Manual / partial        |
| Bundle size (runtime)     | ✅ ~31 KB, 0 deps           | ⚠️ ~5–15 MB + binaries    | ✅ pg only (~1 MB)          |
| ACA container             | ✅ No native binaries       | ⚠️ Platform-specific bins | ✅ Pure JS                  |
| ESM + TS 6 compat         | ✅ Native ESM               | ⚠️ Requires workarounds   | ✅ Transparent              |
| Codegen at build time     | ❌ Not required             | ✅ Required (prisma gen)  | ❌ Not required             |
| Shares pg pool w/ sio     | ✅ Yes                      | ✅ Yes (adapter-pg)        | ✅ Yes                      |
| Maturity / community      | ✅ 35k GitHub stars, v1.0   | ✅ Very mature             | ✅ Mature                   |
| vitest integration        | ✅ Straightforward          | ✅ Straightforward         | ✅ Straightforward          |

**Recommendation: Drizzle ORM with drizzle-kit.**

Rationale:
1. Native ESM, no codegen — fits the existing ESM-first monorepo perfectly.
2. Zero runtime dependencies, smallest container footprint (ACA cost/startup).
3. TS-first schema in `.ts` files matches the existing codebase conventions.
4. The `pg.Pool` instance used by Drizzle is the same instance passed to
   `@socket.io/postgres-adapter` — no second connection pool needed.
5. drizzle-kit generates auditable SQL migration files that can be reviewed in PRs.
6. No TypeScript 6 deprecation workarounds needed.

---

## Q2 — @socket.io/postgres-adapter: LISTEN/NOTIFY, schema, limitations

Source: https://socket.io/docs/v4/postgres-adapter/
Source: https://www.postgresql.org/docs/current/sql-notify.html

### How it works

Every broadcast to multiple clients (`io.to(room).emit(...)`) that crosses server replicas:

1. If payload ≤ 8000 bytes AND contains no binary data:
   - Serialized and sent directly in a `NOTIFY` command payload.
   - Other Socket.IO server instances receive it via their `LISTEN` connections.

2. If payload > 8000 bytes OR contains binary data:
   - Encoded with msgpack.
   - Inserted into the `socket_io_attachments` auxiliary table.
   - The row `id` is sent in the NOTIFY command.
   - Other server instances query the table for that row ID, decode, and broadcast.

Postgres `NOTIFY` payload limit is 7999 bytes (documented as < 8000 in default config).
The adapter's `payloadThreshold` option (default `8_000`) controls the cutoff.

### Required schema (one-time setup, idempotent)

```sql
CREATE TABLE IF NOT EXISTS socket_io_attachments (
    id          bigserial UNIQUE,
    created_at  timestamptz DEFAULT NOW(),
    payload     bytea
);
```

This must exist before the adapter initializes. The adapter does NOT create it automatically
(it provides the SQL but you must run it). Include this in your Drizzle migration.

As a Drizzle schema definition:
```typescript
export const socketIoAttachments = pgTable('socket_io_attachments', {
  id:        bigserial('id', { mode: 'bigint' }).unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  payload:   bytea('payload'),
})
```

### Adapter initialization (with shared pg.Pool)

```typescript
import { createAdapter } from '@socket.io/postgres-adapter'
import { pool } from './db/client.js'  // same Pool as Drizzle uses

// Run schema setup once at startup
await pool.query(`
  CREATE TABLE IF NOT EXISTS socket_io_attachments (
    id          bigserial UNIQUE,
    created_at  timestamptz DEFAULT NOW(),
    payload     bytea
  )
`)

io.adapter(createAdapter(pool))
```

### Adapter options

| Option              | Default     | Notes                                         |
|---------------------|-------------|-----------------------------------------------|
| `channelPrefix`     | `socket.io` | NOTIFY channel name prefix                    |
| `tableName`         | `socket_io_attachments` | Aux table for large payloads        |
| `payloadThreshold`  | `8_000`     | Bytes; above this, aux table is used          |
| `cleanupInterval`   | `30_000` ms | How often to delete old rows from aux table   |
| `heartbeatInterval` | `5_000` ms  | ms between server-to-server heartbeats        |
| `heartbeatTimeout`  | `10_000` ms | ms before a silent node is considered down    |

### Latest release

0.5.0 — November 2025 (socket.io v4.8.x compatible).

### Limitations

1. **8 KB inline payload cap**: Any broadcast larger than ~7.9 KB triggers the aux table path,
   adding a round-trip write + read. For zzyix, `tile_placed` events contain a single `TileInstance`
   which is well under 1 KB — inline path always used.

2. **NOTIFY queue**: Postgres maintains a global NOTIFY queue (8 GB by default). If a LISTEN
   session holds a long transaction, the queue cannot be cleared and will eventually cause NOTIFY
   to fail. Keep Postgres connections out of long transactions; use short-lived transactions for
   game state mutations.

3. **Sticky sessions still required**: The postgres adapter only synchronizes Socket.IO room
   broadcasts across server replicas. It does NOT eliminate the need for HTTP session affinity
   (sticky sessions) for Socket.IO's HTTP polling fallback. ACA's sticky session setting must
   remain on.

4. **No Connection State Recovery**: The postgres adapter does NOT support Socket.IO's
   Connection State Recovery feature (v4.6+). If you need to replay missed events to reconnecting
   clients without a `session_snapshot`, a different mechanism (e.g., reading from `operation_log`
   since the last seen `op_seq`) must be implemented manually.

5. **Single Postgres LISTEN connection per server instance**: The adapter holds one persistent
   `LISTEN` connection. This is fine for the ACA single-replica initial deployment; at scale with
   many replicas, ensure Postgres `max_connections` is sized accordingly.

6. **Postgres downtime**: If the Postgres connection is lost, cross-replica broadcasts fail
   silently (each server only reaches its own connected clients). The app degrades gracefully
   (single-node behavior) rather than crashing.

7. **No inter-server acknowledgements**: The `InterServerEvents` interface in contracts.ts is
   currently empty `{}`. The postgres adapter supports inter-server messaging if needed in future.

---

## Q3 — Testing strategy: pg-mem vs testcontainers-node

Source: https://github.com/oguimbal/pg-mem
Source: https://node.testcontainers.org/modules/postgresql/

### pg-mem

An in-memory emulation of Postgres that runs entirely in the Node.js process.

**Install:**
```bash
npm i -D pg-mem
```

**Key capabilities:**
- Supports `node-postgres` (pg) adapter — `newDb().adapters.createPg()` returns a mock `pg.Client`
- Immutable data structures → instant snapshot/restore (ideal for per-test isolation):
  ```typescript
  const db = newDb()
  db.public.none(migrationSql)
  const backup = db.backup()
  // Before each test:
  backup.restore()
  ```
- Runs migrations (plain SQL scripts) via `db.public.none(sql)`
- No Docker required — zero startup time

**Limitations for zzyix:**
- Does NOT support `LISTEN`/`NOTIFY` — cannot test the `@socket.io/postgres-adapter` path
- Missing some Postgres features (no timezone, basic indices, no native extensions like `uuid-ossp`)
- "Experimental" label; 190 open issues; last release Aug 2024, last commit 5 months ago
- Behavior diverges from real Postgres on edge cases (e.g., JSONB operators, generated columns)
- No support for `bigserial`/identity columns in all pg-mem versions

### testcontainers-node

Spins up a real Postgres Docker container for each test run.

**Install:**
```bash
npm i -D @testcontainers/postgresql
```

**Usage pattern with vitest globalSetup:**
```typescript
// vitest.global-setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'
let container: PostgreSqlContainer

export async function setup() {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  process.env.TEST_DATABASE_URL = container.getConnectionUri()
}

export async function teardown() {
  await container.stop()
}
```

**Per-test isolation via snapshots:**
```typescript
// Before test suite: run migrations + seed
await container.snapshot()

// Before each test:
await container.restoreSnapshot()
```

Note: do not use `"postgres"` as the database name when using snapshots (the snapshot
mechanism needs to drop/recreate the DB).

**Advantages for zzyix:**
- Real Postgres behavior, exact production parity
- Supports LISTEN/NOTIFY → can test `@socket.io/postgres-adapter` integration
- Supports all extensions, JSONB operators, generated columns
- Works with vitest global setup (`globalSetup` in `vitest.config.ts`)

**Disadvantages:**
- Requires Docker in CI (GitHub Actions has Docker pre-installed → no problem for zzyix's GHCR pipeline)
- Slower: container startup ~5–15s per test suite (acceptable for integration tests)
- `await using` syntax requires ES2022+ and TypeScript 5.2+ (zzyix uses TS 6 → fine)

### Recommendation: Use Both

| Test type                         | Tool             | Reason                                        |
|-----------------------------------|------------------|-----------------------------------------------|
| Schema unit tests (query shape)   | pg-mem           | Zero startup, fast feedback, instant restore  |
| Domain logic tests (no DB needed) | No DB (current)  | Keep existing vitest approach                 |
| Postgres-backed integration tests | testcontainers   | Real Postgres, LISTEN/NOTIFY, exact parity    |
| Socket.IO adapter integration     | testcontainers   | NOTIFY required; pg-mem cannot emulate this   |

**vitest config split:**
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['src/**/*.integration.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          globalSetup: './test/global-setup.ts',
          poolOptions: { threads: { singleThread: true } },  // containers can't run in parallel safely
        },
      },
    ],
  },
})
```

---

## Q4 — Operation log + snapshot pattern in Postgres for collaborative realtime apps

### Pattern overview

This is "event sourcing lite" (also called "write-ahead log + materialized snapshot"):

1. Every mutation (`place_tile`, `remove_tile`) appends a row to `operation_log`.
2. The current canonical state (`sessions.tiles`) is kept up-to-date as a JSONB snapshot.
3. On reconnect: serve the snapshot (fast O(1) read). No need to replay the log.
4. The log exists for: debugging, future undo/redo, auditing, and Connection State Recovery.

### Proposed schema

```sql
-- Sessions table: stores the authoritative snapshot
CREATE TABLE sessions (
  id          UUID        PRIMARY KEY,
  tiles       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operation log: append-only mutation history
CREATE TABLE operation_log (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  op_seq      BIGINT      NOT NULL,                -- matches index.ts lastOpSeq
  op_type     TEXT        NOT NULL,                -- 'place_tile' | 'remove_tile'
  op_payload  JSONB       NOT NULL,                -- full payload (shape, color, transform...)
  actor_id    TEXT        NOT NULL,                -- clientId
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX operation_log_session_id_idx ON operation_log (session_id);
CREATE INDEX operation_log_created_at_idx ON operation_log (created_at);
-- Composite unique ensures no duplicate op_seq per session
CREATE UNIQUE INDEX operation_log_session_opseq ON operation_log (session_id, op_seq);

-- Socket.IO adapter aux table
CREATE TABLE IF NOT EXISTS socket_io_attachments (
  id         BIGSERIAL   UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  payload    BYTEA
);
```

### Write path (place_tile)

```typescript
// Atomic: update snapshot + append op log in one transaction
await db.transaction(async (tx) => {
  const opSeq = await nextOpSeq(tx, sessionId)
  const tileId = randomUUID()
  const tile: TileInstance = { id: tileId, ...payload, createdAt: Date.now() }

  // Append to log
  await tx.insert(operationLog).values({
    sessionId, opSeq, opType: 'place_tile',
    opPayload: tile as any, actorId: placedBy,
  })

  // Update snapshot (append tile to JSONB array)
  await tx.execute(sql`
    UPDATE sessions
    SET tiles = tiles || ${JSON.stringify([tile])}::jsonb,
        updated_at = now()
    WHERE id = ${sessionId}
  `)

  return { tile, opSeq }
})
```

For `remove_tile`:
```typescript
await db.transaction(async (tx) => {
  await tx.insert(operationLog).values({
    sessionId, opSeq, opType: 'remove_tile',
    opPayload: { tileId }, actorId: removedBy,
  })

  // Remove tile from JSONB array by id
  await tx.execute(sql`
    UPDATE sessions
    SET tiles = (
      SELECT jsonb_agg(t)
      FROM jsonb_array_elements(tiles) AS t
      WHERE t->>'id' != ${tileId}
    ),
    updated_at = now()
    WHERE id = ${sessionId}
  `)
})
```

### Variants considered

| Variant                        | Approach                                          | Verdict for zzyix         |
|-------------------------------|---------------------------------------------------|---------------------------|
| Pure event sourcing            | Only log; rebuild state by replaying ops          | ❌ Too expensive at scale  |
| Snapshot only (no log)        | Just sessions.tiles, no op history                | ❌ No auditability/replay  |
| Log + snapshot (recommended)  | Log every op + maintain snapshot                  | ✅ Selected approach       |
| JSONB patch log               | Store RFC 6902 JSON patches for space efficiency  | Future optimization only  |
| Tiles as separate rows        | Normalized: one row per tile in a `tiles` table   | Considered (see below)    |

### Alternative: normalized tiles table

```sql
CREATE TABLE tiles (
  id          UUID        PRIMARY KEY,
  session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  shape       TEXT        NOT NULL,
  color       TEXT        NOT NULL,
  material    TEXT        NOT NULL,
  transform   JSONB       NOT NULL,    -- { position, rotation, mirrored }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Pros: proper relational model, individual tile queries, foreign keys.
Cons: retrieving all tiles for a session requires a JOIN or subquery; the snapshot
read is more expensive; each `remove_tile` is a DELETE (more VACUUM pressure).
For a collaborative canvas where the unit of state is the full tile set, JSONB snapshot
is simpler and faster for the primary `session_snapshot` use case.

**Recommendation:** JSONB snapshot in `sessions.tiles` + `operation_log` for history.
If per-tile querying becomes a requirement (e.g., "show all tiles placed by user X"),
consider adding a separate `tiles` table alongside the log rather than replacing the snapshot.

---

## Q5 — Retention and archival for append-only operation_log

### Volume estimate

Each `operation_log` row is approximately 200–400 bytes (UUID + JSONB payload + timestamp).
At 100 ops/hour per session, 1000 concurrent sessions → ~100K rows/hour → ~2.4M rows/day.
At current early-stage scale (much lower), simple TTL deletion is sufficient.

### Strategy 1 — TTL deletion (recommended for initial deployment)

```sql
-- Run via pg_cron or app-level cron (node-cron / node-schedule)
DELETE FROM operation_log
WHERE created_at < now() - interval '7 days';
```

Simple, no DDL changes. Creates dead tuples requiring autovacuum — acceptable at low volume.
pg_cron is an extension that may not be available on Azure Database for Postgres Flexible Server
(check via `CREATE EXTENSION IF NOT EXISTS pg_cron`). Alternative: use `node-cron` in the
Node.js process:

```typescript
import cron from 'node-cron'
import { db } from './db/client.js'
import { operationLog } from './db/schema.js'

cron.schedule('0 3 * * *', async () => {  // 3am daily
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  await db.delete(operationLog).where(lt(operationLog.createdAt, cutoff))
})
```

### Strategy 2 — Session-based pruning

Prune ops for sessions that have been inactive (no connected clients + no tile activity
for >30 days). This mirrors the existing `shouldCleanupSession` logic:

```sql
DELETE FROM operation_log
WHERE session_id IN (
  SELECT id FROM sessions
  WHERE updated_at < now() - interval '30 days'
);
-- Then delete the session itself
DELETE FROM sessions WHERE updated_at < now() - interval '30 days';
```

### Strategy 3 — Time-based range partitioning (for growth)

When `operation_log` exceeds ~1–5 million rows, switch to declarative partitioning:

```sql
-- New partitioned table
CREATE TABLE operation_log (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY,
  session_id  UUID        NOT NULL,
  op_seq      BIGINT      NOT NULL,
  op_type     TEXT        NOT NULL,
  op_payload  JSONB       NOT NULL,
  actor_id    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE operation_log_2026_07 PARTITION OF operation_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE operation_log_2026_08 PARTITION OF operation_log
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

Archival: `ALTER TABLE operation_log DETACH PARTITION operation_log_2026_07 CONCURRENTLY`
then `COPY` to Azure Blob Storage, then `DROP TABLE operation_log_2026_07`.

Advantages: dropping a partition is ~instant (no VACUUM), no dead tuple churn.
Disadvantages: requires DDL management (script to create monthly partitions in advance).
`pg_partman` extension automates this but requires extension support on the Postgres host.

### Recommendation for zzyix phases

| Phase                | Strategy                           | Trigger                         |
|----------------------|------------------------------------|---------------------------------|
| Initial deployment   | TTL deletion via node-cron (7 days)| Immediate                       |
| Early growth         | Session-based pruning (30 days)    | When session count > 1K         |
| Scale                | Monthly RANGE partitioning         | When op_log > 5M rows           |
| Compliance/archival  | Detach + COPY to Azure Blob        | If audit retention required     |

socket_io_attachments cleanup is handled automatically by the adapter's `cleanupInterval`
(default 30s) — no additional retention work needed for that table.

---

## Package versions summary

```json
{
  "dependencies": {
    "drizzle-orm": "^1.0.0-beta.2",
    "pg": "^8.14.1",
    "@socket.io/postgres-adapter": "^0.5.0"
  },
  "devDependencies": {
    "drizzle-kit": "^1.0.0-rc",
    "@types/pg": "^8.11.14",
    "@testcontainers/postgresql": "^10.20.0",
    "pg-mem": "^3.0.1"
  }
}
```

Verify exact latest versions before installing:
```bash
npm info drizzle-orm version       # confirm 1.x RC or stable
npm info drizzle-kit version
npm info @socket.io/postgres-adapter version
npm info @testcontainers/postgresql version
```

---

## Potential gaps / follow-on research

1. **Azure Database for Postgres Flexible Server**: Confirm `max_connections` defaults and
   whether `pg_cron` extension is available. ACA → Azure DB connectivity (VNet integration or
   public endpoint with firewall rules).

2. **Connection state recovery via op_log**: Design for delivering missed events to a
   reconnecting client using `op_seq` (e.g., `WHERE session_id = $1 AND op_seq > $2`) as
   an alternative to the full `session_snapshot`. This would reduce reconnect data transfer
   for clients that missed only a few ops.

3. **Drizzle v1 stable release**: Monitor `drizzle-orm` npm for promotion from RC to stable.
   Pin `"drizzle-orm": "1.0.x"` in package.json once stable.

4. **pg-mem LISTEN/NOTIFY**: pg-mem does not support NOTIFY. If unit-testing the adapter path
   is required, consider a manual mock of the `pg.Pool` that simulates NOTIFY callbacks.

5. **Socket.IO postgres adapter with Drizzle transactions**: Confirm whether the shared `pg.Pool`
   handles concurrent Drizzle transactions and Socket.IO adapter LISTEN connections without
   connection starvation. Set `max` on the pool (e.g., 10) and monitor `pg_stat_activity`.

6. **Tiles as normalized rows**: If "show all tiles by user" or per-tile metadata queries
   become requirements, a normalized `tiles` table alongside the op log would be worth adding.
   This is a schema evolution, not a rewrite.
