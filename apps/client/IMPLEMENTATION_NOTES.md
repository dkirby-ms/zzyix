# Implementation Notes

## Tile Palette Semantics and Accessibility

Tile selection controls are implemented in `TilePalette` with one interaction contract across all rows:

* Shape, material, palette, and color rows are single-select radio groups.
* Selected state remains visually and semantically explicit (`aria-checked` + selected styling).
* Color swatches preserve the shared 44px minimum target size through `--touch-target-min`.

The active selection summary stays visible in the palette panel and mirrors App-owned state. This keeps the current shape, material, palette, and color discoverable at all times without requiring hover or focus.

## Palette Switch Preserve-or-Fallback Policy

When the user changes palettes, the client applies deterministic color resolution:

* Preserve the current color when the target palette contains it.
* Otherwise select the first swatch from the target palette as fallback.

Live announcements are intentionally limited to automatic fallback events. The summary itself is visual-only, while fallback messaging is emitted through a polite status region so assistive technology receives only meaningful state changes.

## Optional Grid Pattern Guidance

Raw-pointer placement remains the default. When the local grid overlay is enabled, the controller routes ghost resolution through a strict pattern guide:

- `gridPatterns.ts` defines repeating world-origin templates for square lattice, running bond, and triangle tessellation.
- Compatible shapes are derived from template slots, and patterns are offered only when the current canonical tile library can construct them.
- `gridPlacement.ts` evaluates nearby exact slots with the existing `validatePlacement` function. A valid slot wins over blocked candidates; enabled guidance never falls back to the raw pointer.
- Pattern slots own guided position, rotation, and mirroring. Active color and material remain unchanged, and disabling the guide restores active-tile orientation behavior.
- App state retains visibility and pattern choice only for the current client session. Toggling or switching patterns never rewrites settled tiles.

`GridOverlay.tsx` generates slots only for the current orthographic viewport plus one-cell overscan. Canonical tile outlines are transformed and batched into structural, placeable, blocked, and active line geometry. The overlay has no pointer handlers and is composed behind settled tiles and the ghost.

The server remains authoritative and unchanged: the client sends the ordinary final `Transform2D`, and server overlap, bounds, adjacency, revision, and concurrency validation still determine whether placement is accepted.

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
- Pattern candidate solving is limited to the nearest lattice cell and its immediate neighbors.
- Overlay geometry is viewport-cullable and batched by visual state instead of per-slot React objects.
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
- raw-pointer and exact pattern-slot placement
- pattern constructibility, viewport culling, and deterministic slot selection
- accessible grid controls and hidden-pattern retention
- ghost interpolation and release accept/reject flow
