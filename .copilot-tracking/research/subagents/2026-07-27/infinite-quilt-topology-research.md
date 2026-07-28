<!-- markdownlint-disable-file -->
# Infinite Quilt Topology Research for GitHub Issue 53

## Status

Complete as of 2026-07-27.

## Research Questions

* What user, canvas, ownership, collaboration, persistence, and realtime semantics does the repository already establish?
* Which invariants are required for a canvas made from stitched, potentially user-owned patches?
* How do a torus, an unbounded sparse plane, an explicit quilt graph, and a large bounded non-wrapping plane compare for this product?
* What authoritative guidance applies to negative-coordinate modulo, spatial partitioning and viewport culling, PostgreSQL indexing and partitioning, and realtime area-of-interest subscriptions?
* Which topology best matches current product semantics and minimizes surprising user behavior?
* Which product decisions remain unresolved around ownership, provisioning, edits, navigation, privacy, moderation, deletion, transfer, and edge behavior?

## Evidence Register

### Repository evidence

* GitHub issue 53, <https://github.com/dkirby-ms/zzyix/issues/53>, asks for an extremely large canvas whose opposite edges wrap. It does not define ownership, patch stitching, permissions, navigation, or seam behavior.
* `README.md:8-20` defines the product as a collaborative mosaic whose users place tiles on one shared canvas in real time, with authoritative validation, synchronization, persistence, and operation history.
* `apps/client/README.md:5-16` describes the client as a collaborative tile editor backed by an authoritative service and PostgreSQL. Its current feature list includes bounds enforcement and constrained camera pan/zoom.
* `apps/client/IMPLEMENTATION_NOTES.md:23-36` says grid guidance is world-origin based, viewport-cullable, local-only, and subordinate to server bounds, overlap, adjacency, revision, and concurrency validation.
* `apps/server/src/contracts.ts:52-65` defines finite default bounds and only two bounds policies: bounded and unbounded. There is no wrapping policy.
* `apps/server/src/contracts.ts:71-88` gives a tile optional `placedBy` attribution and groups tiles into a session. It does not assign an owner, access policy, or patch identity.
* `apps/server/src/contracts.ts:345-352` scopes collaborative selection intent to a canvas and tile. It cannot represent a selection region, a patch, or a selection spanning a topology boundary.
* `apps/server/src/contracts.ts:366-443` defines integer pair chunk IDs, per-chunk cursors, fine and aggregate snapshots, chunk-scoped tile events, and chunk-specific resynchronization.
* `apps/server/src/contracts.ts:508-531` makes the server authoritative, requires client reconciliation, and specifies deterministic first-write-wins conflict resolution.
* `apps/server/src/db/schema.ts:51-63` records participants by canvas and client ID with join/leave timestamps. Participation is presence history, not ownership or membership authorization.
* `apps/server/src/db/schema.ts:66-96` stores world positions plus integer chunk coordinates and indexes `(canvas_id, chunk_x, chunk_y, created_at)` for chunk reads.
* `apps/server/src/db/schema.ts:102-157` stores a canvas-wide ordered operation log and snapshots; canvas deletion cascades to tiles, participants, operations, and snapshots.
* `apps/server/src/db/repository.ts:131-134` maps world coordinates to chunks with `Math.floor(coordinate / chunkSize)`, which gives stable negative chunk IDs without wrapping.
* `apps/server/src/db/repository.ts:471-510` reads only requested chunks and checks parity against the legacy canvas-wide tile state.
* `apps/client/src/App.tsx:823-945` derives chunk subscriptions from the viewport, adds a prefetch ring, and sends subscribe/unsubscribe messages as the viewport changes.
* `apps/client/src/App.tsx:1013-1018,1288-1299,1337` implements undo by finding the latest authoritative tile whose `placedBy` equals the current client ID. This is per-author attribution, not durable ownership.
* `apps/server/src/index.concurrency.test.ts:5-62` verifies stable first-write-wins convergence for conflicting concurrent placements.
* `apps/server/src/index.integration.test.ts:419-447` verifies that `placedBy` survives replay so per-author undo works after reconnect.
* `apps/server/src/index.integration.test.ts:530-580` verifies selection fanout and rejects selection payloads whose canvas or client identity does not match socket membership.
* `apps/server/src/index.integration.test.ts:733-768` models aggregate chunk payloads for far zoom levels, and `apps/server/src/index.integration.test.ts:806-872` verifies requested-chunk parity and boundary assignment at `x = 8`.
* `e2e/multi-user-fixtures.spec.ts:53-184` verifies that multiple clients converge on one exact-once authoritative tile set while preserving author attribution.
* `apps/server/src/db/repository.ts:1060-1104` prunes old operations, snapshots, and expired idempotency keys. It does not define canvas, patch, tile-owner, or user-account deletion policy.

### External evidence

* ECMAScript defines `%` as a remainder operation rather than Euclidean modulo. MDN demonstrates that the result can be negative when the dividend is negative and gives the positive-divisor normalization form `((n % d) + d) % d`. A toroidal address calculation therefore needs an explicit normalization function; raw `%` is insufficient for coordinates left of or below the canonical origin. Sources: [ECMAScript multiplicative operators](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-multiplicative-operators) and [MDN remainder operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder).
* JavaScript integers are exactly distinguishable only through `Number.MAX_SAFE_INTEGER`, and floating-point spacing increases with magnitude. An unbounded or merely enormous global coordinate must not be passed unchanged through interaction and rendering indefinitely. Stable integer cell or chunk addresses plus camera-relative render coordinates avoid making behavior depend on distant floating-point magnitudes. Sources: [MDN `Number.MAX_SAFE_INTEGER`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER) and [MDN `Number.EPSILON`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON).
* Three.js enables object frustum culling by default and provides frustum tests for boxes, spheres, and objects. Global topology does not require global rendering: the client can continue materializing only viewport-intersecting chunks and nearby prefetch data. Sources: [Three.js `Object3D`](https://threejs.org/docs/#api/en/core/Object3D) and [Three.js `Frustum`](https://threejs.org/docs/#api/en/math/Frustum).
* PostgreSQL documents that a multicolumn B-tree is most effective when query constraints apply to its leading columns. The existing canvas-first chunk index matches reads constrained by canvas, chunk x, and chunk y. This should be tested with actual query plans before introducing a different access path. Source: [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html).
* PostgreSQL describes partitioning as a workload-dependent technique for very large tables. Partition pruning relies on predicates compatible with partition bounds, while excessive partition counts increase planning time and memory use. A partition per canvas, patch, or chunk is therefore not a sound default. Partitioning should be considered only after measured table size, retention operations, and query plans justify a low-cardinality partition key. Source: [PostgreSQL table partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html).
* PostgreSQL also offers geometric boxes and built-in GiST operator classes for overlap and containment queries. Those facilities become relevant if patches are arbitrary rectangles or polygons queried by geometric intersection. They add no demonstrated benefit to the current exact integer chunk-pair lookup, so they should not replace the simpler composite B-tree without a new query requirement. Sources: [PostgreSQL geometric types](https://www.postgresql.org/docs/current/datatype-geometric.html) and [PostgreSQL GiST indexes](https://www.postgresql.org/docs/current/gist.html).
* Socket.IO rooms are server-side channels that sockets may join and leave. Broadcasting to multiple rooms uses set-union behavior, so a socket in more than one selected room receives one copy. Sockets leave rooms on disconnect, and multi-server deployments require a compatible adapter. Wrapped viewport halves can therefore map to a union of canonical chunk rooms, but room membership must be reconstructed after an unrecovered connection. Source: [Socket.IO rooms](https://socket.io/docs/v4/rooms/).
* Socket.IO preserves event order when events arrive, but its default arrival guarantee is at most once. The official guidance describes acknowledgements and persisted event offsets for stronger application guarantees. Connection-state recovery can restore rooms and missed packets only when recovery succeeds, and the current documentation lists PostgreSQL-adapter support for that feature as work in progress. The existing authoritative operation log, cursors, idempotency, snapshots, and resynchronization remain the correct correctness boundary. Sources: [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees), [connection-state recovery](https://socket.io/docs/v4/connection-state-recovery/), and [event emission](https://socket.io/docs/v4/emitting-events/).

## Current Product Semantics

The implemented product is one authoritative canvas per session. Users join as participants, publish ephemeral pointer and selection intent, and mutate a shared tile set through server-validated operations. Identity is a client ID. `placedBy` supports attribution and per-author undo, but no schema or contract grants exclusive control over a tile, region, chunk, or patch.

The current canvas supports finite bounded presets and an unbounded policy. Rendering and realtime delivery are already spatially decomposed into square chunks addressed by signed integer pairs. The client subscribes around its viewport, while the server retains a canvas-wide revision and operation sequence. This is a useful implementation foundation for a sparse plane, but it is not yet a patch product model: chunks are transport and storage buckets, not user-visible objects.

The current deletion boundary is the canvas. Foreign-key cascades remove the canvas's participants, tiles, operation log, and snapshots. Retention only prunes historical records and idempotency keys. Patch deletion, account deletion, moderation removal, and ownership transfer have no current semantics.

## Required Product Questions

The following decisions are prerequisites for a patch-based product. They should not be inferred from the implementation's current chunk or attribution fields.

### Patch identity and provisioning

* Is a patch a fixed-size rectangle in one regular lattice, a variable rectangle, or an arbitrary shape?
* Are all patches provisioned when a canvas is created, or allocated only when claimed or edited?
* Is an empty patch public navigable space, reserved space, an unallocated void, or a request-to-claim surface?
* Does a patch have a durable ID independent of its coordinate, allowing transfer or topology changes without breaking references?
* Is there one distinguished origin, and what user-facing address remains stable when a patch is transferred, resized, or restitched?

### Ownership and access

* Who may own a patch: a user, team, canvas, or platform account?
* Does ownership grant edit, invite, moderation, publication, or deletion authority, and can those capabilities be delegated separately?
* Are unowned patches editable by everyone, read-only, claimable, or hidden?
* Is ownership exclusive, shared, leased, or time limited?
* Does a transfer preserve history, attribution, links, moderation records, and existing collaborators?
* What happens to owned patches when an account is suspended or deleted?

### Cross-boundary interaction

* May one tile or other object overlap multiple patches, and which policy wins if their permissions differ?
* Is authorization evaluated at the operation anchor, every occupied cell, or every intersected patch?
* Are drag, fill, paste, undo, and future region operations atomic across boundaries, or may the server accept only authorized fragments?
* How are rectangular selections represented when crossing a torus seam: one wrapped interval or multiple canonical rectangles?
* Can an undo remove an operation after patch ownership or access has changed? Authorship alone does not answer this.

### Navigation and discoverability

* Should users perceive the seam, receive a subtle orientation cue, or experience an intentionally invisible loop?
* Does search navigate by canonical coordinate, patch name, owner, content, or shareable stable ID?
* Is there a minimap, and does it show one canonical period or repeated neighboring copies?
* At far zoom, may a user see private or moderated patch aggregates before access checks complete?
* How does the interface explain that continuing east eventually returns to the same content from the west?

### Privacy, moderation, and lifecycle

* Is visibility canvas-wide, patch-scoped, role-scoped, or object-scoped?
* Must unauthorized patch existence be concealed, or only its contents?
* Who handles reports for an object spanning patches with different owners or moderators?
* Does deleting a patch erase its content, unpublish it, detach it, or return it to an empty claimable state?
* Are deletion and transfer immediately effective for active sockets, cached snapshots, aggregate views, and share links?
* Which audit records survive content, patch, canvas, or account deletion, and for how long?

### Wrap policy

* Must both axes wrap, as issue 53 currently implies, or only one?
* Are canvas width and height immutable after creation? Resizing changes the canonical representative of existing positions unless a migration rule is defined.
* Must objects interact across a seam exactly as they do across an interior boundary, including overlap, adjacency, selection, cursor presence, and undo?
* Is the repeated view near a seam merely a rendering aid, or may users address and link to a repeated copy? The recommendation below treats it only as a view alias.

## Topology Alternatives

| Alternative | Fit with issue 53 | Fit with current system | Ownership and patch model | Main costs and risks |
| --- | --- | --- | --- | --- |
| Finite rectangular torus | Direct. Both axes can wrap while storage remains finite. | Reuses bounded dimensions, integer chunks, viewport AOI, snapshots, and one canvas operation sequence. Requires canonicalization and seam-aware queries. | Regular patches can be a separate lattice over canonical space. Ownership does not need to alter topology. | Every spatial operation must handle wrapped intervals and aliases. Users may be confused without orientation cues. Resizing is semantically disruptive. |
| Unbounded sparse plane | Creates an endless traversal but does not return a user to the opposite edge. | Best implementation fit: signed chunk IDs and `Math.floor` already support negative space, and only populated or visible chunks need materialization. | Patches can be allocated sparsely, though discovery and orphaned distant content need policy. | Does not satisfy literal wrapping. Coordinate magnitude, navigation, moderation coverage, and discoverability become open-ended. Floating-point rendering eventually needs origin rebasing. |
| Explicit quilt graph | Can model stitching, but “opposite edge” has no intrinsic meaning unless encoded as graph edges. | Replaces ordinary integer-neighbor assumptions with patch-local coordinates and explicit adjacency. AOI traversal, cursor movement, selection, and rendering need graph-aware logic. | Strongest model for independently shaped or curated patches and custom neighbor relationships. | Highest conceptual and implementation cost. Cycles, rotations, mismatched edge lengths, disconnected components, and graph edits create behavior unlike a conventional 2D canvas. |
| Large bounded non-wrapping plane | Does not satisfy edge wrapping. It only makes the boundary less likely to be reached. | Smallest immediate change because current presets already implement it. | A regular ownership lattice is straightforward. | Defers rather than resolves edge behavior. “Very large” increases coordinate and navigation problems while providing neither true continuity nor sparse infinity. |

### Decision analysis

The unbounded sparse plane is the strongest fallback when the product goal is “never encounter an edge.” It aligns almost exactly with the existing signed chunk addressing and AOI subscription model. It is not interchangeable with a torus: two users moving indefinitely in one direction do not revisit the same locations, and content has no opposite-edge neighbor.

The explicit graph should be selected only if “stitched patches” means nonuniform, rearrangeable, or curator-defined adjacency. It solves a different product problem than issue 53 and would invalidate many assumptions of a regular 2D grid.

The large bounded plane is useful as an incremental capacity setting but is not a topology solution. The torus is the only alternative that implements the issue's stated observable behavior while preserving a finite, regular world.

## Authoritative Implementation Guidance

### Canonical coordinates and seam decomposition

Choose one canonical half-open rectangle, for example `0 <= x < width` and `0 <= y < height`. Normalize every server-received position before conflict detection, chunk assignment, persistence, authorization, and event publication. For a positive extent, normalization must implement Euclidean modulo rather than use JavaScript remainder directly.

Do not persist duplicated edge copies. One physical tile has one canonical coordinate and one durable identity. The renderer may present translated aliases at `x +/- width` or `y +/- height` near a seam, but interaction against an alias must resolve back to the canonical object before emitting an operation.

A seam-crossing viewport, bounding box, or selection should be decomposed into a small union of canonical axis-aligned rectangles. In two dimensions, a rectangle can split into at most four pieces when both axes wrap. Deduplicate canonical chunk IDs and object IDs after decomposition. This keeps the existing chunk lookup and room model usable without inventing noncanonical rows.

### Spatial partitioning and rendering

Keep chunks as internal storage, snapshot, culling, and realtime AOI units. Introduce a distinct patch entity only if the product adopts patch naming, ownership, access, transfer, or lifecycle. Chunk size can change for operational reasons; patch identity and policy must not change with it.

Continue viewport-local materialization and frustum culling. At seam proximity, derive canonical query rectangles first and then enumerate their chunks. Render aliases should use coordinates relative to the camera or a nearby period so GPU-visible positions remain small even if navigation maintains an accumulated lap count for orientation.

For an unbounded-plane fallback, store exact integer cell/chunk coordinates and rebase render coordinates around the camera. Do not let a nominally unbounded JavaScript `number` become an unlimited exact address space.

### PostgreSQL access paths

Retain the canvas-leading composite B-tree as the baseline for exact chunk-set reads. Verify representative viewport, aggregate, replay, and retention queries with `EXPLAIN (ANALYZE, BUFFERS)` at projected scale. A torus does not itself require PostGIS or GiST because seam decomposition turns a wrapped viewport into ordinary canonical chunk predicates.

Consider a geometric GiST index only if variable patch geometry introduces overlap or containment queries. Consider table partitioning only when measured size or lifecycle operations justify it and a bounded number of partitions can be pruned by normal predicates. Do not create a database partition for each chunk, patch, or user.

### Realtime area of interest and recovery

Use one Socket.IO room per canonical chunk, with a canvas-qualified room key. A client whose viewport crosses a seam joins the deduplicated union of rooms from each canonical rectangle. The server must authorize room membership; knowing a chunk ID must not bypass patch visibility policy.

Room membership is an optimization, not durable truth. On connection or failed recovery, the client recomputes viewport subscriptions and requests authoritative snapshots from its last known per-chunk cursors. Fine tile mutations require acknowledgement, idempotency, revision checks, and resynchronization through the existing operation log and snapshot mechanisms. Replaceable pointer or hover presence may be volatile; tile mutations, ownership changes, moderation actions, and deletion events may not.

The deployment decision record uses the Socket.IO PostgreSQL adapter. Because current Socket.IO documentation does not list connection-state recovery as supported by that adapter, the design must not depend on automatic restoration of rooms or missed packets.

## Recommendation

Adopt a **finite rectangular torus with canonical coordinates and a separate regular patch-policy layer** for issue 53.

This recommendation follows the requirement as written: traversal through either edge reaches the opposite edge. It also preserves the product's most valuable existing structures: finite canvas configuration, integer chunk storage, canvas-scoped authority, viewport subscriptions, snapshots, revision ordering, and deterministic conflict handling. The torus changes how positions and spatial ranges are interpreted, but it does not require replacing those systems.

Treat “quilt patches” as domain entities layered over the torus, not as chunks and not as topology nodes. A patch may own policy and lifecycle metadata while chunks remain operational subdivisions. `placedBy` must continue to mean authorship unless a migration explicitly introduces principals, roles, permissions, patch ownership, and audit semantics.

The recommendation is conditional on wrapping being a non-negotiable user behavior. If product review determines that “infinite” means only that users should never reach a boundary, choose the unbounded sparse plane instead. That is a different requirement and should update issue 53 explicitly rather than silently changing the topology.

Before implementation, run a short product decision checkpoint for patch shape, empty-patch behavior, authorization of cross-patch operations, privacy, deletion, transfer, and seam presentation. These policies affect contracts and data modeling more than the modulo calculation does.

## Proposed Explicit Invariants

### Topology and addressing

1. Every persisted spatial object has exactly one canonical position in a half-open rectangle of fixed positive width and height.
2. Server normalization is authoritative and uses Euclidean modulo on both wrapped axes before validation or persistence.
3. Canvas dimensions are immutable after first content unless a versioned migration rewrites all affected spatial addresses, chunks, snapshots, links, and operation history.
4. A render copy outside the canonical rectangle is an alias only. It has no independent ID, owner, history, conflict state, or database row.
5. Shareable spatial links resolve to a canvas ID plus canonical address or durable object/patch ID, never to a render alias or accumulated lap count.

### Spatial behavior

6. Adjacency, overlap, snapping, collision, placement validation, and selection behave identically at a seam and at an interior boundary.
7. A wrapped range is represented as a union of canonical ranges, and all resulting chunk and object IDs are deduplicated before query, subscription, mutation, or rendering.
8. A single logical operation has one operation ID and one atomic authorization outcome even when its geometry decomposes across multiple canonical ranges.
9. Viewport rendering and aggregate data are limited to visible or prefetched canonical chunks; no feature requires loading the whole torus.
10. Camera and GPU-facing coordinates remain local to the current view period so precision does not degrade as a user completes laps.

### Collaboration and delivery

11. The server remains authoritative for normalized positions, permissions, revisions, conflict outcomes, and operation ordering.
12. Canonical chunk rooms are an area-of-interest delivery optimization. Missing, stale, or lost membership is repaired from authoritative snapshots and cursors.
13. Reconnect always has a full resubscribe and resynchronize path that does not assume Socket.IO recovered prior rooms or packets.
14. Durable mutations and policy changes are idempotent, acknowledged, ordered, and replayable. Only replaceable presence signals may use lossy delivery.
15. The same canonical object is emitted at most once to a client even when a wrapped viewport reaches it through multiple ranges or room memberships.

### Ownership, privacy, and lifecycle

16. Chunk membership, content authorship, and patch ownership are separate concepts with separate fields and authorization rules.
17. `placedBy` alone never grants current edit, undo, moderation, deletion, or transfer authority.
18. Every operation touching more than one patch is authorized against every affected patch under one documented atomic policy.
19. Fine and aggregate snapshots enforce the same visibility policy; aggregation cannot reveal private or moderated content.
20. Ownership transfer, patch deletion, account deletion, and moderation changes produce durable audited operations and invalidate active subscriptions or cached views as required by policy.
21. Canvas deletion remains a well-defined terminal boundary, while patch removal and transfer have explicit behavior for content, history, links, and audit retention.

## Unresolved Questions

* Does product intent require literal wrapping on both axes, or would an unbounded sparse plane satisfy the desired experience?
* Are patches user-visible fixed rectangles, or is “patch” only a metaphor for chunks of content?
* What rights does ownership confer, and how are collaborators, moderators, and platform administrators represented?
* What happens to an operation whose footprint crosses patches with different permissions?
* Should the seam be invisible, indicated, or configurable, and how should a minimap represent it?
* Are empty, private, deleted, suspended, and unallocated patches visually distinguishable without leaking protected information?
* Is canvas topology and size immutable, and what is the migration story for existing bounded canvases?
* Which historical and audit records must survive content, patch, canvas, owner-account, or author-account deletion?

## Recommended Next Research

* Run product interviews or a decision workshop focused on the unresolved ownership, seam, privacy, and lifecycle questions; record the resulting policy separately from the technical topology decision.
* Prototype one seam-crossing interaction slice covering pan, placement, overlap, selection, undo, collaborator cursor, and share-link resolution. Test with content occupying all four corners so both axes wrap simultaneously.
* Generate projected-scale tile data and compare actual PostgreSQL plans for ordinary, one-axis-wrapped, and two-axis-wrapped viewport reads using the existing composite index.
* Load-test chunk-room churn while panning across seams and reconnecting through the deployed multi-replica adapter. Verify deduplication, cursor replay, failed-recovery resubscription, and privacy enforcement.
* Define a migration decision for current canvases: retain bounded topology, opt into torus per canvas, or create new toroidal canvases only. Do not reinterpret existing opposite edges without explicit user consent.
