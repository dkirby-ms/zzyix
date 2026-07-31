<!-- markdownlint-disable-file -->
# Task Research: Infinite Quilt Canvas

Research for GitHub issue 53, which proposes replacing discrete bounded canvases with an extremely large finite canvas whose opposite edges wrap. The expanded product concept treats the world as a quilt of adjacent patches, each roughly the current largest canvas size and potentially owned by a different user.

## Executive Recommendation

Implement a **finite rectangular toroidal quilt with first-class regular patches, patch-local canonical coordinates, and patch-local chunks**.

Use three layers:

1. A quilt defines immutable finite dimensions, regular patch dimensions, wrapped axes, lifecycle, and protocol version.
2. A patch defines a stable address, owner and access policy, local revision, locking boundary, operation history, and snapshot boundary.
3. A chunk remains an internal spatial-query, cache, and Socket.IO room unit inside a patch. It is not an ownership boundary.

Keep one React Three Fiber scene. Store one canonical tile identity and patch-local transform, retain an unwrapped logical camera position for smooth panning, and render camera-relative periodic images near seams. Subscribe only to visible authorized patch/chunk neighborhoods and evict data outside the cache margin.

This is not a larger size preset. The current system has viewport-derived chunk subscriptions, but still uses whole-canvas snapshots, broadcasts, revisions, transaction locks, and retained client state. A quilt requires changing identity, consistency, authorization, recovery, and rendering boundaries together.

The recommendation is conditional on literal opposite-edge wrapping. If product intent changes to “users should never encounter an edge,” choose an unbounded sparse plane. That alternative fits the signed chunk model more directly but does not return eastward travel to western content.

## Task Implementation Requests

* Determine how current canvas size, coordinates, persistence, and collaboration work
* Evaluate architectures for stitching bounded work areas into an apparently infinite wraparound canvas
* Define patch ownership without conflating it with storage chunks
* Recommend an approach with migration stages, examples, risks, and validation criteria

## Scope and Success Criteria

* Scope: Topology, client rendering and interaction, coordinates, ownership, persistence, real-time synchronization, recovery, migration, testing, and deployment implications
* Exclusions: Product implementation, final visual design, selected moderation policy, and capacity values requiring production workload measurements
* Assumptions:
  * A normal editing viewport remains roughly comparable to the current largest canvas
  * Adjacent patches may have different owners and access policies
  * “Infinite” means a large finite topology with wraparound
  * Existing content must remain recoverable through migration
  * Both axes wrap unless issue 53 changes
* Success Criteria:
  * Current constraints have exact source references
  * Canonical coordinates, aliases, and seam behavior are explicit
  * Ownership and authorization boundaries are defined conceptually
  * Rendering, synchronization, persistence, and migration impacts are addressed
  * Five alternatives are evaluated and one approach is selected
  * The approach includes staged implementation and acceptance tests

## Key Discoveries

### Current Size and Coordinates

Default bounds are `[-5.2, 5.2] x [-3.4, 3.4]`. The `classic`, `expanded`, and `vast` presets yield 10.4 x 6.8, 20.8 x 13.6, and 31.2 x 20.4 world units. Runtime chunks are 8 units. See `apps/server/src/contracts.ts:29-64`, `apps/server/src/contracts.ts:152-179`, `apps/server/src/index.ts:687-706`, and `apps/client/src/ui/LobbyScreen.tsx:18-31`.

Tile transforms use absolute world positions. Chunk IDs are signed integer pairs derived with `Math.floor(world / chunkSize)`. Grid cells use a world-origin integer lattice. There is no quilt, patch address, local coordinate, world period, or render alias. See `apps/client/src/domain/math2d.ts:1-87`, `apps/client/src/domain/tileGeometry.ts:7-17`, and `apps/client/src/domain/gridPatterns.ts:20-49`.

Placement is Euclidean and applies hard bounds, polygon overlap, and adjacency to absolute coordinates. Toroidal seams cannot be implemented by wrapping the camera alone. See `apps/client/src/domain/placementSolver.ts:67-261` and `apps/server/src/domain/placementSolver.ts:173-253`.

### Rendering and Virtualization

The client uses one React Three Fiber scene and an orthographic Three.js camera. Retain this renderer. See `apps/client/src/render/MosaicScene.tsx:1-16` and `apps/client/src/render/MosaicScene.tsx:526-603`.

Current chunk streaming is not complete virtualization. The scene maps the full retained tile array, every tile owns scene behavior, unsubscribe does not evict tile state, aggregates are not rendered, and pointer/background planes use total world bounds. See `apps/client/src/render/MosaicScene.tsx:98-153`, `apps/client/src/render/MosaicScene.tsx:293-483`, and `apps/client/src/App.tsx:566-585,826-952`.

Three.js frustum culling avoids some draw work but does not release React objects, materials, callbacks, or state. The quilt needs a bounded visible cache and camera-relative render coordinates. Source: [Three.js Object3D](https://threejs.org/docs/pages/Object3D.html).

### Realtime and Consistency

The client already computes visible chunks with prefetch and a soft subscription budget. The protocol has fine and aggregate snapshots, chunk cursors, scoped events, and resynchronization. See `apps/client/src/App.tsx:84-92,826-909` and `apps/server/src/contracts.ts:349-498`.

The correctness boundary is still canvas-wide:

* One connection authenticates to one session and client ID
* Every socket joins the session room and receives a complete snapshot
* Writes broadcast through both session and chunk rooms
* Client state has one flat tile array, operation sequence, and revision
* The server does not bound chunk count, room count, coordinates, or subscription churn

See `apps/client/src/network/useSocketConnection.ts:23-147`, `apps/client/src/interaction/controller.ts:24-153`, and `apps/server/src/index.ts:1475-1800`.

Tiles persist global coordinates plus chunk columns, but locks, revisions, operations, snapshots, and replay remain canvas-wide. One huge canvas would serialize unrelated patches and make recovery scale with total content. See `apps/server/src/db/schema.ts:66-157` and `apps/server/src/db/repository.ts:471-1060`.

### Ownership Is a New Domain

The `users` table is unused by participant and tile records. Socket middleware trusts caller-provided IDs. `placedBy` supports attribution and current undo behavior, not ownership. Any canvas participant can remove any tile. See `apps/server/src/db/schema.ts:21-101`, `apps/server/src/index.ts:1415-1468`, `apps/server/src/db/repository.ts:902-997`, and `apps/client/src/network/session.ts:102-110`.

Patch ownership requires authenticated principals, roles, authorization, claims, transfer, deletion, and moderation policy. It cannot be inferred from `placedBy`, participation, or chunks.

### Existing Correctness Blockers

Placement validates before the transaction lock. Two conflicting requests can validate stale state and both persist. The current concurrency test does not use concurrent database transactions. See `apps/server/src/index.ts:1547-1597`, `apps/server/src/db/repository.ts:575-589`, and `apps/server/src/index.concurrency.test.ts:5-132`.

Operations older than seven days and snapshots older than 30 days are deleted independently. Replay starts empty when no snapshot remains, so quiet content can reconstruct as empty despite authoritative tile rows. See `apps/server/src/jobs/retention.ts:4-17` and `apps/server/src/db/repository.ts:999-1060`.

Both invariants should be repaired before multi-patch transactions and recovery.

## Selected Architecture

### Domain Shape

```text
Quilt
  id, patchRows, patchColumns, patchWidth, patchHeight
  topology = toroidal, protocolVersion

Patch
  stable id, quilt id, canonical row and column
  owner and memberships, revision, history, snapshot baseline

Chunk
  patch-local integer x and y
  internal query, cache, and realtime partition

Tile
  one stable id, anchor patch, local transform
  spatial references to every intersected patch and chunk
```

Do not persist explicit neighbor records for a complete rectangular torus. Derive neighbors with modulo. Add adjacency records only if future requirements introduce holes, portals, rotated edges, variable shapes, or manual restitching.

### Coordinate Invariants

1. Every object has one canonical position in half-open quilt and patch ranges.
2. Patch rows and columns use Euclidean modulo, including negative and multi-period input.
3. Local coordinates satisfy `0 <= x < patchWidth` and `0 <= y < patchHeight`.
4. A render copy is an alias with no separate ID, owner, history, or row.
5. Navigation may remain unwrapped, while Three.js receives camera-relative coordinates.
6. Wrapped viewports decompose into at most four canonical rectangles.
7. Queries, subscriptions, and interactions deduplicate canonical IDs.
8. Collision, snapping, hit testing, presence, and selection behave the same at seams and interior boundaries.
9. Quilt dimensions are immutable after content exists unless a versioned migration rewrites all spatial references and history.
10. Stable links use canonical location or durable object IDs, never render aliases.

JavaScript `%` is remainder and may be negative. Use positive modulo such as `((value % period) + period) % period`. Sources: [ECMAScript multiplicative operators](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-multiplicative-operators) and [MDN remainder](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder).

### Resolver Example

```ts
type QuiltTopology = {
  patchRows: number
  patchColumns: number
  patchWidth: number
  patchHeight: number
}

type Vec2 = { x: number; y: number }
type CanonicalPoint = {
  patch: { row: number; column: number }
  local: Vec2
}

const floorMod = (value: number, period: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(period) || period <= 0) {
    throw new RangeError('Finite value and positive period required')
  }
  return ((value % period) + period) % period
}

const canonicalize = (
  unwrapped: Vec2,
  topology: QuiltTopology,
): CanonicalPoint => {
  const worldWidth = topology.patchColumns * topology.patchWidth
  const worldHeight = topology.patchRows * topology.patchHeight
  const x = floorMod(unwrapped.x, worldWidth)
  const y = floorMod(unwrapped.y, worldHeight)
  const column = Math.floor(x / topology.patchWidth)
  const row = Math.floor(y / topology.patchHeight)

  return {
    patch: { row, column },
    local: {
      x: x - column * topology.patchWidth,
      y: y - row * topology.patchHeight,
    },
  }
}
```

The resolver should own canonicalization, nearest-image deltas, wrapped viewport decomposition, visible image enumeration, and subscription deduplication. Do not scatter wrapping arithmetic through placement and rendering modules.

### Client Flow

```mermaid
flowchart LR
    A[Unwrapped camera] --> B[Patch image resolver]
    B --> C[Canonical subscriptions]
    C --> D[Bounded patch cache]
    D --> E[Visible periodic images]
    E --> F[Camera-relative R3F scene]
    F --> G[Display hit]
    G --> H[Canonical identity]
    H --> I[Authorized mutation]
```

Keep smooth unwrapped camera navigation, periodically rebase the render origin, resolve visible periodic images, deduplicate subscriptions, and evict state outside the prefetch margin. A seam-crossing tile may have multiple display keys but one authoritative tile ID. Pointer hits convert from display space to unwrapped space, then canonicalize before mutation.

Use a camera-local interaction plane. Gather geometry from the target patch and wrapped neighbor halo, translate it to nearest images, and reuse local Euclidean SAT logic. Add instancing or batching only after measuring visible scene budgets.

### Conceptual Persistence

```text
quilts(id, patch_rows, patch_columns, patch_width, patch_height,
       topology, protocol_version)

patches(id, quilt_id, row, column, owner_principal_id, state, revision,
        unique(quilt_id, row, column))

patch_members(patch_id, principal_id, role,
              primary key(patch_id, principal_id))

tiles(id, anchor_patch_id, local_x, local_y, shape, color, material,
      rotation, mirrored, placed_by_principal_id)

tile_spatial_refs(tile_id, patch_id, chunk_x, chunk_y,
                  primary key(tile_id, patch_id, chunk_x, chunk_y))

patch_operations(patch_id, op_seq, event_id, operation_id,
                 actor_principal_id, op_type, payload,
                 unique(patch_id, op_seq))

patch_snapshots(patch_id, op_seq, state,
                unique(patch_id, op_seq))
```

`tile_spatial_refs` is derived query metadata. A boundary-crossing tile remains one authoritative tile but can be found from every patch and chunk its geometry intersects.

Start with a patch-leading multicolumn B-tree and inspect representative plans. Do not partition tables per patch or chunk without workload evidence. Sources: [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html) and [PostgreSQL partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html).

### Authorization and Transactions

Authorize every patch intersected by a tile footprint. Anchor-only authorization would permit geometry inside another owner's patch. Prefer one atomic result: all affected patches permit the operation or nothing persists.

Transaction flow:

1. Authenticate a stable principal.
2. Canonicalize the anchor server-side.
3. Derive geometry, intersected patches, and collision halo.
4. Lock affected patch IDs in stable sorted order.
5. Read nearby tiles inside the transaction.
6. Validate permissions, geometry, and expected patch revisions.
7. Persist one tile and its spatial references.
8. Advance affected patch histories under one operation ID.
9. Commit, acknowledge, and publish scoped events.

Sorted patch locks avoid deadlocks; distant patches can mutate concurrently.

### Protocol V2

Use one authenticated quilt connection with authorized patch/chunk subscriptions and patch cursors. Subscription acknowledgements should report accepted, forbidden, invalid, and budget-exceeded rooms. Protocol-v2 clients should receive scoped content streams only, not duplicate quilt-wide mutation events.

Server controls must cap rooms, chunks per request, churn, snapshot tile count, and payload bytes; canonicalize and deduplicate room IDs; authorize fine and aggregate data consistently; and return accepted cursors. Presence can be coalesced and volatile where loss is acceptable. Durable operations require acknowledgements, idempotency, persisted event IDs, cursors, and snapshot recovery.

Socket.IO rooms are delivery optimization, not durable state. Sources: [Socket.IO rooms](https://socket.io/docs/v4/rooms/), [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees), and [connection-state recovery](https://socket.io/docs/v4/connection-state-recovery/).

The PostgreSQL adapter needs a `socket_io_attachments` table for payloads over 8 KB, but no repository migration provisions it. See `node_modules/@socket.io/postgres-adapter/README.md:20-35,45-68,115-124`.

## Alternatives Evaluated

| Alternative | Literal wrap | Ownership boundary | Bounded work | Decision |
| --- | --- | --- | --- | --- |
| Huge global torus with canvas-wide consistency | Yes | Implicit ranges | No | Reject |
| Finite toroidal quilt with first-class patches | Yes | Explicit patch ACL | Yes | Select |
| Unbounded sparse plane | No | Optional patch | Yes | Reject for issue 53 |
| Independent scenes or adjacency graph | Configurable | Explicit patch | Potentially | Reject |
| Larger bounded preset | No | None | No at scale | Reject |

A huge global torus appears compatible with current transforms but preserves quilt-wide locks, revisions, snapshots, and implicit coordinate-range authorization. Correcting those concerns effectively introduces patches without naming them.

An unbounded sparse plane best fits existing signed chunks and avoids seam aliases. Select it only if literal wrapping is removed.

Independent scenes duplicate contexts, controls, sockets, and pointer routing. An adjacency graph adds edge orientation, reciprocity, cycle, and portal semantics. Select it only for nonrectangular or manually restitched worlds.

A larger preset delays the boundary but does not implement wraparound, ownership, scoped consistency, or bounded state.

## Implementation Sequence

### Stage 0: Product and Security Decisions

Decide quilt tenancy and dimensions, immutable axes, far-zoom behavior, identity provider, roles, claims, transfer, deletion, moderation, visibility, aggregate privacy, boundary-crossing operations, grid origin, seam presentation, minimap, stable links, presence scope, and legacy migration. Set measurable database, network, recovery, cache, scene, and frame-time budgets.

Exit gate: approved invariants and threat model with no reliance on client ID or `placedBy` as authorization.

### Stage 1: Shared Topology Domain

Implement property-tested positive modulo, canonicalization, nearest-image deltas, wrapped viewport decomposition, image enumeration, and subscription deduplication independently of React, Socket.IO, and PostgreSQL.

Exit gate: negative positions, exact seams, multiple laps, both axes, and four-corner views pass.

### Stage 2: Persistence and Identity Expansion

Add quilt, patch, principal, membership, patch-history, patch-snapshot, and spatial-reference structures. Start migration columns nullable, backfill, verify, then enforce constraints. Provision adapter attachments. Preserve tile IDs and transforms; do not infer owners.

Use a single production migration job instead of racing rolling replicas through startup migration application. See `apps/server/src/db/migrate.ts:14-61` and `apps/server/src/index.ts:2070-2104`.

Exit gate: idempotent backfill parity, expanded-schema backward compatibility, and no accidental owners.

### Stage 3: Patch-Scoped Correctness

Move normalization, authorization, reads, and validation into the transaction. Lock sorted affected patches, use patch histories, persist spatial references, and establish a reconstructable snapshot-retention invariant.

Exit gate: real PostgreSQL concurrency proves one seam-conflict winner, no reversed-order deadlock, and parallel distant-patch writes.

### Stage 4: Protocol V2 Area-of-Interest Delivery

Add authenticated quilt handshake, bounded subscriptions, patch cursors, acknowledgements, and application-level reconnect recovery. Keep protocol v1 only for v1 clients during rollout.

Exit gate: failed automatic recovery converges, unauthorized subscriptions fail consistently, and one mutation produces one scoped durable stream.

### Stage 5: Client Virtualization and Seam Rendering

Replace flat state with patch/chunk keyed snapshots, cursors, optimistic operations, explicit undo metadata, and eviction. Refactor application orchestration around quilt identity and visible patch images. Keep one scene, use camera-local rendering and interactions, and map aliases to canonical IDs.

Exit gate: bounded state and scene counts over long traversal, stable precision after many laps, and equivalent seam and interior behavior.

### Stage 6: Migration, Canary, and Contract

Dual-read and compare legacy and patch data. Rehearse all current canvas sizes. Monitor parity, lock waits, mutation latency, snapshot bytes, resyncs, room churn, adapter attachments, pool wait, and frame time. Retire whole-world snapshots, protocol v1 fanout, and legacy columns only after migration.

The current PostgreSQL server is 1 vCore, 2 GiB, 32 GiB storage, without HA, and with seven-day backups. Capacity changes require production-like measurements. See `infra/bicep/modules/postgresql.bicep:38-77`.

## Migration Guidance

Do not silently reinterpret a bounded canvas as a 1-by-1 torus; formerly opposite edges become adjacent. Keep legacy canvases bounded until explicit opt-in, create non-toroidal legacy quilt records during expansion, or place canvases through a deterministic packing migration.

Existing canvases have no trustworthy owner. Backfill as unclaimed or system-owned under an approved policy. Preserve tile IDs, transforms, materials, colors, authorship, and layout.

Recovery should either treat the tile table as current state and operations as audit/delivery, or retain a complete patch baseline no newer than the earliest retained event. Independent age windows are insufficient.

## Acceptance Tests

### Topology and User Behavior

* Each edge wraps continuously without a camera jump
* Negative, exact-boundary, and multi-period coordinates canonicalize deterministically
* One-axis and corner seams produce all images and one subscription per canonical chunk
* Display aliases select, remove, highlight, and link to one tile ID
* Repeated laps do not degrade precision or grid alignment

### Geometry and Authorization

* Collision, adjacency, snapping, picking, presence, and selection match at interior and seam boundaries
* Multi-patch footprints require permission for every affected patch
* Unauthorized operations persist no partial tile or spatial references
* Fine data, aggregates, presence, and events enforce the same visibility rules
* Claims, roles, transfer, suspension, moderation, and deletion follow the approved ACL matrix

### Concurrency and Persistence

* Concurrent conflicting seam placements produce exactly one accepted result
* Distant patch writes proceed without a quilt-wide lock
* Sorted locks avoid reversed-order deadlock
* Idempotent retry creates no duplicate tile, reference, event, or broadcast
* Reconstruction matches authoritative tiles at every supported retention age
* Migration preserves IDs, transforms, layout, and authorship without inventing owners

### Realtime and Client Scale

* A seam-straddling client reconnects through another replica and converges from cursors without a whole-quilt snapshot
* Server limits reject excessive rooms, churn, invalid IDs, unauthorized patches, and oversized snapshots explicitly
* One protocol-v2 mutation produces no duplicate session-wide event
* Unsubscribe evicts eligible state and render objects while preserving active optimistic and undo metadata
* Long traversal remains inside agreed state, scene, draw-call, snapshot-byte, and frame-time budgets

Baseline commands are `npm run lint`, `npm run build`, `npm run test`, and `npm run test:e2e:ci` from `package.json:15-30`. The current Playwright harness is single-server; multi-replica and scale tests need a new harness. See `playwright.config.ts:3-47`.

## Product Decisions Required

* One global quilt, community quilts, or user-created quilts
* Rows, columns, patch dimensions, wrapped axes, and resize policy
* Whether patches are user-visible owned regions or an implementation metaphor
* Principal provider, owner types, roles, claim, transfer, suspension, deletion, and moderation
* Whether geometry may cross patch boundaries and its atomic authorization rule
* Visibility of patch existence, content, aggregates, presence, and search
* Seam cues, minimap, canonical links, and far-zoom repeated images
* Quilt-global or patch-local grid pattern and origin
* Presence and roster scope
* Undo and future copy/paste across eviction and ownership boundaries
* Existing canvas opt-in or packing policy
* Workload, latency, durability, and recovery objectives

## Potential Next Research

* Product and threat-model workshop
  * Reasoning: Identity, ACL, lifecycle, privacy, and boundary operations control the durable model
  * Reference: Product decisions in this research
* Pure topology and seam-interaction prototype
  * Reasoning: A resolver spike can disprove coordinate assumptions before networking work
  * Reference: Resolver and acceptance tests in this research
* PostgreSQL transaction prototype
  * Reasoning: Sorted locks and in-transaction seam validation need real concurrent connections
  * Reference: `apps/server/src/db/repository.ts:575-803`
* Two-replica Socket.IO load test
  * Reasoning: Room limits, recovery, attachments, privacy, and slow clients need deployed-adapter evidence
  * Reference: `node_modules/@socket.io/postgres-adapter/README.md:20-124`
* Production-like migration rehearsal
  * Reasoning: Packing, duration, indexes, compatibility, and rollback cannot be sized from source alone
  * Reference: `apps/server/src/db/migrate.ts:14-61`
* Client rendering benchmark
  * Reasoning: Cache, scene, material, draw-call, and frame-time budgets must precede batching choices
  * Reference: `apps/client/src/render/MosaicScene.tsx:98-153`

## Research Executed

### Delegated Reports

* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-client-research.md:1-279`
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-server-research.md:1-394`
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-topology-research.md:1-229`
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-alternatives-research.md:1-441`

### Primary Repository Evidence

* `apps/client/src/App.tsx:519-648,823-952`
* `apps/client/src/domain/math2d.ts:1-115`
* `apps/client/src/domain/placementSolver.ts:67-261`
* `apps/client/src/domain/gridPatterns.ts:20-221`
* `apps/client/src/interaction/controller.ts:24-153`
* `apps/client/src/network/useSocketConnection.ts:23-147`
* `apps/client/src/render/MosaicScene.tsx:214-603`
* `apps/server/src/contracts.ts:26-179,201-532`
* `apps/server/src/db/schema.ts:21-157`
* `apps/server/src/db/repository.ts:471-1060`
* `apps/server/src/index.ts:1234-1281,1415-1800`
* `apps/server/src/db/migrate.ts:14-61`
* `apps/server/src/jobs/retention.ts:4-17`
* `infra/bicep/modules/postgresql.bicep:38-77`

### External Evidence

* [GitHub issue 53](https://github.com/dkirby-ms/zzyix/issues/53)
* [ECMAScript multiplicative operators](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-multiplicative-operators)
* [MDN remainder](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder)
* [MDN Number.MAX_SAFE_INTEGER](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER)
* [Three.js Object3D](https://threejs.org/docs/pages/Object3D.html)
* [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
* [PostgreSQL partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
* [Socket.IO rooms](https://socket.io/docs/v4/rooms/)
* [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees)
* [Socket.IO connection-state recovery](https://socket.io/docs/v4/connection-state-recovery/)

## Project Conventions

* No `.github/copilot-instructions.md` exists in the workspace
* Research follows existing React, React Three Fiber, Three.js, TypeScript, Socket.IO, PostgreSQL, Drizzle, Vitest, and Playwright patterns
* Product code was not modified
* Research files use `<!-- markdownlint-disable-file -->` as required for `.copilot-tracking/research/`
