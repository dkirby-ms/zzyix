---
title: Tile picker current state research
description: Deep codebase research on current tile selection UI, selected shape state flow, geometry source-of-truth, reusable thumbnail/projection utilities, and client test/a11y patterns.
ms.date: 2026-07-26
ms.topic: reference
---

## Research scope

Questions investigated:

* Where current tile shape selection UI is implemented, including props and event handlers.
* How selected shape state flows through App/controller/hooks/state.
* Where geometry primitives and source-of-truth shape definitions live.
* Whether existing SVG/canvas thumbnail or projection utilities are reusable.
* What client test patterns and a11y testing tools are currently used.

## Findings

### 1) Tile shape selection UI implementation

Primary implementation is in apps/client/src/ui/TilePalette.tsx.

Key evidence:

* Props contract defines parent-owned selection state + callbacks: apps/client/src/ui/TilePalette.tsx:6-15.
* Shape options are hardcoded as TileShape[]: apps/client/src/ui/TilePalette.tsx:17.
* Shape selector is a single-select Radix ToggleGroup bound to value={shape}: apps/client/src/ui/TilePalette.tsx:35-45.
* Shape change handler calls onShape(value as TileShape) inside onValueChange: apps/client/src/ui/TilePalette.tsx:39-43.
* Shape items are rendered from shapes.map(...): apps/client/src/ui/TilePalette.tsx:46-50.
* Palette includes always-visible active selection summary: apps/client/src/ui/TilePalette.tsx:121-127.

Relevant excerpt:

```tsx
const shapes: TileShape[] = ['square', 'triangle', 'rectangle', 'l-shape']

<ToggleGroup
  type="single"
  className="shape-grid"
  value={shape}
  onValueChange={(value) => {
    if (value) {
      onShape(value as TileShape)
    }
  }}
  aria-label="Shape"
>
  {shapes.map((entry) => (
    <ToggleGroupItem key={entry} value={entry} aria-label={entry}>
      {entry}
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

UI primitive layer:

* Radix wrapper primitives in apps/client/src/ui/primitives/ToggleGroup.tsx:7-23.
* Tests validate radio semantics for those primitives in apps/client/src/ui/primitives/ToggleGroup.test.tsx:8-21.

Styling constraints relevant to picker layout:

* Two-column shape grid: apps/client/src/App.css:282-286.
* Color swatch grid and touch target sizing: apps/client/src/App.css:337-347.
* Selected-state visuals driven by data-state='on': apps/client/src/App.css:359-364.

### 2) Selected shape state flow through controller/hooks/state

State ownership is App-local and shape is fed into both scene rendering and placement logic.

State origin and composition:

* Shape state initialization in App: apps/client/src/App.tsx:203.
* activeTile memo includes shape/color/material/rotation/mirrored: apps/client/src/App.tsx:262-270.

UI binding:

* TilePalette receives shape and setShape directly: apps/client/src/App.tsx:1100-1103.

Pointer and placement flow:

* Pointer updates compute ghost target using activeTile (thus activeTile.shape): apps/client/src/App.tsx:895-898.
* Placement attempts call tryPlaceTile(activeTile, ghost, ...): apps/client/src/App.tsx:912-914.
* Payload emitted to server uses tempTile.shape/material/color (derived from activeTile): apps/client/src/App.tsx:929-935.

Controller flow details:

* ActiveTile type includes shape: apps/client/src/interaction/controller.ts:39-45.
* updateGhostTarget passes activeTile.shape into solver: apps/client/src/interaction/controller.ts:176-189.
* tryPlaceTile copies activeTile.shape into placed tile: apps/client/src/interaction/controller.ts:241-246.

Relevant excerpt:

```tsx
const [shape, setShape] = useState<TileShape>('square')

const activeTile: ActiveTile = useMemo(
  () => ({
    shape,
    color,
    material,
    rotation,
    mirrored,
  }),
  [shape, color, material, rotation, mirrored],
)

<TilePalette
  shape={shape}
  onShape={setShape}
  ...
/>
```

```ts
export const updateGhostTarget = (
  pointer: Vec2,
  activeTile: ActiveTile,
  settled: TileInstance[],
  bounds: MosaicBounds = defaultBounds,
): GhostState => {
  const solved = solveGuidedPlacement(
    pointer,
    activeTile.shape,
    activeTile.rotation,
    activeTile.mirrored,
    settled,
    bounds,
  )
  ...
}
```

Selection broadcast and remote selection overlays:

* Hover hit-test uses getTileDefinition + transformPolygon + point-in-polygon: apps/client/src/App.tsx:169-179.
* Local emitSelectionUpdate throttles and emits selection_update socket event: apps/client/src/App.tsx:591-637.
* Incoming selection_update events update collaborator state: apps/client/src/App.tsx:516-523.
* remoteSelections are derived and passed into MosaicScene: apps/client/src/App.tsx:540-548 and 1045-1047.

### 3) Geometry definitions and source-of-truth primitives

Single source of truth for tile shape primitives is apps/client/src/domain/tileGeometry.ts.

Source-of-truth artifacts:

* TileShape union: apps/client/src/domain/tileGeometry.ts:4.
* Per-shape outlines for square/rectangle/triangle/l-shape: apps/client/src/domain/tileGeometry.ts:23-50.
* Canonical defs map Record<TileShape, TileDefinition>: apps/client/src/domain/tileGeometry.ts:52-82.
* Accessor function getTileDefinition(shape): apps/client/src/domain/tileGeometry.ts:92.
* Transformation helpers transformPolygon/transformTile: apps/client/src/domain/tileGeometry.ts:94-103.

Relevant excerpt:

```ts
const defs: Record<TileShape, TileDefinition> = {
  square: { outline: squareOutline, convexParts: [squareOutline] },
  rectangle: { outline: rectangleOutline, convexParts: [rectangleOutline] },
  triangle: { outline: triangleOutline, convexParts: [triangleOutline] },
  'l-shape': {
    outline: lOutline,
    convexParts: [
      [ ... ],
      [ ... ],
    ],
  },
}

export const getTileDefinition = (shape: TileShape): TileDefinition => defs[shape]
```

Downstream geometry consumers:

* 3D extrusion path generation in apps/client/src/render/MosaicScene.tsx:92-109.
* Hover selection hit-test in apps/client/src/App.tsx:172-174.
* Collision/validation in placement solver via transformTile + SAT: apps/client/src/domain/placementSolver.ts:174-286.

### 4) Existing SVG/canvas thumbnail or projection utility reuse

No dedicated tile thumbnail generator (SVG or 2D canvas rasterizer) was found in client source.

What exists:

* Existing SVG files under assets are logos only, not tile thumbnails: apps/client/src/assets/react.svg:1 and apps/client/src/assets/vite.svg:1.
* Existing rendering pipeline builds extruded geometry from tile outlines and caches by TileShape, which is reusable for 3D preview rendering: apps/client/src/render/MosaicScene.tsx:92-109.

Projection utilities:

* placementSolver defines a project(polygon, axis) helper used for SAT overlap testing: apps/client/src/domain/placementSolver.ts:96-105 and 119-121.
* This project utility is mathematical projection for collision, not UI thumbnail projection.

Conclusion:

* Reusable base for visual thumbnail generation is getTileDefinition + transformPolygon in apps/client/src/domain/tileGeometry.ts:92-103.
* Reusable renderer path exists in MosaicScene extrusion code (Three.js Shape/ExtrudeGeometry), but there is no standalone thumbnail component/service today.

### 5) Client test patterns and a11y testing tools

Testing stack and setup:

* Test runner: Vitest scripts in apps/client/package.json:11-12.
* Testing Library dependencies in apps/client/package.json:32-34.
* jsdom environment and setup file in apps/client/vite.config.ts:35-38.
* jest-dom matchers imported in apps/client/src/test/setup.ts:1.

Current testing patterns:

* Component tests focus on ARIA role semantics and callback behavior (TilePalette): apps/client/src/ui/TilePalette.test.tsx:24-29 and 73-100.
* Primitive a11y semantics (radios) tested via role queries: apps/client/src/ui/primitives/ToggleGroup.test.tsx:18-21.
* Controller/domain tests are behavior-first and deterministic (state transitions/validation): apps/client/src/interaction/controller.test.tsx:132-190 and apps/client/src/domain/tileGeometry.test.tsx:6-27.

A11y tooling status:

* No axe/jest-axe integration found in apps/client/src/** (codebase search returned no matches).
* A11y verification is currently role/aria-attribute assertions with Testing Library, not automated ruleset scanning.

## Architecture risks and constraints

1. UI options are hardcoded in multiple layers
* Shape list is local constant in TilePalette (apps/client/src/ui/TilePalette.tsx:17).
* Geometry source-of-truth is separate in tileGeometry defs (apps/client/src/domain/tileGeometry.ts:52-82).
* Risk: future shape additions can drift if picker options and geometry defs are not updated together.

2. Shared state is App-level and monolithic
* Tile selection, socket events, collaborator presence, placement, and rendering orchestration all live in App.tsx (apps/client/src/App.tsx:199 onward).
* Risk: adding tile-picker complexity (thumbnails, filtering, keyboard UX variants) will increase coupling and regression surface.

3. Selection updates are pointer-move driven and throttled
* emitSelectionUpdate is called from updatePointer and throttled (apps/client/src/App.tsx:895-899 and 591-637).
* Constraint: any new high-frequency picker/preview interactions should not piggyback on this channel without budget controls.

4. No dedicated thumbnail abstraction exists
* Existing scene extrusion is 3D-focused and tied to R3F scene runtime (apps/client/src/render/MosaicScene.tsx:92-109).
* Risk: reusing full scene stack for small picker thumbnails can be heavier than a simple SVG path approach.

5. A11y test coverage is semantic but not rules-engine based
* No axe integration; current checks are manual assertions on roles/attributes.
* Risk: subtle contrast/focus/order issues may pass current tests.

## Recommended implementation direction

Based on current architecture, the lowest-risk direction is:

1. Treat tileGeometry.ts as the canonical shape registry and derive picker shape options from it.
2. Introduce a small, pure utility to convert TileDefinition.outline into SVG path data for lightweight picker thumbnails.
3. Keep TilePalette presentational, but pass a computed view-model (label + thumbnail path + availability) from App or a dedicated selector module.
4. Avoid routing thumbnail hover/preview events through collaboration selection_update; keep them local.
5. Add focused tests for thumbnail utility output and picker keyboard/ARIA behavior; optionally add jest-axe for automated a11y regression checks.

## Clarifying questions

* Should shape thumbnails in the picker be 2D SVG-first, or should they visually match 3D extruded in-scene tiles?
* Should shape availability be static, or dynamically gated by session/canvas policy?
* Do we want remote collaborator selection to include "hover preview" semantics, or only committed tile under pointer?
* Is introducing axe-based a11y CI checks acceptable in this repo's test baseline?

## Evidence index

* apps/client/src/ui/TilePalette.tsx:6-15
* apps/client/src/ui/TilePalette.tsx:17
* apps/client/src/ui/TilePalette.tsx:35-50
* apps/client/src/ui/TilePalette.tsx:121-127
* apps/client/src/ui/primitives/ToggleGroup.tsx:7-23
* apps/client/src/ui/primitives/ToggleGroup.test.tsx:18-21
* apps/client/src/App.tsx:149-179
* apps/client/src/App.tsx:199-207
* apps/client/src/App.tsx:262-270
* apps/client/src/App.tsx:540-548
* apps/client/src/App.tsx:591-637
* apps/client/src/App.tsx:895-909
* apps/client/src/App.tsx:912-947
* apps/client/src/App.tsx:1029-1032
* apps/client/src/App.tsx:1045-1047
* apps/client/src/App.tsx:1100-1108
* apps/client/src/interaction/controller.ts:39-45
* apps/client/src/interaction/controller.ts:176-203
* apps/client/src/interaction/controller.ts:232-246
* apps/client/src/domain/tileGeometry.ts:4
* apps/client/src/domain/tileGeometry.ts:23-50
* apps/client/src/domain/tileGeometry.ts:52-82
* apps/client/src/domain/tileGeometry.ts:92-103
* apps/client/src/domain/placementSolver.ts:96-105
* apps/client/src/domain/placementSolver.ts:174-286
* apps/client/src/render/MosaicScene.tsx:92-109
* apps/client/src/ui/TilePalette.test.tsx:24-29
* apps/client/src/ui/TilePalette.test.tsx:73-100
* apps/client/src/domain/tileGeometry.test.tsx:6-27
* apps/client/src/interaction/controller.test.tsx:132-190
* apps/client/package.json:11-12
* apps/client/package.json:32-34
* apps/client/vite.config.ts:35-38
* apps/client/src/test/setup.ts:1
