---
title: Canvas and Camera Baseline Research
description: Baseline analysis of canvas bounds, camera/input controls, placement constraints, networking contracts, and tests in zzyix.
ms.date: 2026-07-21
ms.topic: reference
---

## Research Scope

* Repository: zzyix
* Date: 2026-07-21
* Research questions:
  * How are scene or canvas size and world coordinate bounds implemented?
  * Where do pan, zoom, drag, and camera control hooks currently exist?
  * What placement and geometry assumptions may fail for larger coordinates?
  * Do network contracts or persistence assume a bounded canvas?
  * What tests currently cover these behaviors?

## Executive Summary

The client and server both use fixed world bounds derived from shared placement logic (`minX=-5.2, maxX=5.2, minY=-3.4, maxY=3.4`) and enforce them through placement validation, not camera clipping. The camera is orthographic with zoom enabled and pan implemented via middle-mouse drag updating `cameraPan`, while right-drag is wired to tile rotation. Rendering contains a horizontal cull filter by X only (`defaultBounds ± 1`), which can hide tiles outside that range but does not clamp Y. Server contracts and lobby metadata expose a fixed canvas size (10.4 x 6.8) derived from these same bounds, and payload validation ensures finite numeric transforms but does not hard-clamp pointer updates.

## Findings by Focus Area

## 1) Client Rendering Architecture

### Scene and world sizing

* Fixed visual board mesh dimensions are hardcoded:
  * `PlaneGeometry(10.5, 7)` for the canvas board.
  * Interaction plane uses `planeGeometry args=[20, 14]`.
  * Evidence: apps/client/src/render/MosaicScene.tsx:260, apps/client/src/render/MosaicScene.tsx:252.
* Camera uses orthographic projection with fixed initial setup:
  * `position: [0, 0, 8]`, `zoom: 58`, `near: 0.1`, `far: 100`, `orthographic`.
  * Evidence: apps/client/src/render/MosaicScene.tsx:374-382.

### Coordinate system and bounds coupling

* Domain bounds are imported from placement solver into render path (`defaultBounds`).
  * Evidence: apps/client/src/render/MosaicScene.tsx:13.
* Render-level culling filters only by X coordinate, not Y:
  * `tile.transform.position.x > defaultBounds.minX - 1 && < defaultBounds.maxX + 1`.
  * Evidence: apps/client/src/render/MosaicScene.tsx:387-389.
* Tile transforms are applied directly in world coordinates for positions and rotation.
  * Evidence: apps/client/src/render/MosaicScene.tsx:97-99, apps/client/src/render/MosaicScene.tsx:111-113, apps/client/src/render/MosaicScene.tsx:166-168.

### Domain-level clamping and correction

* Bounds checks are geometric (polygon extents), not simple point clamp:
  * `isInsideBounds` computes min and max extents and correction vectors.
  * Evidence: apps/client/src/domain/placementSolver.ts:135-152.
* Default bounds are fixed constants:
  * `minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4`.
  * Evidence: apps/client/src/domain/placementSolver.ts:267-271.

## 2) Interaction and Camera Controls

### Existing camera controls

* Orbit controls are enabled in constrained mode:
  * `enableRotate={false}`, `enablePan={false}`, `enableZoom={true}`.
  * `minZoom={40}`, `maxZoom={80}`.
  * Polar angle fixed to top-down.
  * Camera target driven by state: `target=[cameraPan.x, cameraPan.y, 0]`.
  * Evidence: apps/client/src/render/MosaicScene.tsx:342-352.
* Camera pan exists via custom middle-mouse drag on interaction plane:
  * Middle button detects drag deltas and calls `onCameraPan(deltaX, deltaY)`.
  * Evidence: apps/client/src/render/MosaicScene.tsx:196-203, apps/client/src/render/MosaicScene.tsx:220-225.
* App-level pan state and sensitivity:
  * `cameraPan` state, sensitivity factor `0.02`, updates x/y target.
  * Evidence: apps/client/src/App.tsx:103, apps/client/src/App.tsx:676-681.

### Existing tile interaction bindings

* Left-click or pointer up path drives placement.
* Right-drag is wired to rotation (`onRotateDrag`).
* Middle-drag is reserved for camera pan.
* Evidence: apps/client/src/render/MosaicScene.tsx:188-209, apps/client/src/render/MosaicScene.tsx:214-239, apps/client/src/App.tsx:671-673.

### Practical hook points for additional camera controls

* Most direct hook points:
  * `InteractionPlane` pointer handlers for gesture mapping.
  * `MosaicScene` OrbitControls props for zoom/pan constraints and damping.
  * App-level `cameraPan` state for centralized camera policy.
* Evidence: apps/client/src/render/MosaicScene.tsx:178-239, apps/client/src/render/MosaicScene.tsx:342-352, apps/client/src/App.tsx:676-681.

## 3) Placement and Domain Constraints

### Placement validity model

* Placement validation rules:
  * Out-of-bounds rejection by polygon extents and correction vector.
  * Overlap detection using SAT on convex parts.
  * Adjacency rule enforces maximum edge gap (`MAX_GROUT_GAP = 0.22`), preventing floating islands.
* Evidence:
  * Bounds check: apps/client/src/domain/placementSolver.ts:135-152.
  * SAT overlap: apps/client/src/domain/placementSolver.ts:92-133, apps/client/src/domain/placementSolver.ts:175-195.
  * Gap rule: apps/client/src/domain/placementSolver.ts:55, apps/client/src/domain/placementSolver.ts:203-225.

### Guided placement assumptions

* Snapping is currently disabled; pointer position is used directly as base transform.
* Evidence: apps/client/src/domain/placementSolver.ts:246-253 (`Snapping disabled: always use the raw pointer position`).
* `solveGuidedPlacement` returns `magnetStrength = 0` currently.
* Evidence: apps/client/src/domain/placementSolver.ts:254-263.

### Geometry transform assumptions

* Tile geometry is local around a unit scale (`unit = 0.88`) and transformed by mirror + rotation + translation.
* Evidence: apps/client/src/domain/tileGeometry.ts:19, apps/client/src/domain/tileGeometry.ts:86-90.
* Rotation utility allows normalized continuous angles and quarter-turn quantization.
* Evidence: apps/client/src/domain/tileGeometry.ts:105-113.

### Large-coordinate risk notes

* SAT and gap checks are fully geometric and do not include normalization for very large magnitudes.
* Repeated trigonometric rotation at large coordinates may accumulate floating-point noise before comparison.
* Current bounds are intentionally small and fixed, so this is low risk today but relevant if expanding world size.

## 4) Networking and Server Contracts

### Canvas and bounds assumptions in contracts

* Contract commentary explicitly defines canonical bounds and grout tolerance.
* Evidence: apps/server/src/contracts.ts:95-98.
* Session summary exposes `canvasSize`.
* Evidence: apps/server/src/contracts.ts:153.

### Server-computed canvas size

* Server derives `CANVAS_WIDTH` and `CANVAS_HEIGHT` from `defaultBounds`.
* Evidence: apps/server/src/index.ts:68-69.
* Lobby response always emits this fixed size for each session.
* Evidence: apps/server/src/index.ts:74-79.

### Validation and rejection path

* Server validates place payload shape and numeric transform fields before domain validation.
* Evidence: apps/server/src/index.ts:199-252.
* Domain validation runs before persistence and maps reason to closed reject enum.
* Evidence: apps/server/src/index.ts:526-534, apps/server/src/index.ts:343-352.

### Pointer and selection event assumptions

* Pointer updates require finite numeric x and y, then fan out to room peers.
* Evidence: apps/server/src/index.ts:273-284, apps/server/src/index.ts:1022-1035.
* Selection update payload is validated and additionally checked for session and client identity match.
* Evidence: apps/server/src/index.ts:286-309, apps/server/src/index.ts:1039-1060.

### Persistence schema assumptions

* Tile transform components are persisted as scalar columns (`posX`, `posY`, `rotation`, `mirrored`).
* Evidence: apps/server/src/db/repository.ts:580-583.
* Read path remaps persisted scalars back into transform object.
* Evidence: apps/server/src/db/repository.ts:109-111.

## 5) Test Coverage Baseline

### Client-side tests

* Placement solver tests cover overlap rejection, out-of-bounds correction, and guided placement validity.
* Evidence: apps/client/src/domain/placementSolver.test.ts:11-62.
* Controller tests cover ghost stepping, placement rejection/acceptance, sequencing reconciliation, and server tile id constraints.
* Evidence: apps/client/src/interaction/controller.test.ts:29-233.
* App tests cover lobby behavior and collaboration events; includes pointer and selection emission behavior.
* Evidence: apps/client/src/App.test.tsx:75-206, apps/client/src/App.test.tsx:324-348.

### Server-side tests

* Solver parity tests verify overlap and out-of-bounds behavior mirrors client solver intent.
* Evidence: apps/server/src/domain/placementSolver.port.test.ts:6-46.
* Index tests verify fixed canvas metadata and reason mapping.
* Evidence: apps/server/src/index.test.ts:22-40, apps/server/src/index.test.ts:44-52.
* Integration tests include summary mapping with canonical canvas size, payload guards, and selection update fanout/guarding.
* Evidence: apps/server/src/index.integration.test.ts:263-269, apps/server/src/index.integration.test.ts:502-550.

## Gaps and Follow-on Questions

* No dedicated tests for camera pan boundaries or zoom policy relative to world bounds were found.
* No explicit render tests for X-only culling behavior or Y-axis omission were found.
* No stress or property tests for large coordinate magnitudes in SAT or polygon transforms were found.
* No explicit contract tests tying `canvasSize` to dynamic per-session bounds exist because bounds are globally fixed.

## Recommended Next Research

* Verify whether camera pan should be clamped to keep the board in-frame across all zoom levels.
* Evaluate if X-only render filtering should become full 2D frustum or bounds-aware culling.
* Add numeric robustness tests for large coordinate transforms and SAT precision.
* Trace database schema types (`posX`, `posY`, `rotation`) for precision and scale limits.
* Review if collaborative pointers should be world-clamped server-side or left unconstrained by design.

## Clarifying Questions

* Should future canvas/world sizing be session-configurable, or remain globally fixed from `defaultBounds`?
* Should camera controls prioritize free exploration or strict board framing?
* For large-world support, is backward compatibility required for current `canvasSize` contract semantics?
