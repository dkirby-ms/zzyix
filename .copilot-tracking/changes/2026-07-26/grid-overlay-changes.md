<!-- markdownlint-disable-file -->
# Release Changes: Grid Overlay

**Related Plan**: grid-overlay-plan.instructions.md
**Implementation Date**: 2026-07-26

## Summary

Added an optional client-local grid overlay with three constructible typed patterns, strict exact-slot placement, batched viewport-local rendering, accessible responsive controls, and unchanged authoritative server validation.

## Changes

### Added

* apps/client/src/domain/gridPatterns.ts - World-origin pattern catalog, constructibility filtering, lattice math, deterministic slot generation, and viewport cell ranges.
* apps/client/src/domain/gridPlacement.ts - Strict nearest compatible slot resolution through the existing placement validator.
* apps/client/src/render/gridOverlayGeometry.ts - Pure overlay classification and batched canonical-outline segment generation.
* apps/client/src/render/GridOverlay.tsx - Viewport-cullable non-interactive R3F line rendering.
* apps/client/src/ui/GridOverlayControls.tsx - Accessible grid toggle, pattern chooser, compatible-shape summary, and polite status feedback.
* Focused domain, controller, renderer, controls, and App integration tests for constructibility, exact transforms, preservation, accessibility, and acknowledgement behavior.

### Modified

* apps/client/src/interaction/controller.ts - Added an optional discriminated placement guide while preserving raw-pointer behavior when disabled.
* apps/client/src/render/MosaicScene.tsx - Composed the overlay behind settled tiles and prevented the transparent interaction plane from writing depth.
* apps/client/src/App.tsx - Added local overlay preferences, selected-pattern fallback, last-pointer ghost recomputation, controls, and scene data flow.
* apps/client/src/App.css - Added responsive canvas-local controls with 44px minimum targets and non-color-only selected states.
* apps/client/README.md and apps/client/IMPLEMENTATION_NOTES.md - Replaced stale hidden-guidance claims with the implemented raw-pointer and optional strict-grid behavior.

## Additional or Deviating Changes

* Pure renderer calculations live in `gridOverlayGeometry.ts` rather than the component file so Fast Refresh linting remains clean.
* Scene composition and input continuity are covered through the existing App-level MosaicScene mock plus pure overlay geometry tests; no standalone `MosaicScene.test.tsx` harness was introduced.
* Real-device multi-pointer validation remains deferred to issue #80, as specified by the plan.

## Release Summary

All 109 client tests pass, client lint is clean, and the production client build succeeds. The implementation does not add grid fields to placement payloads, collaboration events, server contracts, or persistence.
