---
title: Client Patch Pipeline Research
description: Research findings for quilt/patch representation, transforms, rendering, constraints, and extension points in the client codebase.
author: GitHub Copilot (Researcher Subagent)
ms.date: 2026-08-06
ms.topic: reference
keywords:
  - quilt
  - patch
  - render
  - coordinate-transform
  - client
estimated_reading_time: 12
---

## Research Scope

* Identify exact file paths and line numbers for key types/functions relevant to patch cells, color/state, coordinate transforms, and render output
* Identify current constraints: grid shape, patch size, color representation, update protocol, deterministic behavior
* Identify extension points where an import mosaic to patch feature can hook in with minimal disruption
* Note performance-sensitive rendering paths and test coverage gaps

## Research Questions

1. How is patch/quilt data represented in client domain and network layers?
2. Where are coordinate transforms and render-time projections implemented?
3. How is color/state represented and validated through UI and network boundaries?
4. Which tests currently exercise patch behavior and determinism?
5. Where can import flow be added with minimal architectural disruption?

## Findings

### 1) Patch and tile data model in client pipeline

* The canonical tile entity in client state is TileInstance with shape, color, material, transform, timestamps, and optional owner metadata:
  * apps/client/src/domain/placementSolver.ts:26-34
* Transform2D is the shared geometric carrier for placement, rendering, and collision checks:
  * apps/client/src/domain/tileGeometry.ts:27-31
* Tile shapes are constrained to a fixed union of 8 values:
  * apps/client/src/domain/tileGeometry.ts:4-12
* Patch-scoped client cache is explicit in QuiltCacheState with:
  * patches keyed by patchId
  * tiles keyed by tileId
  * optimistic mutation records
  * undo metadata and pin reasons
  * apps/client/src/domain/quiltCache.ts:15-33
* Patch snapshots and events are merged through dedicated cache reducers:
  * mergeQuiltPatchSnapshot: apps/client/src/domain/quiltCache.ts:127-175
  * applyQuiltPatchPlacement: apps/client/src/domain/quiltCache.ts:177-208
  * applyQuiltPatchRemoval: apps/client/src/domain/quiltCache.ts:210-248

### 2) Coordinate and topology transforms

* Local tile geometry transform stack:
  * mirror -> rotate -> translate in transformPoint
  * apps/client/src/domain/tileGeometry.ts:147-153
* World->lattice projection and lattice->slot transforms drive guide/grid placement:
  * worldToLattice: apps/client/src/domain/gridPatterns.ts:208-220
  * createGridPatternSlot: apps/client/src/domain/gridPatterns.ts:257-279
  * resolveGridPlacement: apps/client/src/domain/gridPlacement.ts:60-93
* Toroidal/canonical transforms are applied in interaction and rendering:
  * resolveCanonicalInteractionPoint: apps/client/src/interaction/controller.ts:19-25
  * resolveDisplayHitPoint/canonicalizeDisplayPoint: apps/client/src/render/periodicImages.ts:33-41
  * nearestPeriodicPoint (camera-relative image selection): apps/client/src/render/periodicImages.ts:43-54
* Viewport to chunk topology mapping supports unbounded, bounded, and toroidal modes:
  * apps/client/src/domain/math2d.ts:18-22, 84-145

### 3) Render output path

* Rendering entrypoint receives authoritative visibleTiles from App and draws through MosaicScene:
  * apps/client/src/App.tsx:426-429, 1490-1532
  * apps/client/src/render/MosaicScene.tsx:603-748
* MosaicScene enumerates visible periodic aliases from camera viewport before drawing:
  * tileImages useMemo: apps/client/src/render/MosaicScene.tsx:477-481
  * enumerateVisibleTileImages: apps/client/src/render/periodicImages.ts:56-87
* Tile mesh geometry is cached by shape in a module-level map to avoid repeated ExtrudeGeometry construction:
  * apps/client/src/render/MosaicScene.tsx:28, 115-132
* Grid overlay computes slot classification (structural/placeable/blocked/active) using live validatePlacement calls:
  * apps/client/src/render/gridOverlayGeometry.ts:30-48, 70-96

### 4) Mutation/update protocol path (client)

* Socket protocol v2 gating and event subscriptions:
  * apps/client/src/network/useSocketConnection.ts:194-222
* App wires patch state/event/resync handlers into cache reducers:
  * onQuiltPatchState: apps/client/src/App.tsx:672-684
  * onQuiltPatchEvent: apps/client/src/App.tsx:686-708
  * onQuiltPatchResyncRequired: apps/client/src/App.tsx:710-713
* Outbound place/remove mutations require expectedPatchRevisions and reconcile on ack:
  * place flow: apps/client/src/App.tsx:1069-1140
  * remove flow: apps/client/src/App.tsx:939-969
* Affected patch discovery for multi-patch geometry is already implemented:
  * findAffectedCachedPatchIds: apps/client/src/App.tsx:284-308
  * expectedPatchRevisions: apps/client/src/App.tsx:310-314

### 5) Color/state representation

* Tile color is represented as string end-to-end in TileInstance and ActiveTile:
  * apps/client/src/domain/placementSolver.ts:29
  * apps/client/src/interaction/controller.ts:63
* Palette presets are fixed hex swatch sets; collaborator color is deterministic hash(clientId)->swatch:
  * apps/client/src/ui/palettes.ts:1-30
* TilePalette accepts hex/rgb/css-valid input, normalizes rgb(...) to hex where possible, then emits onColor:
  * apps/client/src/ui/TilePalette.tsx:47-80, 104-124, 281-287

## Constraints Summary

### Grid shape and placement constraints

* Supported shape set is fixed to 8 tile shapes unless TileShape union and definitions are extended:
  * apps/client/src/domain/tileGeometry.ts:4-25
* Grid snapping is pattern-driven with finite predefined pattern families:
  * apps/client/src/domain/gridPatterns.ts:5-171
* Placement validity enforces bounds and SAT overlap checks:
  * apps/client/src/domain/placementSolver.ts:176-239
* Guide mode chooses nearest valid slot with deterministic tie-breaker by distance then slot id:
  * apps/client/src/domain/gridPlacement.ts:36-58

### Patch size and topology constraints

* Patch dimensions are runtime handshake values (patchRows, patchColumns, patchWidth, patchHeight), not compile-time constants:
  * apps/client/src/network/canonicalWorld.test.ts:9-12
  * apps/client/src/App.tsx:652-657
* World bounds in v2 mode are derived from topology extents:
  * apps/client/src/App.tsx:652-657
* Mutation controls are disabled client-side when mutationEnabled is false:
  * apps/client/src/App.tsx:405, 1086, 1291

### Color constraints

* Internal model remains free-form string color, but UI path mostly emits normalized hex or browser-normalized CSS color strings:
  * apps/client/src/ui/TilePalette.tsx:60-80, 104-124
* Material variants are limited to ceramic/glass/stone and shader/material profiles depend on this union:
  * apps/client/src/domain/tileGeometry.ts:13
  * apps/client/src/render/materials.ts:6-10

### Update protocol and deterministic behavior constraints

* Place/remove requests require expectedPatchRevisions and server ack reconciliation to advance client cursors safely:
  * apps/client/src/App.tsx:947-969, 1095-1136
* Client treats stale or duplicate events as no-ops based on revision/opSeq monotonic checks:
  * apps/client/src/domain/quiltCache.ts:139, 185, 218, 301-309
* Sequenced controller path marks op gaps for snapshot recovery:
  * apps/client/src/interaction/controller.ts:148-153, 171-176
* Deterministic tests assert seam/canonical stability and exact convergence:
  * apps/client/src/render/periodicImages.test.ts:11-24
  * e2e/multi-user-fixtures.spec.ts:25-39

## Extension Points

### Minimal-disruption hook points for import mosaic to patch

1. UI trigger and file intake
* Add an import entry in existing control surfaces:
  * TilePalette side panel is already user-facing for tile config inputs
  * apps/client/src/ui/TilePalette.tsx:84-315
* Alternative: add action in AppHeader if import is global-session action
  * apps/client/src/ui/AppHeader.tsx (not analyzed deeply in this pass)

2. Client-side normalization and validation module
* New domain module can map imported mosaic records -> TileInstance-like draft payloads using existing shape/transform definitions:
  * tile definitions/transforms: apps/client/src/domain/tileGeometry.ts:92-164
  * optional grid snapping path: apps/client/src/domain/gridPlacement.ts:60-93

3. Reuse existing mutation pipeline in App
* Reuse findAffectedCachedPatchIds and expectedPatchRevisions before each emitted placement:
  * apps/client/src/App.tsx:284-314
* Reuse setQuiltOptimisticTile/clearQuiltOptimisticTile and applyQuiltPatchPlacement reducers for optimistic + ack updates:
  * apps/client/src/App.tsx:1116-1136
  * apps/client/src/domain/quiltCache.ts:275-293

4. Optional import execution mode
* Sequential mode (safest): emit one quilt_place_tile, await ack, update revisions, continue
* Windowed mode (faster): bounded in-flight queue, still revision-aware and retry on STALE_REVISION

5. Progress and rollback
* Hook into existing metrics/telemetry state and invalid pulse feedback:
  * apps/client/src/App.tsx:534-538, 807-814

## Performance Notes

* Render path hotspots:
  * Periodic image expansion per camera update can multiply visible instances near seams:
    * apps/client/src/render/MosaicScene.tsx:477-481
    * apps/client/src/render/periodicImages.ts:56-87
  * Grid overlay recalculates slot validity and SAT placement checks per visible slot when enabled:
    * apps/client/src/render/gridOverlayGeometry.ts:70-96
    * apps/client/src/domain/placementSolver.ts:176-239
* Existing mitigations:
  * Geometry cache for extruded tile meshes by shape:
    * apps/client/src/render/MosaicScene.tsx:28, 115-132
  * Chunk subscription budgets and viewport hysteresis to reduce subscription churn:
    * apps/client/src/App.tsx:97-100, 816-867
  * Minimap sampling cap of 6,000 tiles:
    * apps/client/src/ui/MinimapOverlay.tsx:117-130
  * Cache eviction budget limits retained patch state:
    * apps/client/src/App.tsx:102, 764
* Observability hooks already present for scene object count, draw calls, frame time, and retained cache metrics:
  * apps/client/src/render/MosaicScene.tsx:483-488
  * apps/client/src/App.tsx:1203-1212

## Test Coverage Gaps

* No client unit/e2e coverage found for a bulk import workflow (parse, normalize, validate, emit, progress, partial failure rollback)
* No explicit tests for color normalization edge cases during import (named CSS colors, rgba alpha truncation behavior, invalid mixed formats)
* No explicit coverage for very large batch placement backpressure behavior from the client side (queue sizing, pacing, cancellation)
* No explicit tests for importer conflict handling across multi-patch footprints when expectedPatchRevisions change mid-run
* No explicit snapshot/golden render assertions for large imported mosaics (visual and performance regression checks under high tile counts)

## Recommended Client-only Integration Flow

### Flow overview

1. Add Import Mosaic action in TilePalette
* Accept JSON/CSV payload (shape, color, material, position, rotation, mirrored)

2. Parse and normalize in new domain utility
* Validate shape against TileShape
* Normalize rotation using normalizeAngle or quantizeRotation policy
* Normalize color through existing TilePalette color normalization helper behavior

3. Preflight per tile against current topology and ownership constraints
* Use derivePlacementBounds and findAffectedCachedPatchIds
* Skip or flag items that map to unknown/unloaded patch scope

4. Emit placements through existing quilt_place_tile path
* For each candidate:
  * compute expectedPatchRevisions from current cache
  * set optimistic tile via setQuiltOptimisticTile
  * emit quilt_place_tile
  * on accepted ack, applyQuiltPatchPlacement + reconcileQuiltMutationRevisions
  * on rejected STALE_REVISION, trigger resubscribe and retry with refreshed revisions

5. Surface progress and outcomes
* Show imported/accepted/rejected counts and first N error reasons
* Keep final state convergence checks similar to expectAcceptedTilesExactlyOnceAcrossUsers identity behavior

### Why this is minimal-disruption

* It reuses established placement reducers, revision semantics, optimistic handling, and socket events
* It avoids introducing a separate mutation protocol
* It stays entirely client-side and does not require server contract changes for a first version

## Evidence Log

* Tile instance and transform model: apps/client/src/domain/placementSolver.ts:26-34
* Placement validation and guided solve: apps/client/src/domain/placementSolver.ts:176-263
* Tile geometry shape catalog and transform primitives: apps/client/src/domain/tileGeometry.ts:4-25, 147-174
* Grid pattern basis/slot generation and lattice transforms: apps/client/src/domain/gridPatterns.ts:83-171, 208-297
* Deterministic grid candidate ordering: apps/client/src/domain/gridPlacement.ts:36-58
* Quilt patch cache model and reducers: apps/client/src/domain/quiltCache.ts:15-33, 127-248, 295-313, 350-374
* Chunk/topology mapping and budget helpers: apps/client/src/domain/math2d.ts:18-22, 84-145, 147-171
* Interaction canonical point and mutation reconciliation helpers: apps/client/src/interaction/controller.ts:19-30, 109-189, 204-309
* Runtime chunk and patch budgets/constants: apps/client/src/App.tsx:95-106
* Affected patch resolution and revision expectations: apps/client/src/App.tsx:284-314
* Patch state/event/resync handlers: apps/client/src/App.tsx:672-713
* Subscription computation and subscribe_quilt_area emission: apps/client/src/App.tsx:816-910
* place/remove mutation emit and ack handling: apps/client/src/App.tsx:939-969, 1069-1140
* Render periodic image enumeration and camera viewport projection: apps/client/src/render/periodicImages.ts:18-90
* Scene periodic tile image useMemo and scene metrics collection: apps/client/src/render/MosaicScene.tsx:477-488
* Grid overlay slot classification and segment assembly: apps/client/src/render/gridOverlayGeometry.ts:30-96
* Material variant constraints and shader injection: apps/client/src/render/materials.ts:6-44
* Palette swatches and deterministic collaborator color mapping: apps/client/src/ui/palettes.ts:1-30
* TilePalette color validation/normalization and color picker integration: apps/client/src/ui/TilePalette.tsx:47-80, 104-124, 281-287
* Minimap sampling cap and viewport sanitization in toroidal mode: apps/client/src/ui/MinimapOverlay.tsx:61-86, 117-130, 155-203
* Unit tests for deterministic slot snapping and seam-aware placement: apps/client/src/domain/gridPlacement.test.ts:12-123
* Unit tests for cache revision monotonicity and dedupe behavior: apps/client/src/domain/quiltCache.test.ts:35-232
* Unit tests for canonical periodic image identity and repeated-lap stability: apps/client/src/render/periodicImages.test.ts:11-24
* Unit tests for sequenced op gap detection and optimistic ack reconciliation: apps/client/src/interaction/controller.test.ts:194-430
* E2E tests for stable patch assignment, stale revision resync, and full-stack shape persistence: e2e/multi-user-fixtures.spec.ts:59-333
* E2E seam and traversal budgets: e2e/quilt-seams.spec.ts:17-179
* E2E reconnect, stale revision rejection, and chunk budget enforcement: e2e/quilt-reconnect.spec.ts:106-295
* E2E first-signin stable patch assignment UX: e2e/authentication.spec.ts:55-84

## Unresolved Questions

1. Import format contract: should imported mosaic be absolute world coordinates, patch-local coordinates, or image/pixel mapped coordinates?
2. Rotation policy: should importer quantize to quarter turns by default or preserve arbitrary radians when provided?
3. Color policy: should non-hex CSS colors be preserved, normalized to hex, or rejected for deterministic parity across clients?
4. Throughput target: desired maximum tiles per import batch for UX and connection safety before adding queue controls?
5. Conflict policy: when a tile overlaps existing content, should importer skip, attempt nearest guide slot, or fail-fast per batch?
