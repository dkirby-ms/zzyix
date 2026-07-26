---
applyTo: '.copilot-tracking/changes/2026-07-26/grid-overlay-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Grid Overlay

## Overview

Add an optional client-side grid overlay with constructible typed patterns, strict pattern-slot placement, viewport-cullable Three.js rendering, and accessible responsive controls while preserving settled tiles and the existing authoritative server validation path.

## Objectives

### User Requirements

* Let users enable and disable a grid overlay. Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 6-13)
* Offer multiple predefined patterns only when the current tile library can construct them. Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 8-10, 129-134)
* Show the active pattern, compatible tile shapes, and valid placement positions without obscuring placed work. Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 9-10, 251-298)
* Align placement position, rotation, and mirroring to the selected pattern while the overlay is active. Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 10-11, 159-164, 218-249)
* Preserve every placed tile when the overlay is hidden or its pattern changes. Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 11-12, 136-145)
* Support responsive layouts and the application's current keyboard, pointer, and touch input paths. Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 12-13, 146-151)

### Derived Objectives

* Model patterns as repeating world-origin slot templates and derive compatibility from slot shapes to prevent catalog drift. Derived from: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 153-168, 170-216)
* Keep overlay choice in local App state and continue sending only the final `Transform2D` through the existing placement payload. Derived from: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 120-127, 300-327)
* Reuse canonical tile outlines and `validatePlacement` for slot geometry and validity instead of duplicating shape or collision rules. Derived from: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 216, 223-231, 251-271)
* Generate only viewport-visible slots and batch line geometry so the overlay remains viable for large and future unbounded canvases. Derived from: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 253-271, 344-349)
* Preserve active-tile orientation state while allowing pattern slot orientation to control only guided ghost and placement transforms. Derived from: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 159-164, 495-498)
* Keep server contracts, database schema, and server placement solver unchanged for the initial feature. Derived from: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 448-455)

## Context Summary

### Project Files

* apps/client/src/domain/tileGeometry.ts - Canonical tile library, outlines, transforms, rotations, and mirroring
* apps/client/src/domain/placementSolver.ts - Existing overlap, bounds, adjacency, and raw-pointer validation
* apps/client/src/interaction/controller.ts - Narrow ghost-target seam and existing `tryPlaceTile` use of `ghost.target`
* apps/client/src/App.tsx - App-local editing state, pointer handling, optimistic placement, and scene/control composition
* apps/client/src/render/MosaicScene.tsx - Orthographic camera, viewport reporting, scene layering, and interaction plane
* apps/client/src/ui/TilePalette.tsx - Existing visual shape previews and ToggleGroup interaction precedent
* apps/client/src/ui/primitives/ToggleGroup.tsx - Existing single-select primitive
* apps/client/src/App.css - Canvas workspace breakpoints, touch targets, focus states, and responsive layout
* apps/client/src/App.test.tsx - Placement payload, optimistic acknowledgement, and state-preservation integration surface

### References

* .copilot-tracking/research/2026-07-26/grid-overlay-research.md - Canonical research, product decisions, alternatives, file map, tests, and risks
* https://github.com/dkirby-ms/zzyix/issues/85 - Feature request
* https://github.com/dkirby-ms/zzyix/issues/80 - Pending multi-pointer touch gesture contract
* https://github.com/dkirby-ms/zzyix/issues/83 - Future mobile palette bottom sheet

### Standards References

* https://www.w3.org/WAI/ARIA/apg/patterns/button/ - Toggle button naming and `aria-pressed` behavior
* https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html - Non-text state and focus contrast

## Implementation Checklist

### [ ] Implementation Phase 1: Define Constructible Grid Patterns

<!-- parallelizable: false -->

* [ ] Step 1.1: Add the grid pattern domain model and initial square, running-bond, and triangle catalog
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 12-39)
* [ ] Step 1.2: Add constructibility filtering, inverse-basis coordinate conversion, deterministic slot IDs, and viewport cell-range generation
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 40-68)
* [ ] Step 1.3: Prove catalog invariants and complete valid fill sequences through domain tests
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 69-91)
* [ ] Step 1.4: Validate phase changes
  * Run focused grid pattern tests and client lint

### [ ] Implementation Phase 2: Resolve Strict Pattern-Aligned Placement

<!-- parallelizable: false -->

* [ ] Step 2.1: Add a pattern resolver that selects the nearest exact compatible slot and validates candidates with `validatePlacement`
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 96-123)
* [ ] Step 2.2: Cover strict snapping, orientation, incompatibility, occupied slots, bounds, adjacency, and deterministic ties
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 124-143)
* [ ] Step 2.3: Route `updateGhostTarget` through an optional discriminated placement guide while preserving the disabled path
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 144-163)
* [ ] Step 2.4: Validate phase changes
  * Run grid placement and controller tests

### [ ] Implementation Phase 3: Add Accessible Grid Controls

<!-- parallelizable: true -->

* [ ] Step 3.1: Add a canvas-local toggle, constructible pattern chooser, compatible-shape summary, and polite status feedback
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 168-196)
* [ ] Step 3.2: Test toggle semantics, keyboard selection, labels, filtering, announcements, and hidden-state retention
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 197-216)
* [ ] Step 3.3: Validate phase changes
  * Run focused GridOverlayControls tests

### [ ] Implementation Phase 4: Render a Viewport-Cullable Overlay

<!-- parallelizable: true -->

* [ ] Step 4.1: Build batched canonical-outline line geometry and compose it between canvas bounds and settled tiles
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 221-251)
* [ ] Step 4.2: Test viewport culling, transformed outlines, visual-state classification, scene composition, and input continuity
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 252-272)
* [ ] Step 4.3: Validate phase changes
  * Run focused GridOverlay and MosaicScene tests

### [ ] Implementation Phase 5: Wire App State and Preserve Existing Tiles

<!-- parallelizable: false -->

* [ ] Step 5.1: Add App-local overlay state, constructible pattern derivation, and deterministic availability fallback
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 277-298)
* [ ] Step 5.2: Recompute the ghost from the last pointer when guide inputs change without overwriting slot-owned orientation
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 299-321)
* [ ] Step 5.3: Compose responsive canvas-local controls and pass active overlay data into MosaicScene
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 322-347)
* [ ] Step 5.4: Add integration regressions for tile preservation, exact payload transforms, hidden-pattern retention, and rejected acknowledgements
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 348-367)
* [ ] Step 5.5: Validate phase changes
  * Run App, controller, controls, and render integration tests

### [ ] Implementation Phase 6: Documentation and Validation

<!-- parallelizable: false -->

* [ ] Step 6.1: Replace stale hidden-guidance documentation with raw-pointer default and optional strict pattern guidance
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 372-391)
* [ ] Step 6.2: Run targeted checks, full client lint/test/build, and manual responsive/render/input validation
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 392-406)
* [ ] Step 6.3: Report blockers without expanding into shared server grid state, preference persistence, or unfinished multi-pointer gestures
  * Details: .copilot-tracking/details/2026-07-26/grid-overlay-details.md (Lines 407-410)

## Planning Log

See .copilot-tracking/plans/logs/2026-07-26/grid-overlay-log.md for discrepancies, implementation paths considered, and deferred work.

## Planning Outcomes

* Created artifacts:
  * .copilot-tracking/plans/2026-07-26/grid-overlay-plan.instructions.md
  * .copilot-tracking/details/2026-07-26/grid-overlay-details.md
  * .copilot-tracking/plans/logs/2026-07-26/grid-overlay-log.md
* Deferred scope items:
  * WI-01: Real-device multi-pointer validation after issue #80
  * WI-02: Interactive visual tuning of pattern spacing and overlay state markers
  * WI-03: Cross-session overlay preference persistence
  * WI-04: Shared client/server tile registry for runtime-configurable libraries
  * WI-05: Final mobile placement coordination with issue #83

## Dependencies

* Existing client tile geometry, placement validation, and ghost controller contracts
* Existing React Three Fiber orthographic scene and viewport reporting
* Existing ToggleGroup, TileShapePreview, and 44px touch-target token
* Existing Vitest, Testing Library, TypeScript, lint, and Vite build tooling
* Issue #80 is not required for current input-path support, but its gesture arbitration is required before claiming full multi-pointer touch parity

## Success Criteria

* Current `TILE_SHAPES` yields at least three selectable, fully constructible patterns. Traces to: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 23-28, 204-216)
* Enabled placement always targets an exact compatible pattern slot and never silently falls back to the raw pointer. Traces to: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 159-164, 218-249)
* The overlay shows active, compatible, placeable, and blocked states without obscuring placed tiles or intercepting canvas input. Traces to: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 251-298)
* Toggling or switching patterns leaves all settled tile data unchanged and preserves the selected pattern while hidden. Traces to: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 136-145, 165-168)
* Controls remain keyboard, pointer, current-touch, and screen-reader operable across supported responsive layouts. Traces to: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 146-151, 273-298)
* The server continues to validate ordinary final transforms with no grid-related contract, solver, or schema changes. Traces to: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 120-127, 448-455)
