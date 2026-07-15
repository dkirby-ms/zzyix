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

The experience is intentionally organic:
- no visible grid
- no rigid snap jumps
- ghost tile guidance with soft magnetization
- tactile settle animation on valid release

## Features

- Tile shapes: square, triangle, rectangle, L-shape
- Material variants: ceramic, glass, stone-inspired
- Color palettes with quick swatch selection
- 90-degree rotation controls (+ keyboard), mirror toggle
- Hidden guidance model (jittered anchor field) for magnetic fit without exposing lattice cells
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

## Project Structure

- `src/domain/math2d.ts`: vector/math/easing utilities
- `src/domain/tileGeometry.ts`: shape definitions, convex decomposition, transforms
- `src/domain/placementSolver.ts`: hidden guidance anchors, SAT collision, validity/confidence solving
- `src/interaction/controller.ts`: pointer-target updates, ghost interpolation, release placement logic
- `src/render/materials.ts`: material presets and shader enrichment (fresnel + grain noise)
- `src/render/MosaicScene.tsx`: WebGL scene, lighting, ghost + settled tile rendering, interaction plane
- `src/ui/ControlsPanel.tsx`: palette/material/shape/transform/edit controls

## Quality Notes

- SAT-based collision is applied on convex decomposed parts to support concave L-shape tiles.
- Ghost motion uses exponential interpolation for low-latency but non-rigid movement.
- Settle animation includes glide, micro-rotation correction, and pulse.
- Geometry caching reduces per-tile overhead for larger compositions.

See `IMPLEMENTATION_NOTES.md` for deeper design details.
