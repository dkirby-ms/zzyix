<!-- markdownlint-disable-file -->
---
title: Canvas scaling and camera controls research
description: Research on expanding canvas size and introducing camera controls, including chunking paths toward effectively infinite canvas behavior
ms.date: 2026-07-21
ms.topic: reference
---

## Task Research: Canvas Scaling and Camera Controls

Research what changes are needed to both increase canvas size and add camera controls to accommodate larger canvases, with a path toward extremely large or effectively infinite canvas via chunking.

## Task Implementation Requests

* Identify current canvas, world bounds, and placement constraints in client/server code
* Identify current camera setup and interaction input pathways
* Recommend architecture and implementation phases for larger canvases and chunking/infinite support
* Include concrete file-level touch points and pitfalls

## Scope and Success Criteria

* Scope: End-to-end product and code-level research for canvas scaling, camera/navigation UX, and chunked world architecture; includes client render/input, domain geometry/solver, and server synchronization contracts
* Assumptions: Current app is a collaborative mosaic editor with tile placement and session synchronization
* Success Criteria:
  * Clear understanding of existing technical constraints with evidence
  * At least two viable alternatives evaluated
  * One selected approach with rationale and phased rollout plan
  * Actionable implementation details with file references and examples

## Outline

1. Baseline architecture and constraints
2. Camera control design for larger and unbounded worlds
3. Chunking alternatives and tradeoffs
4. Selected approach with phased migration
5. Risks, testing, and implementation checklist

## Potential Next Research

* Profile chunk size candidates with representative tile density and camera movement traces
  * Reasoning: Confirms chunk size and subscription hysteresis under real usage
  * Reference: apps/client/src/render/MosaicScene.tsx, apps/server/src/index.ts
* Verify database query plans for chunk lookups at expected scale
  * Reasoning: Determines when to stay on B-tree versus introducing geometric indexing
  * Reference: apps/server/src/db/schema.ts, apps/server/src/db/repository.ts

## Research Executed

### File Analysis

* apps/client/src/domain/placementSolver.ts
  * Fixed world bounds and bounds correction path are currently hardcoded at lines 267-271 and used by placement validation at lines 135-152
* apps/client/src/render/MosaicScene.tsx
  * Orthographic camera and zoom limits at lines 374-382 and 342-352
  * Interaction plane handlers define left-place, right-rotate, middle-pan at lines 188-239
  * X-only tile culling filter at lines 387-389
* apps/client/src/App.tsx
  * Camera pan state and pan sensitivity update path at lines 103 and 676-681
* apps/server/src/contracts.ts
  * Session/canvas metadata and event contracts currently assume bounded-canvas semantics at lines 95-98, 153, 325-339
* apps/server/src/index.ts
  * Fixed canvas dimensions derived from bounds at lines 68-79
  * Validation, broadcast, and snapshot paths that can be extended for chunk streams at lines 199-309, 828-938, 1009-1068
* apps/server/src/db/schema.ts and apps/server/src/db/repository.ts
  * Scalar transform persistence and operation sequencing foundation at schema lines 70-71 and 98, repository lines 109-111, 415, 580-583

### Code Search Results

* defaultBounds
  * Found in client and server placement solvers and render filtering code paths
* cameraPan
  * Found as app-level state and scene target source
* request_snapshot / opSeq / revision
  * Found in server contracts and socket handlers, providing reusable re-sync foundations

### External Research

* Socket.IO rooms and broadcast semantics
  * Source: https://socket.io/docs/v4/rooms/
  * Source: https://socket.io/docs/v4/broadcasting-events/
* Socket.IO server-side delivery and missed event recovery
  * Source: https://socket.io/docs/v4/tutorial/step-7
* PostgreSQL indexing guidance
  * Source: https://www.postgresql.org/docs/current/indexes-types.html
  * Source: https://www.postgresql.org/docs/current/gist.html
* Spatial indexing mental model
  * Source: https://postgis.net/workshops/postgis-intro/indexing.html

### Project Conventions

* Standards referenced: markdown and writing-style instructions for repository markdown files
* Instructions followed: Task Researcher mode constraints and repository markdown conventions

## Key Discoveries

### Project Structure

* Bounds are not merely visual. They are enforced in core placement logic on both client and server via shared constants and polygon-extent checks.
* Camera is already orthographic and zoom-enabled. Pan exists but is custom-wired through middle mouse drag rather than OrbitControls pan.
* The networking model already has a robust session snapshot and ordered op flow, which is a strong basis for chunk-scoped streaming.
* Current render filtering is asymmetric (X-only) and will not scale cleanly to very large worlds.

### Implementation Patterns

* Pattern: validate locally and on server with parity logic.
  * Placement checks exist on both sides for overlap/bounds/gap behavior.
* Pattern: optimistic event handling plus server reconciliation.
  * Existing revision and sequence contracts can be reused for per-chunk sync and re-sync.
* Pattern: room-based fanout.
  * Existing socket room join/emit pattern maps directly to chunk-room fanout.

### Complete Examples

```ts
// Deterministic fixed-grid chunk mapping for world positions.
export type ChunkId = `${number}:${number}`;

export const worldToChunk = (x: number, y: number, chunkSize: number): ChunkId => {
  const cx = Math.floor(x / chunkSize);
  const cy = Math.floor(y / chunkSize);
  return `${cx}:${cy}`;
};

// Subscription hysteresis to prevent churn during small camera movement.
export const shouldRecomputeVisibleChunks = (
  prevX: number,
  prevY: number,
  nextX: number,
  nextY: number,
  chunkSize: number,
): boolean => {
  const dx = Math.abs(nextX - prevX);
  const dy = Math.abs(nextY - prevY);
  return dx > chunkSize * 0.25 || dy > chunkSize * 0.25;
};
```

### API and Schema Documentation

* Chunk protocol can be added additively alongside current session events:
  * subscribe_chunks { canvasId, chunks[], clientOffsetByChunk? }
  * unsubscribe_chunks { canvasId, chunks[] }
  * chunk_snapshot { canvasId, chunks[], revisionByChunk, opSeqByChunk }
  * chunk_tile_placed / chunk_tile_removed
  * chunk_resync_required
* Schema evolution can remain additive:
  * tiles.chunk_x int not null
  * tiles.chunk_y int not null
  * operation_log chunk metadata columns or metadata payload
  * index on (canvas_id, chunk_x, chunk_y, created_at)

### Configuration Examples

```yaml
chunking:
  enabled: true
  worldChunkSize: 8.0
  prefetchRing: 1
  softChunkSubscriptionLimit: 64
  hardChunkSubscriptionLimit: 128
  movementHysteresisRatio: 0.25

camera:
  zoom:
    min: 20
    max: 140
  pan:
    mode: middleMouseDrag
    inertia: false
  zoomTiering:
    - minZoom: 80
      mode: fine
    - minZoom: 45
      mode: aggregate
```

## Technical Scenarios

### Scenario 1: Enlarged Finite Canvas With Camera Pan/Zoom

Use case: Increase today’s finite board size quickly while improving navigation.

Requirements:

* Remove small fixed-size assumptions from render and camera constraints
* Maintain existing placement correctness
* Keep protocol compatible with current clients

Preferred approach:

* Parameterize bounds in placement solver and server session metadata
* Update camera policy to support larger pan range and wider zoom envelope
* Replace X-only filtering with 2D bounds or frustum-derived visibility

Implementation details:

* Client domain:
  * apps/client/src/domain/placementSolver.ts
  * Introduce configurable bounds source per session instead of fixed default constants
* Client render/input:
  * apps/client/src/render/MosaicScene.tsx
  * apps/client/src/App.tsx
  * Add camera pan clamp policy and zoom-tier metadata hooks
* Server contracts/index:
  * apps/server/src/contracts.ts
  * apps/server/src/index.ts
  * Make canvas size a first-class session property, not a global derived constant

Limitations:

* Finite-world scaling alone does not solve very large or infinite canvas memory/network efficiency

#### Considered Alternatives

* Keep current bounded model and only increase constants
  * Rejected: Simple but creates immediate render/network pressure and does not prepare infinite-canvas capabilities.

* Keep camera static and rely on smaller tile size to simulate larger space
  * Rejected: Harms usability and precision while avoiding the real scaling problem.

### Scenario 2: Chunked World for Practically Infinite Canvas

Use case: Support extremely large or effectively infinite collaborative space.

Requirements:

* Stream only visible world regions
* Preserve placement correctness near chunk edges
* Support late join, reconnect, and eventual multi-replica scalability

Preferred approach:

* Hybrid approach: fixed-grid chunking first, then zoom-tier aggregation
* Use Socket.IO rooms per chunk and additive chunk event protocol
* Keep legacy snapshot/events during migration for compatibility and rollback

Implementation details:

* Protocol and server routing:
  * apps/server/src/contracts.ts
  * apps/server/src/index.ts
  * Add chunk subscribe/unsubscribe/snapshot/delta events and room fanout
* Persistence:
  * apps/server/src/db/schema.ts
  * apps/server/src/db/repository.ts
  * Add chunk columns and indexes; dual-write during migration
* Client state and render:
  * apps/client/src/App.tsx
  * apps/client/src/render/MosaicScene.tsx
  * Derive visible chunk set from camera viewport and zoom tier

Chunk heuristics:

* Start with chunkWorldSize 8.0
* Target 9-25 visible chunks at typical zoom
* Prefetch one chunk ring beyond viewport
* Recompute subscriptions after movement > 25% of chunk size or zoom-tier crossing

Limitations:

* Requires careful sequencing and chunk-edge validation to avoid divergence
* Needs telemetry and staged rollout before enabling for all sessions

#### Considered Alternatives

* Pure fixed-grid chunking only
  * Not selected as final: Excellent first phase, but lacks zoom-out bandwidth control for very large navigation.

* Quadtree adaptive partitioning
  * Rejected for now: Better theoretical density adaptation, but significantly higher implementation and test complexity for this codebase.

* Viewport-window streaming without chunk identity
  * Rejected: Simpler client API but pushes heavy per-client spatial query cost to server and underuses room fanout strengths.

## Selected Approach

Selected approach: Hybrid Grid + Dynamic Aggregation, delivered in phases.

Rationale:

* Best leverage of existing architecture:
  * Room-based fanout and snapshot/revision foundations already exist in apps/server/src/index.ts and apps/server/src/contracts.ts.
* Lowest migration risk:
  * Additive schema and protocol changes with dual-path compatibility minimize rollout and rollback risk.
* Strong UX path:
  * Immediate camera improvements for larger finite worlds, followed by chunked streaming and zoom-tier optimization.

Phased plan:

1. Camera and finite-canvas prep
  * Parameterize bounds, widen camera pan/zoom policy, replace asymmetric render filtering.
2. Chunking core
  * Add chunk schema, chunk protocol, room subscriptions, and visible-chunk client derivation.
3. Hybrid optimization
  * Add aggregate/super-chunk payload mode for far zoom tiers.
4. Deprecation
  * Retire legacy bounded assumptions after adoption metrics and compatibility window.

## Risks and Mitigations

* Cross-chunk collision misses near boundaries
  * Mitigation: include neighbor-chunk candidate sets in validation; add boundary-focused property tests.
* Subscription churn during rapid pan/zoom
  * Mitigation: hysteresis and chunk subscription budgets.
* Snapshot/delta ordering divergence
  * Mitigation: per-chunk offset tracking and explicit chunk_resync_required path.
* Migration data correctness
  * Mitigation: backfill verification and dual-read parity checks.

## Test Strategy

* Unit tests
  * world-to-chunk mapping, visible-chunk derivation, subscription diff stability
* Integration tests
  * chunk subscribe/unsubscribe behavior, late join hydrate and delta replay, stale revision recovery
* Performance tests
  * panning churn rate, chunk snapshot payload size, event latency p95 under concurrent editing
* Migration tests
  * legacy snapshot parity with union of chunk snapshots for same viewport

## Actionable Implementation Checklist

* Client
  * apps/client/src/App.tsx: add camera policy state for zoom tiers and viewport metadata
  * apps/client/src/render/MosaicScene.tsx: remove X-only bounds filter and emit camera-derived visibility inputs
  * apps/client/src/domain/placementSolver.ts: make bounds session-configurable with bounded/unbounded modes
* Server
  * apps/server/src/contracts.ts: define chunk protocol payloads and versioning
  * apps/server/src/index.ts: implement chunk room subscribe/unsubscribe, snapshot, and chunk-scoped delta fanout
  * apps/server/src/db/schema.ts: add chunk_x/chunk_y and supporting indexes
  * apps/server/src/db/repository.ts: add chunk-aware query and dual-write/read migration paths
* Rollout
  * Feature flag chunk protocol and run canary sessions before general availability
