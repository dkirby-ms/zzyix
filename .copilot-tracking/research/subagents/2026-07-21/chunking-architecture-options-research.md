---
title: Chunking Architecture Options Research
description: Implementation approaches for very large or effectively infinite collaborative 2D canvases in zzyix, including partitioning, streaming, protocol, persistence, migration, and test strategy.
author: GitHub Copilot
ms.date: 2026-07-21
ms.topic: reference
keywords:
  - chunking
  - infinite-canvas
  - collaborative
  - websocket
  - react-three-fiber
  - postgresql
estimated_reading_time: 14
---

## Research Scope

* Repository: zzyix
* Date: 2026-07-21
* Requested questions:
  * Compare architecture alternatives for world partitioning and visibility streaming
  * Analyze camera control implications
  * Propose networking/protocol updates for chunk subscriptions and hydrate
  * Evaluate persistence/indexing implications
  * Recommend chunk-size heuristics and tradeoffs
  * Define migration path from bounded world with backward compatibility
  * Identify risks and test strategy

## Current Baseline in This Repository

The current architecture is bounded and session-centric, not chunk-centric.

* Hard bounds are enforced in solver logic by min/max world rectangle:
  * apps/client/src/domain/placementSolver.ts:267
  * apps/client/src/domain/placementSolver.ts:268
  * apps/client/src/domain/placementSolver.ts:269
  * apps/client/src/domain/placementSolver.ts:270
* Placement validity relies on bounds + SAT overlap + grout-gap adjacency checks:
  * apps/client/src/domain/placementSolver.ts:135
  * apps/client/src/domain/placementSolver.ts:155
  * apps/client/src/domain/placementSolver.ts:217
* Scene uses orthographic camera + pan target state + constrained zoom range:
  * apps/client/src/render/MosaicScene.tsx:380
  * apps/client/src/render/MosaicScene.tsx:352
  * apps/client/src/render/MosaicScene.tsx:347
  * apps/client/src/render/MosaicScene.tsx:348
* Render path already does simple bounds-adjacent tile filtering by X (not chunk/frustum-driven):
  * apps/client/src/render/MosaicScene.tsx:387
* Server protocol is session room based with snapshot and event sequencing, but no spatial subscription primitive:
  * apps/server/src/contracts.ts:325
  * apps/server/src/contracts.ts:327
  * apps/server/src/contracts.ts:339
* Server room transport already uses Socket.IO room joins and room broadcasts:
  * apps/server/src/index.ts:828
  * apps/server/src/index.ts:938
  * apps/server/src/index.ts:1009
* Persistence is per-canvas row set with scalar x/y storage and op log sequencing/versioning:
  * apps/server/src/db/schema.ts:70
  * apps/server/src/db/schema.ts:71
  * apps/server/src/db/schema.ts:98
  * apps/server/src/db/schema.ts:31
  * apps/server/src/db/repository.ts:415

Implication: the system already has robust mutation ordering, idempotency, and snapshot replay, which can be reused as the foundation for chunk-scoped streaming.

## External References Used

* Socket.IO rooms and dynamic join/leave semantics:
  * <https://socket.io/docs/v4/rooms/>
* Socket.IO broadcast delivery caveat for disconnected clients and need for persistence:
  * <https://socket.io/docs/v4/broadcasting-events/>
* Socket.IO server delivery pattern (send full state vs send missing events from last offset):
  * <https://socket.io/docs/v4/tutorial/step-7>
* PostgreSQL index type guidance (B-tree vs GiST/SP-GiST/BRIN):
  * <https://www.postgresql.org/docs/current/indexes-types.html>
* PostgreSQL GiST capabilities for geometric operators and nearest-neighbor classes:
  * <https://www.postgresql.org/docs/current/gist.html>
* PostGIS spatial indexing explanation (bounding-box two-pass model, useful mental model for chunk lookup):
  * <https://postgis.net/workshops/postgis-intro/indexing.html>

## Architecture Alternatives

## Alternative A: Fixed Grid Chunks (Deterministic XY Binning)

World partitioning:

* Divide world coordinates into deterministic integer chunk coordinates:
  * chunkX = floor(posX / chunkWorldSize)
  * chunkY = floor(posY / chunkWorldSize)
* Tile ownership is determined by anchor point (tile transform.position) or by tile AABB overlap policy.
* Visibility set is calculated client-side from camera frustum plus prefetch ring.

Visibility streaming:

* Client computes visible chunk IDs and sends subscribe/unsubscribe diffs.
* Server emits chunk snapshots for newly subscribed chunks and incremental deltas thereafter.

Camera implications:

* Camera pan/zoom still lives in App and MosaicScene, but now drives a "visibleChunks" derivation instead of relying on defaultBounds filtering.
* High zoom-out can explode chunk count; require max subscription budget and coarse LOD fallback.
* Orthographic camera remains valid. No mandatory camera rewrite.

Networking/protocol changes:

* Add events:
  * subscribe_chunks
  * unsubscribe_chunks
  * chunk_snapshot
  * chunk_tile_placed
  * chunk_tile_removed
  * chunk_resync_required
* Reuse existing expectedRevision/opSeq model but scope sequence to chunk or region.
* Late join hydrate:
  * Option 1: request chunk snapshots for all currently visible chunks
  * Option 2: global snapshot with server-side chunk projection (costlier)

Data model implications:

* Add chunk columns to tiles table:
  * chunkX int, chunkY int
* Add index for lookup:
  * composite B-tree on (canvasId, chunkX, chunkY, createdAt)
* Keep operation_log but add chunk metadata for faster replay-by-chunk.

Strengths:

* Lowest conceptual complexity
* Predictable performance and simple debugging
* Good fit with existing scalar x/y schema and room-based socket broadcasting

Weaknesses:

* Hotspot chunks in dense collaboration zones
* Large tiles spanning many chunks require policy decisions

## Alternative B: Quadtree Regions (Adaptive Spatial Partitioning)

World partitioning:

* Replace fixed chunk size with adaptive quadtree cells splitting by density.
* Leaf nodes act as subscription units.

Visibility streaming:

* Client subscribes by region IDs derived from camera footprint traversal.
* Server can merge sparse leaves into parent nodes for coarse snapshots.

Camera implications:

* Better zoom coupling: zoomed-out views subscribe to higher-level regions, zoomed-in to deeper leaves.
* Pan causes fewer subscription changes in sparse areas, more in dense boundaries.

Networking/protocol changes:

* Similar event set to alternative A, but IDs are region paths (for example 0/3/1).
* Delta event payload includes regionId and logical depth.
* Late join hydrate can use hierarchical progressive load: parent first, then children.

Data model implications:

* Need region assignment table or computed mapping function.
* Operation log should include region path at write time to avoid recompute on replay.
* Indexing can remain B-tree for region path strings, or dedicated integer encoding for fast comparisons.

Strengths:

* Better scalability when density is uneven
* Natural LOD behavior aligned with camera zoom

Weaknesses:

* More implementation complexity in server and client
* Harder deterministic testing and migration compared to fixed grid

## Alternative C: Viewport-Window Query Streaming (No Durable Chunk Identity)

World partitioning:

* No explicit chunk subscription object.
* Client sends camera window (minX, maxX, minY, maxY), server streams matching tiles and updates.

Visibility streaming:

* Server evaluates intersection queries per client viewport window.
* Streaming key is viewport token rather than chunk ID.

Camera implications:

* Most direct camera coupling; each pan/zoom can trigger new query windows.
* Requires debounce/hysteresis to avoid request storms during drag.

Networking/protocol changes:

* Add events:
  * set_viewport
  * viewport_snapshot
  * viewport_delta
* Server tracks client viewport and only pushes relevant tile deltas.
* Late join hydrate is straightforward: set viewport then receive snapshot.

Data model implications:

* Requires performant spatial predicates.
* Better with geometric indexing (GiST/SP-GiST style operators) than pure B-tree when table grows large.
* If staying scalar-only, needs at least dual-range B-tree strategy and careful query planner analysis.

Strengths:

* Clean client API
* No chunk bookkeeping in client

Weaknesses:

* Server CPU can become bottleneck at high client counts
* Harder to reuse Socket.IO room semantics for fanout efficiency

## Alternative D: Hybrid Grid + Dynamic Aggregation (Recommended)

World partitioning:

* Use deterministic fixed grid chunks as canonical storage/write unit.
* Add dynamic aggregation layers for read/streaming:
  * fine chunks for near zoom
  * aggregated super-chunks for far zoom

Visibility streaming:

* Client still subscribes by chunk IDs, but server may answer with aggregated payloads based on zoom tier.
* Server sends "representationMode" metadata in snapshots/deltas.

Camera implications:

* Preserves current orthographic control model.
* Enables zoom-aware bandwidth control without fully adaptive quadtree complexity.

Networking/protocol changes:

* Same base protocol as Alternative A plus:
  * set_zoom_tier (optional, or infer from viewport)
  * chunk_snapshot mode=fine|aggregate
* Late join hydrate:
  * fast aggregate hydrate first
  * fine chunk refinement after interaction settles

Data model implications:

* Same chunk columns/indexes as Alternative A.
* Optional materialized summary table per super-chunk for fast far-view hydrate.

Strengths:

* Strong compatibility with existing architecture
* Better scalability than pure fixed grid under zoom-out
* Lower complexity than full quadtree

Weaknesses:

* Requires summary maintenance strategy
* Slightly more protocol surface than fixed-grid-only

## Camera Control Implications by Alternative

Alternative A:

* Keep current pan and orthographic zoom flow in App and MosaicScene.
* Add camera-to-chunk mapping utility and hysteresis ring.
* Add max-subscription cap and freeze updates while middle-drag is active at high velocity.

Alternative B:

* Camera zoom directly changes quadtree depth target.
* Need stable depth snapping logic to prevent flicker at threshold zooms.

Alternative C:

* Camera updates become transport events. Must throttle aggressively.
* Most sensitive to jitter and network latency during pan.

Alternative D:

* Use current controls plus zoom tier mapping:
  * zoom >= Z1 => fine chunks
  * Z0 <= zoom < Z1 => super-chunks
* Best UX/bandwidth balance with minimal control rewrite.

## Networking and Protocol Evolution

Baseline reusable pieces:

* Existing ack semantics with expectedRevision and rejected reasons:
  * apps/server/src/contracts.ts:219
  * apps/server/src/contracts.ts:230
* Existing snapshot + op sequence + revision model:
  * apps/server/src/contracts.ts:272
  * apps/server/src/contracts.ts:275
  * apps/server/src/contracts.ts:276
* Existing request_snapshot repair path:
  * apps/server/src/index.ts:1068

Proposed chunk protocol (versioned additive change):

* New client->server events:
  * subscribe_chunks: { canvasId, chunks: ChunkId[], clientOffsetByChunk?: Record<ChunkId, number> }
  * unsubscribe_chunks: { canvasId, chunks: ChunkId[] }
  * request_chunk_snapshot: { canvasId, chunks: ChunkId[] }
* New server->client events:
  * chunk_snapshot: { canvasId, chunks: ChunkState[], revisionByChunk, opSeqByChunk }
  * chunk_tile_placed
  * chunk_tile_removed
  * chunk_resync_required

Delta sync and late join hydrate:

* Delta sync should follow Socket.IO step-7 guidance: client tracks last processed offset and server can send missing events or full snapshot.
* For chunking, keep per-chunk offset.
* Hydrate sequence:
  * join canvas room
  * subscribe current visible chunks
  * receive chunk_snapshot for each newly subscribed chunk
  * receive live deltas after snapshot watermark

Socket fanout strategy:

* Map each chunk to a Socket.IO room name (for example chunk:canvasId:cx:cy).
* Reuse Socket.IO join/leave room primitives and broadcast-to-room semantics.
* This aligns with official room model and allows efficient targeted emits.

## Persistence and Indexing Implications

Minimum schema evolution for Alternative A or D:

* tiles table:
  * add chunk_x int not null
  * add chunk_y int not null
  * keep pos_x/pos_y/rotation/mirrored unchanged for backward compatibility
* indexes:
  * B-tree (canvas_id, chunk_x, chunk_y, created_at)
  * B-tree (canvas_id, chunk_x, chunk_y, id)
* operation_log:
  * add chunk_x/chunk_y columns (or derived metadata json)
  * optional per-chunk op sequence if global sequence becomes bottleneck

Why B-tree first:

* Current data shape is deterministic integer bins, so B-tree equality/range is efficient and simple.
* PostgreSQL docs confirm B-tree is primary for equality/range and default index behavior.

When to consider GiST/SP-GiST:

* If moving to viewport-window intersection queries (Alternative C), geometric operators and spatial indexing become more important.
* PostgreSQL and GiST docs support geometric operator classes and nearest-neighbor patterns.

Operational notes:

* After bulk backfill migrations, run ANALYZE (and VACUUM ANALYZE where needed) so planner uses new indexes effectively.
* This is consistent with PostGIS indexing guidance on planner statistics and post-load maintenance.

## Chunk Size Heuristics and Tradeoffs

Recommended starting heuristic (for this repository):

* chunkWorldSize = 8.0 world units
* Based on current bounded width 10.4 and height 6.8, this yields about 2 to 4 chunks for the current board and scales naturally outward.

Why 8.0 initially:

* Current tile outlines are around unit scale (tileGeometry uses unit 0.88), so chunk contains many tiles but avoids per-chunk overhead being too high.
* Adjacency/grout checks currently use max gap 0.22; chunk size much larger than gap avoids edge churn on tiny drags.

Heuristic formula:

* Let T = median tile AABB width in world units
* Let V = median visible world width at default zoom
* Choose chunkWorldSize such that:
  * chunkWorldSize ≈ max(6*T, V/3)
  * target 9 to 25 visible chunks in normal zoom

Tradeoffs:

* Smaller chunks:
  * Pros: precise streaming, less overfetch
  * Cons: more subscribe/unsubscribe churn, more room joins, higher metadata overhead
* Larger chunks:
  * Pros: fewer protocol operations
  * Cons: higher overfetch and larger hydrate payloads

Practical guardrails:

* Max subscribed chunks per client: 64 (soft), 128 (hard)
* Prefetch ring: 1 chunk beyond viewport
* Subscription hysteresis: do not churn subscriptions until camera moved > 25% of chunk size or zoom tier boundary crossed

## Migration Path from Bounded World to Chunked World

Goal: additive migration with rollback safety and client backward compatibility.

Phase 0: Prepare contracts and feature flags

* Add schemaVersion 1.1.x events for chunk API while retaining existing session events.
* Server supports both legacy full-session snapshot and chunk snapshot APIs.

Phase 1: Schema additive changes

* Add chunk_x/chunk_y columns and indexes.
* Backfill existing rows using deterministic mapping from pos_x/pos_y.
* Keep old queries intact.

Phase 2: Dual-write on mutations

* On place/remove, persist existing fields and chunk metadata.
* Continue broadcasting legacy tile_placed/tile_removed for old clients.

Phase 3: Client shadow reads

* New client computes visible chunks but still consumes legacy events as source of truth.
* Validate chunk snapshots against legacy session snapshot in telemetry/test mode.

Phase 4: Chunk-first streaming

* Enable subscribe_chunks for canary clients.
* Keep fallback to request_snapshot for resync.

Phase 5: Deprecate bounded assumptions

* Remove defaultBounds-based render filtering in MosaicScene and replace with visible chunk projection.
* Keep placement bounds policy configurable per canvas:
  * bounded mode for old sessions
  * unbounded or large-bounds mode for new sessions

Backward compatibility strategy:

* Legacy client behavior remains functional against upgraded server.
* Server emits legacy events until all active client versions support chunk protocol.
* Persist global revision/opSeq during transition; introduce per-chunk sequence in additive form if needed.

## Risks

Correctness risks:

* Cross-chunk overlap validation could miss collisions if neighbor chunks are not consulted.
* Out-of-order chunk snapshot and delta streams can produce local divergence.

Performance risks:

* High-frequency camera pans can trigger subscription churn storms.
* Dense hotspots can overload single chunk rooms.

Operational risks:

* Multi-replica room membership needs adapter correctness and cross-node consistency.
* Migration backfill may lock or bloat large tables if not batched.

Product risks:

* UX regressions during zoom transitions (pop-in, delayed tiles).
* Presence/cursor signals may be inconsistent if they stay session-scoped while tiles become chunk-scoped.

## Test Strategy

## 1) Unit and property tests

Client:

* chunk id derivation from world coordinates
* visible chunk set from camera pan/zoom and viewport size
* subscription diff generator stability/hysteresis

Server:

* place/remove validation including neighbor chunk overlap checks
* per-chunk resync logic
* idempotent replay with chunk metadata

## 2) Integration tests (extend existing test style)

* add tests near current server integration suite:
  * apps/server/src/index.integration.test.ts
* scenarios:
  * subscribe 9 chunks, place tile, only impacted chunk subscribers receive delta
  * late join chunk hydrate then delta replay from offset
  * stale revision for chunk mutation emits chunk_resync_required

## 3) End-to-end collaboration tests

* Two-client and multi-client flows:
  * pan divergence (clients viewing different regions)
  * overlapping edits near chunk boundaries
  * reconnect after temporary disconnect and full refresh

## 4) Performance tests

* Synthetic load:
  * N clients rapidly panning and placing near boundaries
* KPIs:
  * subscribe/unsubscribe rate
  * median and P95 chunk_snapshot size
  * event lag from mutation to peer render

## 5) Migration safety tests

* Dual-read parity tests:
  * legacy session snapshot tiles == union of chunk snapshots for same area
* Backfill verification:
  * random sample tile rows have correct chunk_x/chunk_y mapping

## Recommendation

Recommend Alternative D (Hybrid Grid + Dynamic Aggregation) implemented in two stages:

Stage 1:

* Implement Alternative A core (fixed deterministic chunks, chunk room subscriptions, chunk snapshots, chunk deltas).
* Keep existing session snapshot path for fallback and compatibility.

Stage 2:

* Add zoom-tier aggregation for far views and bandwidth control.
* Optionally introduce summary/materialized super-chunk tables if needed by metrics.

Why this recommendation for zzyix:

* It reuses current strengths: robust revision/opSeq/idempotency and Socket.IO room model.
* It requires minimal changes to camera control architecture in App and MosaicScene.
* It allows gradual migration from bounded board to effectively infinite world without forced hard cutover.

## Key Conclusion Summary

* The repository is currently bounded by solver constants and bounded-oriented render filtering, so infinite-canvas support requires first-class spatial partitioning, not only camera tweaks.
* The cleanest migration path is additive chunk protocol and schema changes while preserving existing session protocol until client rollout is complete.
* Fixed-grid chunks with optional aggregation provide the best balance of implementation risk, performance, and compatibility for this codebase.
