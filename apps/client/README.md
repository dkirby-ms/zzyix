---
title: Tileworld Client
description: Client prototype for a collaborative tile-placement editor and the starting point for a realtime multi-user architecture.
---

## Tileworld Client

A polished tile-placement mosaic editor built with React + TypeScript + Three.js via React Three Fiber.

This client prototype is the starting point for the full collaborative system architecture:

1. React frontend for UI/canvas interaction
2. Realtime transport (WebSocket or Supabase Realtime) for live collaboration
3. Backend authoritative service for validation and conflict handling
4. Postgres for persistent canvas, tiles, and operation history

Placement uses the raw pointer by default. An optional local grid overlay can instead provide strict, exact pattern-slot guidance without changing settled tiles or shared canvas state.

## Features

- Tile shapes: square, triangle, rectangle, L-shape
- Material variants: ceramic, glass, stone-inspired
- Color palettes with quick swatch selection
- Dedicated Tile Palette with radio-style single-select rows for shape, material, palette, and color
- Always-visible active selection summary to confirm current shape/material/palette/color
- 90-degree rotation controls (+ keyboard), mirror toggle
- Optional square lattice, running bond, and triangle tessellation overlays
- Strict pattern-slot placement with compatible-shape guidance
- Polygon-based validation with SAT overlap checks and bounds enforcement
- Confidence states: valid, near-valid, invalid
- Invalid placement feedback via resistance/repulsion + visual state strip
- Undo last placement and clear composition
- Pan/zoom camera constraints for editing usability
- Responsive layout for desktop and mobile

## Tech Stack

- React 19 + TypeScript
- Vite
- Three.js + @react-three/fiber + @react-three/drei
- Zustand installed for scaling state architecture
- Vitest + Testing Library

## Architecture Direction

This folder contains the client-side prototype experience.

Near-term evolution path:

1. Keep this React client as the interaction and rendering layer.
2. Add realtime collaboration messaging (WebSocket or Supabase Realtime).
3. Add an authoritative backend service to accept/reject operations and resolve conflicts.
4. Persist shared canvases, tiles, and append-only operation history in Postgres.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm run test
```

## Controls

- Pointer move/drag: move ghost tile
- Pointer release: attempt placement
- Rotate +90: UI button or `R`
- Rotate -90: UI button or `Shift+R`
- Mirror: UI button or `F`
- Undo: UI button or `Z`
- Clear: UI button
- Camera pan/zoom: mouse/touch gestures (rotation disabled)
- Grid overlay: toggle the canvas-local control, then choose a constructible pattern

Accessibility notes:

- Tile Palette rows use radio-group semantics so selected state is announced consistently.
- Grid pattern choices use the same keyboard-operable single-select semantics and name every compatible shape in text.
- Color swatches keep a 44px minimum touch target via design tokens.
- Palette switches preserve the selected color when available; when unavailable, the fallback is deterministic and announced via a polite status region.
- Grid visibility and pattern choice are local editing preferences. Hiding the overlay retains the selected pattern and never changes placed tiles.

## Project Structure

- `src/domain/math2d.ts`: vector/math/easing utilities
- `src/domain/tileGeometry.ts`: shape definitions, convex decomposition, transforms
- `src/domain/placementSolver.ts`: SAT collision, bounds, adjacency, and raw-pointer validation
- `src/domain/gridPatterns.ts`: constructible world-origin pattern catalog and viewport-local slot generation
- `src/domain/gridPlacement.ts`: strict exact-slot candidate selection through the existing validator
- `src/interaction/controller.ts`: pointer-target updates, ghost interpolation, release placement logic
- `src/render/materials.ts`: material presets and shader enrichment (fresnel + grain noise)
- `src/render/GridOverlay.tsx`: batched, viewport-cullable canonical-outline overlay rendering
- `src/render/MosaicScene.tsx`: WebGL scene, overlay, lighting, ghost + settled tile rendering, interaction plane
- `src/ui/TilePalette.tsx`: tile palette controls and active selection summary
- `src/ui/GridOverlayControls.tsx`: accessible grid toggle, pattern chooser, and compatibility feedback

## Quality Notes

- SAT-based collision is applied on convex decomposed parts to support concave L-shape tiles.
- Ghost motion uses exponential interpolation for low-latency but non-rigid movement.
- Settle animation includes glide, micro-rotation correction, and pulse.
- Geometry caching reduces per-tile overhead for larger compositions.

See `IMPLEMENTATION_NOTES.md` for deeper design details.
