<!-- markdownlint-disable-file -->
# Infinite Quilt Phase 2 Alternatives Analysis

## Status

Complete as of 2026-07-27.

## Research Scope

Evaluate the architecture alternatives for GitHub issue 53 against the completed client, server, and topology research, then select exactly one primary approach for the stated finite wraparound quilt requirement. Product code is out of scope.

The analysis covers:

* One huge toroidal canvas using current global coordinates and canvas-wide consistency
* A finite toroidal quilt with first-class patches and patch-local coordinates and chunks
* An unbounded sparse plane
* Independently stitched canvas scenes or an explicit adjacency graph
* Increasing the existing bounded preset size

Each alternative is evaluated for observable behavior, current-code fit, correctness, ownership and ACL boundaries, rendering and precision, realtime and persistence scaling, migration complexity, and selection or rejection rationale.

## Working Decision Hypothesis

A finite rectangular torus with first-class regular patches, patch-local canonical coordinates, and patch-local chunks is the only candidate that both implements literal opposite-edge wrapping and gives ownership, authorization, consistency, subscriptions, and migration one explicit bounded unit. This hypothesis would be false if the repository already provides enforceable patch-level authority and independent chunk consistency within one global canvas, or if issue 53 does not require literal wrapping.

## Evidence Under Verification

The hypothesis survived repository verification.

### Requirement boundary

GitHub issue 53 asks for an extremely large finite-feeling canvas where panning through one end arrives at the other. It does not state ownership, ACL, migration, patch dimensions, or seam interaction policy. Source: [GitHub issue 53](https://github.com/dkirby-ms/zzyix/issues/53). The first-class, potentially differently owned patch requirement therefore comes from the Phase 2 scope rather than the issue body.

Literal opposite-edge traversal distinguishes a torus from an unbounded plane. A bounded enlargement can delay encountering an edge, but it cannot satisfy the specified wrap behavior.

### Current ownership and identity boundary

* `users` exists, but canvas participants and tile attribution use unconstrained text client IDs; neither references an authenticated user. `canvases` has no owner or ACL fields. See `apps/server/src/db/schema.ts:21-64`.
* A tile records `placedBy`, but its only spatial owner is `canvasId`; patch identity does not exist. See `apps/server/src/db/schema.ts:66-101`.
* Socket authentication accepts caller-supplied `sessionId` and `clientId`, then stores them without principal authentication or authorization lookup. See `apps/server/src/index.ts:1415-1468`.
* Removal checks tile existence and canvas membership, not author, owner, or role. See `apps/server/src/db/repository.ts:902-997`.
* The public create endpoint accepts only a size preset and creates an unowned canvas. See `apps/server/src/index.ts:1234-1281`.

Conclusion: there is no existing patch-level authority that would make implicit coordinate-derived ownership safe. Authentication, principal identity, patch ownership, and role-based authorization are prerequisites rather than incremental fields.

### Current consistency and persistence boundary

* Tiles persist global floating-point positions plus derived chunk coordinates. The composite index begins with canvas ID and then chunk X, chunk Y, and creation time. See `apps/server/src/db/schema.ts:66-101`.
* Operations and snapshots are canvas-scoped. Operation sequence uniqueness is `(canvas_id, op_seq)`, and snapshots store one JSONB state per canvas sequence. See `apps/server/src/db/schema.ts:102-157`.
* Placement and removal acquire one advisory transaction lock derived from the session ID, use one canvas revision, and reload every tile before returning. See `apps/server/src/db/repository.ts:575-803` and `apps/server/src/db/repository.ts:806-997`.
* Validation happens before `persistTilePlacement` acquires the transaction lock, so conflicting requests can both validate stale state before serial persistence. See `apps/server/src/index.ts:1547-1597` and `apps/server/src/db/repository.ts:575-589`.
* Snapshots serialize the complete tile array, and replay starts from that whole-canvas JSONB state. See `apps/server/src/db/repository.ts:999-1060`.
* Operation and snapshot retention use independent seven-day and 30-day windows. The model does not establish an invariant that a retained baseline predates the earliest retained operation. See `apps/server/src/jobs/retention.ts:4-17` and `apps/server/src/db/repository.ts:999-1060`.

Conclusion: chunks are query metadata, not independent correctness units. Retaining canvas-wide locking, revisioning, mutation responses, and snapshots on a huge world would serialize unrelated edits and make cost grow with total quilt content.

### Current realtime and client-state boundary

* Every socket joins the session room and receives a whole-session snapshot before viewport subscriptions. See `apps/server/src/index.ts:1475-1517`.
* Each accepted mutation is broadcast once to the session room and again to a chunk room. Current chunk streaming adds scoped traffic without removing global traffic. See `apps/server/src/index.ts:1613-1629` and `apps/server/src/index.ts:1693-1713`.
* Chunk subscribe requests join every requested room and build a snapshot without a server-side chunk-count, total-room, or churn limit. See `apps/server/src/index.ts:1739-1800`.
* The client applies whole-session snapshots to one flat tile array and one operation sequence and revision. See `apps/client/src/App.tsx:519-648` and `apps/client/src/interaction/controller.ts:24-153`.
* Viewport subscriptions are client-budgeted, but unsubscribe does not evict retained tiles. Fine snapshots replace only incoming chunks, while aggregate snapshots do not provide an aggregate rendering model. See `apps/client/src/App.tsx:566-585` and `apps/client/src/App.tsx:823-952`.
* One Socket.IO connection authenticates to one session. Changing session identity creates a different connection rather than subscribing one quilt connection to multiple patches. See `apps/client/src/network/useSocketConnection.ts:23-55` and `apps/client/src/network/useSocketConnection.ts:108-147`.

Conclusion: a scalable quilt requires one quilt-level connection, authorized patch/chunk area-of-interest subscriptions, independent cursors, explicit cache eviction, and no mandatory whole-quilt snapshot or duplicate global stream.

### Current geometry and rendering boundary

* Positions are absolute JavaScript numbers. Chunking is `Math.floor(world / chunkSize)`, and viewport enumeration scans signed global chunk pairs. See `apps/client/src/domain/math2d.ts:1-8` and `apps/client/src/domain/math2d.ts:59-87`.
* The placement solver transforms every candidate and settled polygon into one Euclidean plane, performs canvas-edge rejection for bounded worlds, and checks every settled tile for overlap and adjacency. See `apps/client/src/domain/placementSolver.ts:67-133` and `apps/client/src/domain/placementSolver.ts:152-261`.
* Grid slot identity and transforms use an unbounded, world-origin integer lattice. See `apps/client/src/domain/gridPatterns.ts:20-49` and `apps/client/src/domain/gridPatterns.ts:150-221`.
* The scene creates interaction and background planes from complete world bounds and maps the full retained tile array to individual meshes. See `apps/client/src/render/MosaicScene.tsx:293-331` and `apps/client/src/render/MosaicScene.tsx:380-483`.
* Three.js frustum culling defaults to enabled, but it does not remove React objects, materials, callbacks, or retained application state. See [Three.js `Object3D.frustumCulled`](https://threejs.org/docs/pages/Object3D.html#frustumCulled).
* JavaScript `%` is remainder and can be negative; canonical toroidal addressing must use Euclidean modulo such as `((n % d) + d) % d`. See [MDN remainder](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder). JavaScript integer precision is bounded and decreases with magnitude, which reinforces exact bounded addresses plus local render coordinates. See [MDN `Number.MAX_SAFE_INTEGER`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER).

Conclusion: keep one React Three Fiber scene and local Euclidean geometry, but feed it only viewport-local display images. Persist canonical patch-local positions, maintain an unwrapped navigation coordinate, and rebase GPU-facing positions around the camera.

## Alternatives Analysis

Five alternative families were evaluated. The criteria are requirements, not weighted convenience: failure to provide literal wraparound rejects an option for issue 53 even if implementation is cheaper.

### Summary matrix

| Alternative | Literal wrap | First-class ACL boundary | Bounded client and server work | Existing-code reuse | Decision |
| --- | --- | --- | --- | --- | --- |
| 1. Huge global torus with canvas-wide consistency | Yes | No | No | Superficially high | Reject |
| 2. Finite toroidal quilt with patch-local coordinates and chunks | Yes | Yes | Yes | High at geometry and renderer level | Select |
| 3. Unbounded sparse plane | No | Optional | Yes with origin rebasing | Highest topology fit | Reject for stated requirement |
| 4. Independently stitched scenes or explicit adjacency graph | Configurable rather than intrinsic | Yes | Potentially | Low for seamless interaction | Reject |
| 5. Larger bounded preset | No | No | No at sufficient scale | Highest short-term fit | Reject |

### Alternative 1: one huge global torus with canvas-wide consistency

| Criterion | Assessment |
| --- | --- |
| Observable product behavior | Panning wraps correctly if every coordinate, query, interaction, and render path applies world-period canonicalization. The seam can appear continuous through duplicate display images. |
| Fit with current code | Absolute transforms, global grid math, canvas IDs, global chunk IDs, and the current schema appear reusable. This is deceptive because bounds checks, seam collision, pointer aliases, and whole-state synchronization still need replacement. |
| Correctness | One canonical global position per tile is workable, but seam overlap and adjacency require minimum-image geometry. Keeping pre-lock validation and one revision preserves the current concurrency defect and adds quilt-wide false conflicts. |
| Ownership and ACL boundary | Coordinate ranges must be translated to ownership on every operation. Current chunks are operational buckets and current canvases have no ACL, so ownership becomes an implicit rule that is easy to bypass in mutations, snapshots, aggregates, and presence. |
| Rendering and precision | A separate camera-relative render origin is still mandatory. Passing huge global positions to the current complete-world planes and per-tile meshes risks floating-point jitter and unbounded retained scene state. |
| Realtime and persistence scaling | Fails if “canvas-wide consistency” is preserved: one advisory lock, revision, sequence, complete mutation response, global broadcast, snapshot, and replay cover all content. Unrelated edits serialize and every recovery trends toward quilt-sized cost. |
| Migration complexity | Tile rows need little coordinate rewriting, but ownership ranges, seam coverage, operation history, and snapshots require substantial changes. Migrating many canvases into one global coordinate space needs a deterministic packing policy. |
| Rationale | Reject. It implements wraparound, but its apparent compatibility preserves the exact consistency, fanout, snapshot, and authority boundaries that cannot scale. Once those are corrected, the result has effectively introduced first-class patches without naming them. |

### Alternative 2: finite toroidal quilt with first-class patches

| Criterion | Assessment |
| --- | --- |
| Observable product behavior | One finite rectangular quilt wraps on both axes. Users pan continuously through a seam, see translated aliases of the same canonical tiles, and interact with adjacent patches in one scene. Patch policy may be visible in editing affordances without creating visual canvas seams. |
| Fit with current code | Preserves React Three Fiber, orthographic navigation, tile geometry, materials, SAT calculations on local neighborhoods, signed chunk logic, Socket.IO rooms, PostgreSQL, and existing canvas-local coordinates. It changes orchestration, identity, authority, and synchronization rather than replacing the visual stack. |
| Correctness | Patch-local half-open coordinates give one canonical representation. Minimum-image resolution makes interior and seam behavior equivalent. In-transaction validation under sorted affected-patch locks preserves first-write-wins while allowing distant patches to mutate concurrently. |
| Ownership and ACL boundary | Patch is a stable product entity with owner and memberships. Authorization checks every patch intersected by an operation. Chunk size can remain an operational choice without silently changing governance. |
| Rendering and precision | Positions remain near zero within a patch. The client keeps unwrapped navigation for smooth laps, resolves nearest patch images, rebases around the camera, renders only visible data, and deduplicates interaction by canonical tile ID. |
| Realtime and persistence scaling | Patch/chunk rooms bound fanout; patch revisions and cursors avoid false gaps from distant edits; patch-local snapshots and explicit cache eviction bound recovery and client memory. Composite B-tree indexes remain suitable for patch-plus-chunk reads. |
| Migration complexity | Highest intentional contract change, but lowest semantic ambiguity. Each existing canvas can become one patch without rewriting local tile geometry. A dual-protocol expand/backfill/canary/contract rollout can preserve legacy clients while v2 proves parity. |
| Rationale | Select. It is the only option that satisfies literal wrapping, first-class differently owned regions, finite storage, local precision, and independently scalable consistency without inventing arbitrary topology. |

### Alternative 3: unbounded sparse plane

| Criterion | Assessment |
| --- | --- |
| Observable product behavior | Users never need to meet a boundary, but continuing east never returns to western content. This is infinite expansion, not opposite-edge wrapping. |
| Fit with current code | Strongest implementation fit. Existing unbounded bounds policy, signed chunks, `Math.floor` negative addressing, and viewport subscriptions already model a sparse plane. See `apps/server/src/contracts.ts:52-65` and `apps/client/src/domain/math2d.ts:59-87`. |
| Correctness | Avoids periodic aliases and seam decomposition. Exact long-term addressing still needs integer patch or chunk coordinates and local offsets; an indefinitely growing floating-point world coordinate is not a durable exact address. |
| Ownership and ACL boundary | Sparse claimed patches could be first-class. However, allocation, discoverability, abandonment, moderation coverage, and the meaning of unclaimed gaps become open-ended product concerns. |
| Rendering and precision | Camera-relative rendering and origin rebasing remain necessary as navigation magnitude grows. Viewport materialization is natural and no seam duplicates are needed. |
| Realtime and persistence scaling | Sparse patch/chunk subscriptions scale well when only occupied or visible units exist. Global session broadcasts, full snapshots, and one canvas lock would still have to be removed. |
| Migration complexity | Existing canvases can be assigned sparse addresses with little geometry change. Stable links and packing still need a product policy, but there is no finite topology dimension to lock. |
| Rationale | Reject for issue 53 because it violates literal wraparound. Select this instead only if product changes the requirement to “users should never encounter an edge” and accepts that content does not repeat. |

### Alternative 4: independently stitched scenes or explicit adjacency graph

This family has two implementation variants with the same product premise: patches are independent nodes joined by explicit edges rather than cells in one regular torus.

| Criterion | Assessment |
| --- | --- |
| Observable product behavior | A graph can create portals, holes, rotations, curated paths, and nonrectangular quilts. “Opposite edge” is not intrinsic; every transition depends on an edge record. Independently mounted canvases risk visible seams, discontinuous pointer capture, and camera transitions. |
| Fit with current code | Existing sessions, ownership-sized canvases, and local coordinates can survive as nodes. Ordinary integer neighbors, global grid cells, one R3F camera, pointer intersection, placement, presence, and chunk enumeration do not generalize to arbitrary graph transforms. |
| Correctness | Each edge needs reciprocal consistency, orientation, scale, edge-length compatibility, and cycle rules. Cross-edge selection and geometry may have multiple valid images or contradictory transforms. Graph edits can change existing spatial meaning. |
| Ownership and ACL boundary | Strong explicit patch ownership. Multi-patch operations still require atomic authorization, and knowing an edge must not grant visibility or edit rights. |
| Rendering and precision | Multiple WebGL canvases duplicate contexts, controls, lights, and event routing. One scene with graph-resolved patch transforms avoids that cost but becomes a general portal renderer. Both are more complex than periodic translations. |
| Realtime and persistence scaling | Per-node streams can be bounded. Explicit adjacency adds edge lifecycle, cache invalidation, navigation traversal, and consistency work; independent scene connections also multiply sockets or require a new multiplexing layer. |
| Migration complexity | Existing canvases map naturally to nodes, but adjacency, orientations, transition semantics, global search, and stable links require entirely new product data. |
| Rationale | Reject. It solves a broader, different problem and adds topology ambiguity without evidence that holes, portals, rotated edges, or manual restitching are required. Reconsider only if those become explicit product requirements. |

### Alternative 5: increase the bounded preset size

| Criterion | Assessment |
| --- | --- |
| Observable product behavior | The edge is farther away but remains a hard boundary. There is no wrap and no repeated neighbor across opposite sides. |
| Fit with current code | Cheapest short-term change because creation already accepts `classic`, `expanded`, and `vast`, while bounds and initial camera framing derive from preset dimensions. See `apps/server/src/contracts.ts:152-179` and `apps/server/src/index.ts:1234-1281`. |
| Correctness | Existing edge rejection remains understandable. No seam logic is added, so the requirement remains unimplemented. Larger worlds do not repair validation outside the lock. |
| Ownership and ACL boundary | Still one unowned canvas. Size presets provide no region identity, claim, transfer, role, or deletion boundary. |
| Rendering and precision | Complete-world interaction and background planes grow with bounds. The client still retains and maps every loaded tile. Increasing size amplifies current state and scene costs before virtualization is complete. |
| Realtime and persistence scaling | One lock, revision, sequence, snapshot, session room, and replay remain canvas-wide. Scale increases total content without introducing bounded work units. |
| Migration complexity | Minimal schema and contract work, but it creates a second migration later when real wrapping and patches are introduced. Existing users may also treat the larger boundary as stable content semantics. |
| Rationale | Reject. It is a capacity preset, not an alternatives solution. It can be used as a temporary experiment only if issue 53 is explicitly deferred rather than claimed complete. |

## Primary Selection

Select exactly one primary approach: **a finite rectangular toroidal quilt with first-class regular patches, patch-local canonical coordinates, and patch-local chunks**.

The selected architecture has three distinct levels:

1. The quilt defines immutable finite dimensions, regular patch dimensions, toroidal axes, protocol version, and world lifecycle.
2. A patch defines stable address, owner and ACL, local revision, local history, and local snapshot boundary.
3. A chunk remains a tunable spatial query, cache, and realtime room bucket inside a patch. It is not an ownership unit.

One React Three Fiber scene presents visible translated patch images. One quilt-level Socket.IO connection subscribes to authorized canonical patch/chunk rooms. The database stores one canonical tile identity and local transform; render aliases never become rows, IDs, owners, or operations.

### Why this wins

* It alone satisfies both explicit constraints: finite opposite-edge wrapping and adjacent, potentially differently owned patches.
* It places authority, locks, revisions, snapshots, cache eviction, and migration at the same explicit patch boundary.
* It preserves current local geometry and visual technology while preventing huge coordinates from becoming GPU positions.
* It turns current canvases into a migration asset: their local tile coordinates and visual layout can be retained inside patches.
* It avoids unnecessary graph generality. A complete rectangular torus derives neighbors with modulo and cannot contain contradictory adjacency rows.

### Conditions that would change the decision

* If product removes literal wrapping and defines “infinite” as never reaching an edge, select an unbounded sparse plane with exact chunk or patch addresses and origin rebasing.
* If patches must have holes, arbitrary shapes, rotation, mismatched edge lengths, portals, or curator-controlled restitching, select an explicit adjacency graph and fund graph-transform semantics.
* If patch ownership, transfer, ACL, and independent lifecycle are removed, a logical global torus with global canonical coordinates becomes viable, but only after replacing canvas-wide consistency and adding camera-relative rendering.
* If the feature is only a short-lived visual prototype with no persistence or collaboration, a client-only wrap illusion can test UX. It must not accept authoritative edits because seam collision and identity would be false.
* If benchmarked projected load proves one patch cannot meet latency and contention targets, reduce patch dimensions or introduce a measured consistency subdivision. Do not silently redefine chunks as ACL units.

## Proposed Schema and Contracts

The model below is intentionally compact. Names are conceptual and may be adapted to Drizzle conventions.

```text
quilts(
	id uuid primary key,
	patch_rows int check > 0,
	patch_columns int check > 0,
	patch_width double precision check > 0,
	patch_height double precision check > 0,
	topology text check = 'toroidal',
	protocol_version int,
	created_at, updated_at
)

patches(
	id uuid primary key,
	quilt_id uuid references quilts,
	row int check 0 <= row < quilt.patch_rows,
	column int check 0 <= column < quilt.patch_columns,
	owner_principal_id uuid null references principals,
	state text,
	revision bigint,
	unique(quilt_id, row, column)
)

patch_members(
	patch_id uuid references patches,
	principal_id uuid references principals,
	role text check in ('viewer', 'editor', 'moderator'),
	primary key(patch_id, principal_id)
)

tiles(
	id uuid primary key,
	anchor_patch_id uuid references patches,
	local_x double precision,
	local_y double precision,
	shape, color, material, rotation, mirrored, placed_by, created_at
)

tile_spatial_refs(
	tile_id uuid references tiles,
	patch_id uuid references patches,
	chunk_x int,
	chunk_y int,
	primary key(tile_id, patch_id, chunk_x, chunk_y),
	index(patch_id, chunk_x, chunk_y, tile_id)
)

patch_operations(
	patch_id uuid references patches,
	op_seq bigint,
	event_id uuid unique,
	operation_id uuid,
	op_type, payload, actor_principal_id, created_at,
	unique(patch_id, op_seq)
)

patch_snapshots(
	patch_id uuid references patches,
	op_seq bigint,
	state jsonb,
	created_at,
	unique(patch_id, op_seq)
)
```

`tile_spatial_refs` is spatial index metadata, not duplicated authority. A tile that overlaps a patch or chunk seam retains one row in `tiles` and gains references for every affected canonical patch/chunk. This lets a visible-area query find seam-crossing geometry while selection, undo, removal, and audit collapse to one tile ID.

Do not partition PostgreSQL tables per patch or chunk by default. PostgreSQL says multicolumn B-trees are most efficient when predicates constrain leading columns, matching patch-first chunk reads, and warns that excessive partition counts add planning and memory cost. Sources: [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html) and [PostgreSQL partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html). Measure representative `EXPLAIN (ANALYZE, BUFFERS)` plans before physical partitioning.

### Contract v2 sketch

```ts
type PatchAddress = { row: number; column: number }
type LocalPoint = { x: number; y: number }
type CanonicalPoint = { patch: PatchAddress; local: LocalPoint }
type PatchChunkId = `${string}:${number}:${number}` // patchId:chunkX:chunkY
type PatchCursor = { patchId: string; opSeq: number; revision: number }

type QuiltConnectionAuth = {
	protocolVersion: 2
	quiltId: string
	accessToken: string
	cursors?: PatchCursor[]
}

type PlaceQuiltTile = {
	operationId: string
	tileId: string
	anchor: CanonicalPoint
	shape: TileShape
	color: string
	material: MaterialVariant
	rotation: number
	mirrored?: boolean
	expectedPatchRevisions: Record<string, number>
}

type SubscribePatchChunks = {
	quiltId: string
	chunks: PatchChunkId[]
	cursors: Partial<Record<PatchChunkId, PatchCursor>>
	payloadMode: 'fine' | 'aggregate'
}

type SubscriptionAck = {
	accepted: PatchChunkId[]
	rejected: Array<{ chunk: PatchChunkId; reason: 'FORBIDDEN' | 'LIMIT' | 'INVALID' }>
	cursors: PatchCursor[]
}
```

The server derives affected patches and spatial references from geometry. Clients never assert their authorization scope. One operation gets one atomic authorization result, even if it advances multiple patch histories under one transaction.

Socket.IO rooms remain delivery optimization. Room union semantics deliver one event to a socket joined through multiple matching rooms, but default delivery is at most once and disconnected clients miss server events. Persisted event IDs and cursors are therefore the recovery boundary. Sources: [Socket.IO rooms](https://socket.io/docs/v4/rooms/) and [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees). Automatic connection-state recovery cannot be required because PostgreSQL adapter support remains work in progress, and Socket.IO requires an application resynchronization path even when recovery is enabled. Source: [Socket.IO connection-state recovery](https://socket.io/docs/v4/connection-state-recovery/).

## Coordinate Resolver

The resolver owns all topology arithmetic. Spatial modules should consume resolved local neighborhoods rather than scatter `% worldWidth` expressions.

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

const periods = (topology: QuiltTopology) => ({
	width: topology.patchColumns * topology.patchWidth,
	height: topology.patchRows * topology.patchHeight,
})

export const canonicalize = (
	unwrapped: Vec2,
	topology: QuiltTopology,
): CanonicalPoint => {
	const world = periods(topology)
	const x = floorMod(unwrapped.x, world.width)
	const y = floorMod(unwrapped.y, world.height)
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

export const canonicalGlobal = (
	point: CanonicalPoint,
	topology: QuiltTopology,
): Vec2 => ({
	x: point.patch.column * topology.patchWidth + point.local.x,
	y: point.patch.row * topology.patchHeight + point.local.y,
})

export const nearestImage = (
	point: CanonicalPoint,
	reference: Vec2,
	topology: QuiltTopology,
): Vec2 => {
	const canonical = canonicalGlobal(point, topology)
	const world = periods(topology)
	return {
		x: canonical.x + Math.round((reference.x - canonical.x) / world.width) * world.width,
		y: canonical.y + Math.round((reference.y - canonical.y) / world.height) * world.height,
	}
}

export const renderPosition = (
	point: CanonicalPoint,
	cameraUnwrapped: Vec2,
	renderOrigin: Vec2,
	topology: QuiltTopology,
): Vec2 => {
	const image = nearestImage(point, cameraUnwrapped, topology)
	return { x: image.x - renderOrigin.x, y: image.y - renderOrigin.y }
}
```

Required invariants:

* Canonical patch indices are always within quilt dimensions, including negative and multi-period input.
* Local coordinates always use half-open ranges: `0 <= x < patchWidth` and `0 <= y < patchHeight`.
* Exact seams belong to one canonical patch.
* Render image offset is view metadata and never enters a durable ID or mutation payload.
* The viewport resolver may return multiple images of one canonical patch but deduplicates subscriptions by canonical patch/chunk ID.
* Overlap, adjacency, snapping, hit testing, pointer presence, and selection use nearest periodic images. They produce canonical tile IDs.
* The camera may retain an unwrapped logical lap position, but Three.js receives coordinates relative to a periodically rebased render origin.

## Implementation Sequence

### Stage 0: close product and security prerequisites

Prerequisites before schema or protocol implementation:

* Fix launch topology: patch rows, columns, width, height, wrapped axes, immutability, and whether zoom-out may show repeated canonical patches.
* Define authenticated principals, patch owner types, roles, unowned-patch behavior, transfer, account deletion, moderation, visibility, and aggregate privacy.
* Decide whether tile footprints may cross patch boundaries. The recommended policy is atomic authorization against every intersected patch; rejection is safer than partial placement.
* Define quilt-global versus patch-local grid origin, seam presentation, stable location links, minimap semantics, presence scope, and status-count meaning.
* Choose legacy migration behavior. Do not silently turn a bounded canvas into a 1-by-1 torus because its formerly opposite edges become adjacent.
* Set measurable scale targets: total tiles, visible tiles, concurrent editors, mutation latency, reconnect time, snapshot bytes, database utilization, and recovery objectives.

Exit gate: approved product invariants and threat model with no reliance on `placedBy` as authorization.

### Stage 1: prove the topology domain

Implement a shared pure resolver with floor modulo, canonicalization, nearest-image deltas, wrapped viewport decomposition, visible image enumeration, and canonical subscription deduplication. Add property tests before networking or rendering changes.

Exit gate: all topology acceptance tests pass for negative coordinates, exact seams, multiple laps, both axes, and four-corner views.

### Stage 2: expand persistence and identity

Add quilt, patch, principal, membership, patch operation, patch snapshot, and spatial-reference structures with nullable migration columns first. Provision the Socket.IO PostgreSQL adapter attachment table. Backfill each legacy canvas to a non-toroidal legacy quilt or an unclaimed patch according to the approved migration policy; preserve tile IDs, local positions, and authorship.

Run production migrations as a single deployment job rather than relying on every replica's startup count-and-apply path, which is currently designed around local SQL file count. See `apps/server/src/db/migrate.ts:14-61`.

Exit gate: idempotent backfill parity, constraints validated after backfill, old application revision compatible with expanded schema, and no inferred owners.

### Stage 3: establish patch-scoped correctness

Move normalization, affected-patch derivation, authorization, neighborhood reads, and placement validation inside one database transaction. Acquire advisory locks for affected patch IDs in stable sorted order. Advance affected patch revisions and operation sequences atomically. Persist one tile plus its spatial references.

Replace snapshot retention with a reconstructability invariant: a retained baseline per patch must be no newer than the earliest retained replay event, or the tile table must be declared authoritative state with operations retained only for audit and delivery.

Exit gate: real PostgreSQL concurrency tests prove one winner for conflicting seam placements, no deadlock under reversed multi-patch lock requests, and concurrent distant-patch writes.

### Stage 4: introduce protocol v2 area-of-interest delivery

Add authenticated quilt handshake and capability negotiation. Authorize and cap subscriptions server-side, including chunks per request, rooms per socket, churn rate, snapshot tile count, and snapshot bytes. Content events go only to patch/chunk rooms for v2 clients. Presence uses a deliberately scoped room and volatile/coalesced updates where loss is acceptable.

Keep v1 session snapshots and global events only for v1 clients during rollout. Do not send both streams to v2. Use acknowledged mutation IDs, persisted event IDs, patch cursors, and authoritative snapshot recovery.

Exit gate: reconnect with failed automatic recovery resubscribes and converges; v2 receives no global duplicate events; unauthorized fine and aggregate subscriptions are rejected consistently.

### Stage 5: virtualize client state and rendering

Replace flat `SequencedTilesState` with patch/chunk keyed snapshots, independent cursors, optimistic operation tracking, and explicit eviction. Refactor App orchestration around quilt identity and viewport images. Keep one R3F scene, but render only visible image instances, use a camera-local interaction plane, rebase render coordinates, and map aliases to canonical IDs.

Make the placement solver operate on a resolved 3-by-3 periodic neighborhood. Make grid identity explicitly quilt-global or patch-local according to Stage 0. Add batching or instancing only after measuring the retained visible scene.

Exit gate: bounded retained state and scene-object counts while traversing many patches, no precision drift after many laps, and seam interactions indistinguishable from interior interactions.

### Stage 6: migrate, canary, and contract

Dual-read and compare old/new state during a canary. Rehearse migration with classic, expanded, and vast canvases. Monitor parity, mutation latency, lock waits, snapshot bytes, resyncs, room churn, adapter attachments, pool wait, and client frame time. Retire whole-quilt snapshots, v1 fanout, and legacy columns only after all clients and data are migrated.

The current PostgreSQL deployment is a 1-vCore, 2-GiB burstable server with 32 GiB storage, no HA, and seven-day backups. Load results must inform capacity and recovery changes before broad rollout. See `infra/bicep/modules/postgresql.bicep:38-77`.

Exit gate: migration rollback rehearsed, target service levels met on production-like scale, and v1 retirement approved as a separate breaking-contract release.

## Acceptance Tests

### Topology and observable behavior

* Panning east, west, north, or south through a world seam produces continuous motion and the expected opposite-edge content without a camera jump.
* Negative positions, exact half-open boundaries, and positions many periods away canonicalize deterministically and round-trip through patch-local storage.
* A viewport crossing one seam or both seams produces every expected image, at most one subscription per canonical patch/chunk, and no duplicate canonical tile event.
* The same authoritative tile rendered in multiple seam images selects, removes, highlights, and links as one tile ID.

### Geometry and authorization

* Overlap, grout adjacency, snapping, grid slot identity, picking, cursor display, and selection give the same result at an interior boundary, horizontal seam, vertical seam, and four-corner seam.
* A footprint touching multiple patches is accepted only when the authenticated principal has the required permission on every affected patch; no partial tile is persisted.
* Fine snapshots, aggregates, search, presence, and mutation events enforce the same visibility policy and do not reveal private patch existence or counts beyond the approved policy.
* Owner, editor, viewer, moderator, unclaimed, transferred, suspended, and deleted-principal cases match the approved ACL matrix.

### Concurrency and persistence

* Two real PostgreSQL connections placing overlapping seam tiles concurrently yield exactly one accepted placement after in-transaction validation.
* Distant patch writes proceed concurrently without a quilt-wide advisory lock.
* Multi-patch transactions acquire sorted locks and complete without deadlock when requests list patches in reverse order.
* Idempotent retry returns the original operation result and never duplicates a tile, spatial reference, event, or broadcast.
* Patch reconstruction after every supported retention age matches the authoritative tile table.
* Existing canvas migration preserves tile IDs, local transforms, material, color, authorship, visual layout, and history policy without assigning an accidental owner.

### Realtime, client, and scale

* A seam-straddling client subscribes to the authorized room union, reconnects through a different replica, requests from saved cursors, and converges without a whole-quilt snapshot.
* Server limits reject oversized room sets, invalid canonical IDs, unauthorized patches, excessive churn, and oversized snapshot requests with explicit acknowledgements.
* One accepted mutation produces one v2 durable event per affected canonical stream and no duplicate session-wide event.
* Unsubscribing evicts eligible patch/chunk state and releases render objects while preserving explicit optimistic and undo metadata.
* Traversing a target number of patches keeps retained tile records, scene objects, draw calls, snapshot bytes, and frame time within Stage 0 budgets.
* Repeated laps leave pointer hit testing, grid alignment, shadows, seams, and tile transforms visually stable because GPU-facing coordinates remain near the render origin.

Existing commands provide the baseline client, server, and browser suites: `npm run lint`, `npm run build`, `npm run test`, and `npm run test:e2e:ci`. See `package.json:15-30`. Playwright currently starts an isolated server and client on ports 3101 and 4173, so multi-replica and production-scale tests require additional harnesses. See `playwright.config.ts:3-47`.

## Product Decisions and Blockers

### Critical blockers

1. No authenticated principal or enforceable ownership model exists. Client ID and `placedBy` cannot secure patches.
2. Cross-patch footprint authorization, atomicity, removal, undo, and moderation semantics are undefined. These control schema, locks, and protocol shape.
3. Placement validation occurs before the transaction lock. A toroidal seam implementation must first move correctness into the locked transaction.
4. Whole-session snapshots, global broadcasts, canvas revisions, canvas locks, and non-evicting client state make quilt cost proportional to total content.
5. Legacy packing and topology semantics are undefined. A bounded canvas cannot be reinterpreted as a torus without changing collision and adjacency.
6. Production readiness lacks target workload and recovery objectives. The current small non-HA database tier cannot be assumed adequate.

### Unresolved product decisions

* Quilt count and tenancy: one global quilt, community quilts, or user-created quilts
* Fixed patch rows, columns, dimensions, wrapped axes, and resize policy
* Legacy-canvas placement order and whether legacy canvases remain bounded
* Principal provider, owner type, collaborator roles, claim flow, transfer, suspension, and account-deletion behavior
* Cross-boundary tile policy and atomic authorization rule
* Patch visibility, private aggregate behavior, moderation authority, deletion, and audit retention
* Seam presentation, orientation cues, minimap, search, canonical share links, and lap display
* Quilt-global or patch-local grid pattern, origin, and compatibility with world periods
* Presence and collaborator-roster scope
* Far-zoom repeated-image policy and maximum viewport relative to world period
* Undo and future copy/paste semantics after eviction and across ACL boundaries
* Total-tile, visible-tile, concurrency, latency, durability, recovery, and rendering budgets

### Recommended next research not completed

* [ ] Product and threat-model workshop to close identity, ACL, claim, transfer, visibility, cross-boundary, moderation, and deletion policies
* [ ] Pure resolver prototype with property tests and a seam interaction spike covering placement, hover, selection, undo, pointer presence, and links
* [ ] PostgreSQL prototype proving sorted patch locks, in-transaction validation, seam spatial references, distant-patch concurrency, and measured query plans
* [ ] Two-replica Socket.IO load test covering room limits, attachment payloads, reconnect, cursor replay, slow clients, and privacy enforcement
* [ ] Production-like migration rehearsal to choose packing, measure backfill and constraint time, and prove rolling-version compatibility
* [ ] Client rendering benchmark to set cache, scene-object, draw-call, material, frame-time, and far-zoom aggregate budgets

## References

### Completed Phase 1 reports

* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-client-research.md:1-279`
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-server-research.md:1-394`
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-topology-research.md:1-229`

### Repository evidence

* `apps/server/src/contracts.ts:26-179`
* `apps/server/src/contracts.ts:201-532`
* `apps/server/src/db/schema.ts:21-157`
* `apps/server/src/db/repository.ts:471-518`
* `apps/server/src/db/repository.ts:575-1060`
* `apps/server/src/index.ts:1234-1281`
* `apps/server/src/index.ts:1415-1517`
* `apps/server/src/index.ts:1535-1800`
* `apps/server/src/db/migrate.ts:14-61`
* `apps/server/src/jobs/retention.ts:4-17`
* `apps/client/src/domain/math2d.ts:1-115`
* `apps/client/src/domain/placementSolver.ts:67-261`
* `apps/client/src/domain/gridPatterns.ts:20-221`
* `apps/client/src/interaction/controller.ts:24-153`
* `apps/client/src/App.tsx:519-648`
* `apps/client/src/App.tsx:823-952`
* `apps/client/src/network/useSocketConnection.ts:23-147`
* `apps/client/src/render/MosaicScene.tsx:214-377`
* `apps/client/src/render/MosaicScene.tsx:380-603`
* `infra/bicep/modules/postgresql.bicep:38-77`
* `package.json:15-30`
* `playwright.config.ts:3-47`

### Authoritative external sources

* [GitHub issue 53](https://github.com/dkirby-ms/zzyix/issues/53)
* [ECMAScript multiplicative operators](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-multiplicative-operators)
* [MDN remainder](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder)
* [MDN `Number.MAX_SAFE_INTEGER`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER)
* [Three.js `Object3D`](https://threejs.org/docs/pages/Object3D.html)
* [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
* [PostgreSQL partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
* [Socket.IO rooms](https://socket.io/docs/v4/rooms/)
* [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees)
* [Socket.IO connection-state recovery](https://socket.io/docs/v4/connection-state-recovery/)