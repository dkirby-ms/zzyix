<!-- markdownlint-disable-file -->
# Release Changes: Visual Tile Picker

**Related Plan**: .copilot-tracking/plans/2026-07-26/visual-tile-picker-plan.instructions.md
**Implementation Date**: 2026-07-26

## Summary

Implement geometry-driven visual tile picker cards for shape selection while preserving existing selection semantics and accessibility.

## Changes

### Added

* apps/client/src/ui/TileShapePreview.tsx - Added reusable shape preview component that renders decorative inline SVG from geometry-derived path data.
* apps/client/src/ui/tileShapePreviewGeometry.ts - Added geometry normalization and SVG path generation utility for preview rendering.
* apps/client/src/ui/TileShapePreview.test.tsx - Added focused coverage for all required shapes, bounds normalization, and decorative semantics.

### Modified

* apps/client/src/ui/TilePalette.tsx - Replaced text-only shape entries with visual card composition using geometry-driven previews while preserving existing ToggleGroup callback semantics.
* apps/client/src/domain/tileGeometry.ts - Added canonical `TILE_SHAPES` export for domain-backed shape option rendering.
* apps/client/src/App.css - Hardened shape card layout and state styling for hover, focus-visible, selected, pressed, and disabled states with minimum 72x72 card sizing and preserved hit-target baseline.
* apps/client/src/ui/TilePalette.test.tsx - Expanded coverage for preview-card semantics, accessible labels, and drift-guard alignment with canonical shape definitions.
* apps/client/src/ui/TileShapePreview.test.tsx - Added canonical-shape alignment and geometry-derived path equality assertions for all supported shapes.
* apps/client/src/App.test.tsx - Extended placement persistence regression coverage to assert selected shape continuity after placement acknowledgement.

### Removed

## Additional or Deviating Changes

* Extracted preview geometry utilities into a dedicated helper module.
	* Reason: resolved lint constraints on component-only exports while keeping preview logic reusable and testable.
* Adjusted a preview test nullability access (`svg?.querySelector`) during build validation.
	* Reason: fixed strict TypeScript nullability error discovered in Phase 5 build validation.
* Retained existing Vite chunk-size warning without code splitting changes.
	* Reason: warning is pre-existing/non-blocking and outside the scope of this feature implementation.

## Release Summary

Completed all five implementation phases for the visual tile picker.

Total files affected: 9
* Added (3):
	* apps/client/src/ui/TileShapePreview.tsx - New geometry-driven inline SVG preview component for tile shapes.
	* apps/client/src/ui/tileShapePreviewGeometry.ts - Shared normalization and path generation helper used by previews.
	* apps/client/src/ui/TileShapePreview.test.tsx - Shape coverage and geometry-path fidelity tests.
* Modified (6):
	* apps/client/src/ui/TilePalette.tsx - Shape controls now render preview cards with labels while preserving single-select behavior.
	* apps/client/src/domain/tileGeometry.ts - Added canonical `TILE_SHAPES` export consumed by the UI to prevent drift.
	* apps/client/src/App.css - Added and hardened shape-card visual states and minimum sizing constraints.
	* apps/client/src/ui/TilePalette.test.tsx - Extended picker semantics, accessibility, and domain-alignment coverage.
	* apps/client/src/App.test.tsx - Added placement-selection persistence regression assertions.
	* apps/client/src/ui/TileShapePreview.test.tsx - Minor nullability fix for strict build compliance.

Validation results:
* `npm run --prefix apps/client lint` passed.
* `npm run --prefix apps/client build` passed after minor test nullability fix.
* `npm run --prefix apps/client test` passed (79/79 tests).

Dependency and infrastructure changes:
* No package or infrastructure changes.

Deployment notes:
* No deployment action required beyond normal client build pipeline.
