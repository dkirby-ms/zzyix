<!-- markdownlint-disable-file -->
# Infinite Quilt Server Research

## Status

Complete

## Research scope

* Determine the server, persistence, realtime, ownership, and migration implications of GitHub issue 53.
* Inspect current contracts, endpoints, WebSocket protocol, rooms and subscriptions, authorization and ownership, Drizzle schema and SQL migrations, chunk and cell persistence, jobs, concurrency and integration tests, indexes and constraints, startup and migration behavior, infrastructure limits, and client/server assumptions.
* Compare these candidate models against repository evidence:
  * One global canvas with chunked coordinates
  * Patch records with row and column addresses
  * Explicit adjacency records
  * A hybrid model
* Address toroidal wrap semantics, unique keys, transactions and locking, ownership authorization, visible-neighborhood subscriptions, fanout and backpressure, existing-canvas migration, compatibility and versioning, and test strategy.
* Select one server and data approach with rationale.

## Issue requirements

GitHub issue 53, `[Feature] "Infinite" scrolling canvas`, states only that the
canvas should be extremely large and finite, with panning across one edge
wrapping to the opposite edge. It is open, assigned to `dkirby-ms`, belongs to
the `UX Overhaul` milestone, and has parent issue 72. It does not define server,
ownership, persistence, migration, or compatibility acceptance criteria.

Source: <https://github.com/dkirby-ms/zzyix/issues/53>

## Current architecture evidence

### Contracts and realtime

* The contract is session/canvas scoped. The connection handshake carries only
  `sessionId` and caller-supplied `clientId`; per-socket state stores the same
  two values. See `apps/server/src/contracts.ts:242-252`.
* The server already exposes chunk subscriptions, chunk snapshots, fine and
  aggregate payload modes, per-chunk cursors, chunk mutation events, and
  resynchronization events. See `apps/server/src/contracts.ts:352-440` and
  `apps/server/src/contracts.ts:449-498`.
* The formal agreement still requires a single authoritative `Session.tiles`
  array and whole-session snapshots. See `apps/server/src/contracts.ts:500-532`.
* Chunk rooms are additive to the main session room. Current writes broadcast
  both a session-wide event and a chunk-room event, so chunk subscription does
  not reduce fine-event fanout for clients that remain in the session room. See
  `apps/server/src/index.ts:1617-1627` and `apps/server/src/index.ts:1697-1710`.

### Persistence and consistency

* `tiles` persist both world coordinates and derived integer `chunk_x` and
  `chunk_y` values. The read path has a composite index on
  `(canvas_id, chunk_x, chunk_y, created_at)`. See
  `apps/server/src/db/schema.ts:66-101`.
* There is no separate cell or occupancy table. Tiles are the persisted spatial
  entities, and `tiles.id` is a global primary key rather than a key scoped to a
  canvas or chunk. See `apps/server/src/db/schema.ts:66-75`.
* Chunk reads query those durable columns, but parity fallback loads the entire
  session and compares the chunk result with an in-memory filter. See
  `apps/server/src/db/repository.ts:471-518`.
* Placement and removal each take
  `pg_advisory_xact_lock(hashtext(sessionId))`, use a canvas-wide operation
  sequence and canvas-wide revision, and reload all canvas tiles before
  returning. See `apps/server/src/db/repository.ts:575-803` and
  `apps/server/src/db/repository.ts:806-997`.
* Snapshots store the complete tile array as one JSONB value; replay applies a
  canvas-wide operation log after the latest whole-canvas snapshot. See
  `apps/server/src/db/repository.ts:999-1060`.

Initial implication: durable chunks are currently query and routing metadata,
not independent consistency or ownership units. Preserving the current lock,
revision, and snapshot boundaries for one huge canvas would serialize unrelated
patch writes and make mutation responses and recovery scale with the entire
quilt.

### Endpoints and startup

* Public REST consists of `GET /health`, `GET /sessions`, and rate-limited
  `POST /sessions`. Session creation accepts only a size preset and creates an
  unowned canvas. See `apps/server/src/index.ts:1234-1281`.
* Every server process verifies the database, applies pending migrations, then
  configures the PostgreSQL Socket.IO adapter before listening. See
  `apps/server/src/index.ts:2070-2104`.
* Migration detection compares the count of local SQL files with the count in
  `__drizzle_migrations`; there is no application compatibility gate or
  expand/contract orchestration. See `apps/server/src/db/migrate.ts:14-61`.
* `SCHEMA_VERSION` is declared as `1.0.0`, but repository search finds no
  runtime use outside comments in the contract. The handshake has no client or
  protocol version. See `apps/server/src/contracts.ts:26-29` and
  `apps/server/src/contracts.ts:242-252`.

### Identity and ownership

* Socket middleware accepts any nonempty client-supplied `sessionId` and
  `clientId`; there is no authenticated principal, session existence check, or
  authorization lookup in middleware. See `apps/server/src/index.ts:1415-1468`.
* `users` exists but no server operation reads or creates it, and `client_id`,
  `placed_by`, and participant identities have no foreign keys to `users`. See
  `apps/server/src/db/schema.ts:21-33`, `apps/server/src/db/schema.ts:48-64`,
  and `apps/server/src/db/schema.ts:66-101`.
* Removal checks tile existence and canvas membership, not author or owner. Any
  client in a canvas can remove any tile. See
  `apps/server/src/db/repository.ts:902-997`.
* `placedBy` is therefore audit and per-author UI metadata, not an enforceable
  ownership identity. The client creates `clientId` in local storage. See
  `apps/client/src/network/session.ts:102-110`.

### Realtime and scale behavior

* A connection always joins the whole session room and receives the complete
  replayed session before viewport subscriptions begin. See
  `apps/server/src/index.ts:1475-1517`.
* Each successful write emits both a whole-session tile event and a chunk-room
  event. Chunk streaming currently adds fanout instead of replacing the legacy
  stream. See `apps/server/src/index.ts:1613-1629` and
  `apps/server/src/index.ts:1693-1713`.
* The client computes visible chunks with one prefetch ring, movement and zoom
  hysteresis, and a soft limit of 64 subscriptions. See
  `apps/client/src/App.tsx:53-62`, `apps/client/src/App.tsx:831-853`, and
  `apps/client/src/domain/math2d.ts:71-115`.
* The server deduplicates requested chunk IDs but places no count, coordinate,
  rate, or total-membership limit on `subscribe_chunks`; a hostile client can
  request an arbitrarily large set and trigger a database query plus snapshot.
  See `apps/server/src/index.ts:1739-1800`.
* Presence leave gating is process-local and explicitly warns that sticky
  sessions or shared membership are needed for multi-replica correctness. See
  `apps/server/src/index.ts:1995-2029`.
* The adapter supports cross-server broadcasts but not Socket.IO connection
  state recovery. Payloads above 8,000 bytes use a
  `socket_io_attachments` table. The adapter README requires that table, but no
  application migration creates it. See
  `node_modules/@socket.io/postgres-adapter/README.md:20-35`,
  `node_modules/@socket.io/postgres-adapter/README.md:45-68`, and
  `node_modules/@socket.io/postgres-adapter/README.md:115-124`.

### Correctness and retention

* Socket placement validation loads and validates current tiles before entering
  `persistTilePlacement`; the transaction lock is acquired later and placement
  is not revalidated inside the lock. Two simultaneous conflicting requests can
  both validate stale state, then serialize and both persist. See
  `apps/server/src/index.ts:1547-1597` and
  `apps/server/src/db/repository.ts:575-589`.
* The file named `index.concurrency.test.ts` executes mutations sequentially
  against an in-memory state. It does not exercise concurrent database
  transactions. See `apps/server/src/index.concurrency.test.ts:5-132`.
* Snapshots are complete JSONB tile arrays every 25 accepted operations. See
  `apps/server/src/db/snapshots.ts:4-13` and
  `apps/server/src/db/repository.ts:999-1024`.
* Retention deletes operations older than seven days and snapshots older than
  30 days independently. Replay starts with an empty array when no snapshot
  remains, then replaces the canonical tile-table state with replay output.
  A quiet canvas can therefore replay as empty after both histories age out,
  even while `tiles` remains correct. See `apps/server/src/jobs/retention.ts:4-17`
  and `apps/server/src/db/repository.ts:1041-1060`.

## Data model evaluation

### One global canvas with chunked coordinates

This is the smallest conceptual change because `tiles` already stores chunk
coordinates and the protocol already names `canvasId` plus `chunkId`. It is not
acceptable if it retains current consistency boundaries: one advisory lock,
revision, operation sequence, full state load, and JSONB snapshot would cover
the entire world. It also has no natural durable ownership unit smaller than
the world. Adding ownership ranges directly to chunks would make the chunk size
an externally visible governance decision even though the current 8-unit chunk
is a storage and streaming optimization.

### Patch records with row and column addresses

First-class patch records fit the stated product concept and current canvas
scale. A patch can preserve current local coordinates, bounds, tiles, operation
history, and revision while gaining `(quilt_id, patch_row, patch_column)` and an
owner or ACL. The required unique key is
`UNIQUE (quilt_id, patch_row, patch_column)`, with checks that row and column are
within quilt dimensions. This makes ownership, claims, per-patch locking, and
incremental migration explicit.

Patch records alone still need a quilt parent to define finite dimensions,
patch size, topology, and protocol version. Without that parent, all clients
would have to infer global geometry from a set of records.

### Explicit adjacency records

An adjacency table is redundant for a complete rectangular torus. For patch
`(row, column)` in a quilt with `R` rows and `C` columns, the four neighbors are
derived with floor modulo:

```text
north = ((row - 1) mod R, column)
south = ((row + 1) mod R, column)
west  = (row, (column - 1) mod C)
east  = (row, (column + 1) mod C)
```

Persisting these edges creates consistency work during resize and migration and
allows reciprocal links to disagree. Explicit adjacency is justified only if a
future quilt can contain holes, portals, nonrectangular topology, or manual
links. None of those requirements appears in issue 53 or current code.

### Hybrid quilt, patches, and chunks

The evidence supports a hybrid at three different abstraction levels:

* Quilt records define finite patch rows and columns, patch dimensions,
  toroidal topology, lifecycle, and protocol version
* Patch records define address, owner or ACL, local revision, and local bounds
* Existing tile chunk columns remain internal spatial indexes and realtime room
  partitions within a patch

This separates product ownership units from tunable storage chunks. It also
lets existing canvases become patches without rewriting every tile coordinate.

## Recommended server and data approach

Select the hybrid quilt, addressed patch, and patch-local chunk approach.

### Proposed durable shape

* Add `quilts(id, patch_rows, patch_columns, patch_width, patch_height,
  topology, protocol_version, created_at, updated_at)` with positive dimension
  checks and `topology = 'toroidal'` for issue 53.
* Treat current `canvases` as patches during migration, adding `quilt_id`,
  `patch_row`, `patch_column`, `owner_user_id`, `ownership_version`, and a unique
  `(quilt_id, patch_row, patch_column)` constraint. A later rename is optional
  and should not be combined with the behavioral migration.
* Keep tile positions patch-local and canonical. Keep `chunk_x/chunk_y` derived
  from local coordinates, add an index led by patch ID and chunk coordinates,
  and query a halo of neighboring patches for seam validation.
* Replace free-form `owner_user_id` with a foreign key to an authenticated user.
  If shared editing is required, add `patch_members(patch_id, user_id, role)`
  with a unique `(patch_id, user_id)` key rather than encoding collaborators in
  JSONB.
* Retain globally unique tile UUIDs. Add patch ID to operation records and make
  ordering unique per patch, for example `UNIQUE (patch_id, op_seq)`. Preserve a
  global identity/event ID for diagnostics, but do not require contiguous
  global revisions in viewport clients.

### Toroidal semantics

Canonicalize every patch address with floor modulo, including negative values.
Canonicalize local coordinates into the half-open range `[0, patchWidth)` and
`[0, patchHeight)`, carrying overflow into adjacent patch rows or columns. Use
half-open intervals so an exact seam belongs to one patch.

Rendering may create translated copies near a seam, but persistence stores one
canonical tile. Collision, grout adjacency, picking, and removal must compare
the candidate against translated images from the wrapped 3-by-3 neighborhood.
The current solver uses hard bounds and raw Euclidean positions, so it cannot be
reused unchanged at a toroidal seam. See
`apps/server/src/domain/placementSolver.ts:173-253`.

For authorization, compute every patch intersected by the tile's transformed
footprint and require write permission on all of them. Authorizing only the
anchor patch would allow a user to place geometry into another owner's patch.
Removal should authorize against the tile's persisted intersected-patch set or
recompute it from immutable geometry. Product policy must decide whether
cross-owner boundary placements are rejected or require permission from each
owner; the server must not infer consent from adjacency.

### Transactions and locking

Move placement validation inside the transaction. Determine the candidate's
intersected patches plus collision-query halo, acquire transaction advisory
locks for all affected patch IDs in stable sorted order, read current nearby
tiles, validate, persist the tile and operation, and increment only affected
patch revisions. Stable lock order avoids deadlocks at seams.

This permits independent patches to mutate concurrently while retaining
first-write-wins for overlapping geometry. Avoid a quilt-wide expected
revision. Use per-patch revisions or per-chunk cursors; gaps in a global
operation sequence are normal when a client subscribes to only part of the
world.

### Realtime subscriptions and backpressure

Use a quilt presence room only for low-volume membership signals. Content
events should go only to canonical patch/chunk rooms in the visible wrapped
neighborhood. New protocol clients should not also receive legacy
`tile_placed/tile_removed` session broadcasts.

Server-side controls are required even though the client has budgets:

* Cap chunks per request and total rooms per socket, reject rather than truncate
* Deduplicate and canonicalize wrapped chunk IDs before joining rooms
* Rate-limit subscription churn and snapshot requests per socket
* Bound snapshot tile count and bytes, page large snapshots, and acknowledge
  subscriptions with accepted rooms and cursors
* Coalesce pointer and selection updates by neighborhood and use volatile
  delivery for disposable presence signals
* Track room counts, snapshot bytes, adapter attachment usage, send-buffer
  growth, resync rate, and dropped/coalesced presence events

Provision `socket_io_attachments` before multi-replica payloads can exceed
8,000 bytes, or configure the adapter only after enforcing smaller packets.
Connection recovery remains application-level because the adapter does not
support Socket.IO connection state recovery.

## Migration and compatibility

Use an expand, backfill, dual-protocol, contract sequence.

1. Add quilt and ownership tables plus nullable patch address columns. Create
  indexes concurrently or in a deployment phase appropriate to production
  table size. Do not add non-null or uniqueness constraints until backfill is
  verified.
2. Provision the Socket.IO attachment table and retention expected by the
  installed adapter.
3. Backfill each existing canvas as one patch without changing tile IDs or
  local coordinates. Existing canvases have no trustworthy owner, so mark
  migrated patches unclaimed or assign an explicit system owner. Do not infer
  owner from `placed_by` or participant history.
4. Product input must determine whether all legacy canvases are packed into one
  quilt and in what order. A safe technical fallback is one legacy bounded
  quilt per canvas until an explicit merge job assigns deterministic row and
  column addresses. A 1-by-1 torus is not semantically equivalent to a bounded
  canvas because opposite-edge collisions become adjacent.
5. Add protocol v2 handshake fields (`protocolVersion`, authenticated token,
  and `quiltId`) and a capability response. Continue v1 session snapshots and
  session-wide events only for v1 clients during the rollout.
6. Dual-read chunk state and compare parity as the current code does, but remove
  the full-canvas fallback before scale-out. Canary v2 clients by server
  capability, monitor parity and resyncs, then stop full snapshots and legacy
  duplicate fanout for v2.
7. After all rows and clients are migrated, enforce foreign keys, address
  checks, non-null constraints, and unique keys. Retire v1 in a separate
  release and increment the contract version for every breaking payload or
  event change.

Startup migration application is acceptable for development but risky with
multiple rolling replicas and long backfills. Production rollout should run
migrations as a single deployment job, then start application revisions that
are backward compatible with both old and expanded schemas.

Snapshot/replay migration needs a separate invariant: either use the canonical
tile table as initial state and replay only for audit, or retain at least one
complete snapshot older than the earliest retained operation per patch. The
current independent retention windows do not guarantee reconstructability.

## Test strategy

### Domain and contract tests

* Floor-modulo addresses for negative, exact-boundary, and multiple-wrap inputs
* Canonical half-open local coordinates and deterministic patch carry
* Wrapped viewport neighborhoods at all four edges and corners without duplicate
  subscriptions
* Collision, grout adjacency, picking, and removal across horizontal, vertical,
  and corner seams, including tiles that intersect multiple owners
* Protocol v1/v2 handshake, capability negotiation, and rejection of unsupported
  versions

### Database and authorization tests

* Unique patch address, dimension checks, owner/member foreign keys, and cascade
  policy
* Authenticated owner, member-role, non-owner, unclaimed, and administrator
  placement/removal cases
* Two real PostgreSQL connections placing conflicting seam tiles concurrently:
  exactly one succeeds after in-transaction validation
* Distant patch writes proceed without a quilt-wide lock
* Multi-patch sorted locking completes without deadlock under reversed request
  order
* Per-patch idempotency, revision, operation sequence, and replay after retention

### Realtime and load tests

* Actual Socket.IO clients subscribe, pan across wrap seams, reconnect, and
  reconcile only visible rooms
* Server rejects excessive chunk counts, invalid wrapped coordinates, rapid
  churn, and oversized snapshot requests
* Two server processes using the PostgreSQL adapter verify room fanout,
  membership, reconnect, and presence leave behavior
* Load tests measure messages per mutation, snapshot bytes, PostgreSQL adapter
  attachments, database query latency, pool pressure, and slow-client behavior
* Legacy clients receive one v1 stream while v2 clients receive one scoped
  stream, never duplicate mutation events

### Migration tests

* Apply all migrations from an empty database and from snapshots at each current
  migration level
* Backfill representative classic, expanded, and vast canvases while preserving
  tile IDs, local positions, authorship audit fields, and current visuals
* Restart during backfill and rerun idempotently
* Verify unclaimed ownership rather than accidental attribution
* Verify old and new application revisions against the expanded schema during a
  rolling deployment

## Infrastructure implications

* PostgreSQL Flexible Server is currently `Standard_B1ms` (1 vCore, 2 GiB RAM),
  32 GiB storage, no high availability, and seven-day backup retention. See
  `infra/bicep/modules/postgresql.bicep:38-77`.
* The server pool defaults to ten connections per replica. See
  `apps/server/src/db/client.ts:17-27`. Adapter listeners, application queries,
  migrations, and per-replica retention share this database budget.
* Container Apps uses a consumption-only environment. The deployment creates
  the server with a minimum of one replica but does not set a maximum replica,
  sticky sessions, or issue-53 feature flags. See
  `infra/bicep/modules/containerAppsEnvironment.bicep:24-41` and
  `.github/workflows/cd.yml:212-238`.
* The pipeline sets no `FEATURE_MULTI_REPLICA_READY`, so capability metadata
  remains process-local/best-effort by default even though the PostgreSQL
  adapter is configured. See `apps/server/src/index.ts:164-183` and
  `.github/workflows/cd.yml:212-236`.

The selected design reduces database and network amplification, but production
readiness still requires query/load measurements on the B1ms tier, explicit
replica and pool sizing, attachment-table provisioning, shared presence
semantics, migration-job ownership, and alerting for storage, locks, pool wait,
adapter failures, and snapshot size. HA and backup objectives should be revisited
if the quilt becomes durable multi-user content rather than a development demo.

## Unresolved questions

* Is issue 53 one shared quilt containing every existing canvas, one quilt per
  community, or a new quilt alongside legacy canvases?
* How are legacy canvases ordered into patch rows and columns, and what quilt
  dimensions are fixed at launch?
* Who may claim an unowned migrated patch, transfer ownership, invite editors,
  or administer abandoned patches?
* Are tiles allowed to cross an ownership boundary? If so, what multi-owner
  consent and deletion rules apply?
* Is a patch exactly the current `vast` size (31.2 by 20.4 world units), and
  must patch dimensions remain immutable?
* Should far-zoom aggregates reveal content counts for patches the viewer may
  not edit or view?
* What are the required concurrent-user, tile-count, latency, durability,
  recovery-time, and recovery-point targets?
* Must resize, holes, portals, or nonrectangular quilt topology ever be
  supported? A positive answer could justify explicit adjacency later.

## Recommended next research

* Product and threat-model workshop for identity, patch claims, transfers,
  cross-boundary geometry, visibility, and moderation
* Data-volume and workload measurement from current deployments to size patch,
  chunk, index, snapshot, and retention policies
* A PostgreSQL concurrency spike that moves validation under sorted patch locks
  and proves same-patch exclusion plus cross-patch parallelism
* A two-replica Socket.IO adapter spike with the attachment table, bounded
  subscriptions, reconnect, and slow-client instrumentation
* A migration rehearsal on a production-like copy to choose packing order,
  estimate lock/backfill time, and validate rolling compatibility

## References

* GitHub issue 53: <https://github.com/dkirby-ms/zzyix/issues/53>
* `apps/server/src/contracts.ts:26-90`
* `apps/server/src/contracts.ts:242-535`
* `apps/server/src/index.ts:1234-1281`
* `apps/server/src/index.ts:1415-1517`
* `apps/server/src/index.ts:1530-1713`
* `apps/server/src/index.ts:1739-2029`
* `apps/server/src/index.ts:2050-2104`
* `apps/server/src/db/schema.ts:21-159`
* `apps/server/src/db/repository.ts:331-518`
* `apps/server/src/db/repository.ts:575-1060`
* `apps/server/src/db/migrate.ts:14-61`
* `apps/server/src/db/snapshots.ts:4-24`
* `apps/server/src/jobs/retention.ts:4-25`
* `apps/server/migrations/0000_overjoyed_lila_cheney.sql:1-67`
* `apps/server/migrations/0002_flat_cable.sql:1-14`
* `apps/server/migrations/0003_tidy_chunk_columns.sql:1-7`
* `apps/server/migrations/0004_store_canvas_config.sql:1`
* `apps/server/src/index.concurrency.test.ts:5-132`
* `apps/server/src/index.integration.test.ts:465-850`
* `apps/server/src/db/repository.test.ts:5-37`
* `apps/client/src/App.tsx:53-62`
* `apps/client/src/App.tsx:300-323`
* `apps/client/src/App.tsx:520-655`
* `apps/client/src/App.tsx:831-930`
* `apps/client/src/domain/math2d.ts:55-115`
* `apps/client/src/network/session.ts:102-110`
* `infra/bicep/modules/postgresql.bicep:38-77`
* `infra/bicep/modules/containerAppsEnvironment.bicep:24-41`
* `.github/workflows/cd.yml:212-255`
* `node_modules/@socket.io/postgres-adapter/README.md:20-35`
* `node_modules/@socket.io/postgres-adapter/README.md:45-68`
* `node_modules/@socket.io/postgres-adapter/README.md:115-124`
