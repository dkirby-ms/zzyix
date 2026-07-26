<!-- markdownlint-disable-file -->
# Release Changes: Tile Palette and Active Selection Summary

**Related Plan**: .copilot-tracking/plans/2026-07-26/tile-palette-active-selection-summary-plan.instructions.md
**Implementation Date**: 2026-07-26

## Summary

Completed implementation of the dedicated TilePalette control surface, App-level preserve-or-fallback palette behavior with accessibility feedback, and supporting styling, tests, and client documentation updates.

## Changes

### Added

* apps/client/src/ui/TilePalette.tsx - Added dedicated TilePalette control surface with radio-style single-select rows for shape, material, palette, and color using ToggleGroup primitives, plus an always-visible active selection summary.
* apps/client/src/ui/TilePalette.test.tsx - Added focused component tests for row rendering, callback wiring, and persistent active selection summary.

### Modified

* .copilot-tracking/plans/2026-07-26/tile-palette-active-selection-summary-plan.instructions.md - Marked Phase 1 steps complete after implementation and validation.
* apps/client/src/App.tsx - Replaced ControlsPanel composition with TilePalette and added preserve-or-fallback palette switching with polite fallback announcements.
* apps/client/src/App.test.tsx - Added integration coverage for fallback announcement behavior and selection persistence after successful placement.
* apps/client/src/ui/palettes.ts - Added helper logic to support deterministic palette color resolution and optional readable naming support used by App behavior.
* apps/client/src/App.css - Updated TilePalette styles for selected, hover, focus, and pressed states plus active selection summary presentation while retaining touch-target token sizing.
* apps/client/src/ui/TilePalette.test.tsx - Extended component tests for selected-state semantics and interaction coverage.
* apps/client/README.md - Updated client documentation to reflect TilePalette naming and control behavior.
* apps/client/IMPLEMENTATION_NOTES.md - Added implementation notes for preserve-or-fallback behavior and active summary rationale.

### Removed

* apps/client/src/ui/ControlsPanel.tsx - Removed obsolete control surface after App switched to TilePalette.

## Additional or Deviating Changes

* Added a new focused test file for TilePalette in Phase 1.
	* Reason: The phase validation target includes TilePalette-focused tests and no prior TilePalette tests existed.
* Dependency assumptions for issues #75 and #78 could not be explicitly confirmed from local commit metadata and were fenced during Phase 2 validation.
	* Reason: Local branch history inspection showed no explicit issue markers; implementation scope stayed constrained to App and TilePalette selection behavior.
* Strict TypeScript tuple membership check in palette resolution required a local implementation change (`includes` to `some`) during build validation.
	* Reason: `includes` triggered a `never` type mismatch under strict settings; replacement preserved behavior while satisfying type checks.

## Release Summary

All four implementation phases are complete.

Files affected:
* Added: 2
	* apps/client/src/ui/TilePalette.tsx - New dedicated control surface with single-select interaction rows and always-visible active summary.
	* apps/client/src/ui/TilePalette.test.tsx - New focused component coverage for semantics and summary behavior.
* Modified: 8
	* apps/client/src/App.tsx - Replaced ControlsPanel composition and implemented preserve-or-fallback behavior with polite fallback announcement.
	* apps/client/src/App.test.tsx - Added integration coverage for fallback announcement conditions and placement-persistence regression checks.
	* apps/client/src/App.css - Added TilePalette-specific selected-state and summary styling while preserving touch-target sizing.
	* apps/client/src/ui/palettes.ts - Added shared palette resolution helper behavior and strict-typing-safe membership checks.
	* apps/client/README.md - Updated control-surface terminology and behavior documentation.
	* apps/client/IMPLEMENTATION_NOTES.md - Added rationale and behavior notes for TilePalette and fallback announcements.
	* .copilot-tracking/plans/2026-07-26/tile-palette-active-selection-summary-plan.instructions.md - Marked completed steps across all phases.
	* .copilot-tracking/changes/2026-07-26/tile-palette-active-selection-summary-changes.md - Logged implementation progress and outcomes.
* Removed: 1
	* apps/client/src/ui/ControlsPanel.tsx - Removed obsolete control surface after TilePalette replacement.

Validation and quality status:
* Passed: npm run lint
* Passed: npm run lint --workspace=apps/client
* Passed: npm run build --workspace=apps/client (non-blocking chunk-size warning only)
* Passed: npm run test --workspace=apps/client

Dependency and infrastructure notes:
* Issue dependencies #75 and #78 could not be explicitly proven via local commit metadata in this environment; implementation remained fenced to the TilePalette and App selection-state slice and this assumption is documented in Additional or Deviating Changes.
