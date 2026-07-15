# Implementation Notes

## Hidden Non-Grid Guidance Model

The app does not expose a grid, but still uses a hidden guidance field to keep placement stable and satisfying.

Approach:
- Generate a jittered, hex-like anchor cloud inside and around bounds (`getHiddenGuidanceAnchors` in `placementSolver.ts`).
- For each pointer update, evaluate nearby anchors plus the raw pointer transform.
- Score candidates by guide distance + validity penalties.
- Prefer valid candidates when available; otherwise return near-valid/invalid with correction vectors.

Why this avoids hard snap feel:
- Guidance is continuous and local, not a visible discrete matrix.
- Ghost transform interpolates toward target, so users feel magnetic pull, not abrupt jumps.
- Near-valid states provide soft directional correction instead of hard rejection.

## Ghost-to-Settle Animation System

Pipeline:
1. Pointer updates set a `target` transform and confidence state.
2. Per-frame `stepGhost` applies exponential smoothing for low-latency interpolation.
3. On valid release, `tryPlaceTile` stores `settleFrom` source pose.
4. `TileMesh` animates from `settleFrom` to final transform using:
   - glide position interpolation (`easeOutCubic`)
   - micro-rotation wobble with damped sine
   - subtle pulse to simulate tactile set-down

Invalid release behavior:
- Controller emits rejection state.
- Ghost applies resistance offset opposite correction vector.
- UI status strip highlights invalid/near-valid confidence.

## Collision and Validation Approach

Validation uses polygon checks and SAT:
- Tile definitions include outline plus convex decomposition (`tileGeometry.ts`).
- L-shape is represented by two convex rectangles.
- Candidate-vs-settled checks run SAT on all convex part pairs.
- Bounds are enforced by transformed polygon min/max extents.

Outputs:
- `valid`: no overlap and in bounds.
- `near-valid`: slight overlap/bounds violation, with correction vector.
- `invalid`: stronger penetration/violation.

## Rendering and Material Pipeline

Rendering architecture is WebGL-first with R3F:
- Extruded shape geometry with bevel for dimensional edges.
- Material presets (ceramic/glass/stone) use `MeshPhysicalMaterial` tuning.
- `onBeforeCompile` shader augmentation adds:
  - fresnel-like rim lift
  - subtle procedural grain noise
- Lighting: warm/cool directional contrast + ambient fill + shadows.
- Ghost tile is translucent, emissive-tinted by confidence state.

## Performance Strategy

- Geometry cache keyed by shape to avoid regeneration.
- Tile settle animation stops after completion (`animationDone` guard).
- Candidate solving narrows hidden anchors to nearest local subset.
- SAT checks run on convex pieces only, reducing expensive general polygon operations.
- Canvas DPR capped for mobile-friendly rendering costs.

## Validation Summary

Executed and passing:
- `npm run build`
- `npm run lint`
- `npm run test`

Test coverage includes:
- transform and rotation quantization
- overlap and bounds validation behavior
- guided placement confidence
- ghost interpolation and release accept/reject flow
