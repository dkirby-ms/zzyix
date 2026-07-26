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
* apps/client/src/ui/TilePalette.test.tsx - Added explicit keyboard-path tests for Arrow navigation and Space/Enter activation with user-facing shape labels.
* apps/client/src/App.test.tsx - Added rejected-ack and delayed-ack timing variants for placement persistence coverage.
* apps/client/src/ui/TilePalette.tsx - Added runtime narrowing guards and user-facing shape radio accessible names; introduced explicit keyboard key handling for shape card controls.
* apps/client/src/ui/TileShapePreview.tsx - Memoized geometry-to-path preview generation.

### Removed

## Additional or Deviating Changes

* Extracted preview geometry utilities into a dedicated helper module.
	* Reason: resolved lint constraints on component-only exports while keeping preview logic reusable and testable.
* Adjusted a preview test nullability access (`svg?.querySelector`) during build validation.
	* Reason: fixed strict TypeScript nullability error discovered in Phase 5 build validation.
* Retained existing Vite chunk-size warning without code splitting changes.
	* Reason: warning is pre-existing/non-blocking and outside the scope of this feature implementation.
* Added post-review remediation phase to address independent review findings after original plan completion.
	* Reason: follow-up validation identified open major test coverage gaps that required explicit rework.

## Validation Transcript

* `npm run --prefix apps/client test -- TilePalette`
	* Result: Pass (1 file, 8 tests)
* `npm run --prefix apps/client test -- App`
	* Result: Pass (1 file, 23 tests)
* `npm run --prefix apps/client lint`
	* Result: Pass
* `npm run --prefix apps/client build`
	* Result: Pass (existing non-blocking chunk-size warning remains)
* `npm run --prefix apps/client test -- --run`
	* Result: Pass (16 files, 83 tests)

## Release Summary

Completed all six implementation phases for the visual tile picker, including post-review remediation.

Total files affected: 9
* Added (3):
	* apps/client/src/ui/TileShapePreview.tsx - New geometry-driven inline SVG preview component for tile shapes.
	* apps/client/src/ui/tileShapePreviewGeometry.ts - Shared normalization and path generation helper used by previews.
	* apps/client/src/ui/TileShapePreview.test.tsx - Shape coverage and geometry-path fidelity tests.
* Modified (6):
	* apps/client/src/ui/TilePalette.tsx - Shape controls render preview cards with user-facing labels, runtime narrowing, and explicit keyboard handling while preserving single-select behavior.
	* apps/client/src/domain/tileGeometry.ts - Added canonical `TILE_SHAPES` export consumed by the UI to prevent drift.
	* apps/client/src/App.css - Added and hardened shape-card visual states and minimum sizing constraints.
	* apps/client/src/ui/TilePalette.test.tsx - Extended picker semantics with domain alignment plus explicit Arrow and Space/Enter keyboard-path coverage.
	* apps/client/src/App.test.tsx - Added placement-selection persistence assertions, including rejected-ack and delayed-ack timing variants.
	* apps/client/src/ui/TileShapePreview.tsx - Added memoization for preview path generation.

Validation results:
* `npm run --prefix apps/client test -- TilePalette` passed (8/8 tests).
* `npm run --prefix apps/client test -- App` passed (23/23 tests).
* `npm run --prefix apps/client lint` passed.
* `npm run --prefix apps/client build` passed (existing non-blocking chunk-size warning persists).
* `npm run --prefix apps/client test -- --run` passed (83/83 tests).

Dependency and infrastructure changes:
* No package or infrastructure changes.

Deployment notes:
* No deployment action required beyond normal client build pipeline.
