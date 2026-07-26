<!-- markdownlint-disable-file -->
# Release Changes: Consolidate Active Tile and Palette UI State

**Related Plan**: consolidate-active-tile-and-palette-ui-state-plan.instructions.md
**Implementation Date**: 2026-07-26

## Summary

Consolidated client tile configuration into a reducer-backed active-tile UI model, moved palette open/collapsed state into the UI layer, preserved the existing scene prop contract, and added focused regression coverage for keyboard, palette, and pointer-gesture transitions.

## Changes

### Added

* apps/client/src/App.test.tsx - Added regression tests for keyboard-driven active-tile transitions, palette collapse/expand behavior, and undo persistence.
* apps/client/src/render/MosaicScene.test.tsx - Added direct pointer-gesture regression coverage for right-drag rotate and middle-drag pan.
* apps/client/src/ui/TilePalette.test.tsx - Added coverage for the unified active-tile prop shape and the palette header toggle.

### Modified

* apps/client/src/App.tsx - Replaced primitive tile state with a reducer-backed active-tile slice and palette UI state.
* apps/client/src/render/MosaicScene.tsx - Added a stable interaction-plane test hook for pointer-gesture coverage.
* apps/client/src/ui/TilePalette.tsx - Switched to the unified active-tile prop model and added palette open/collapse controls.

## Additional or Deviating Changes

* The scene test surface was added during implementation to close the pointer-gesture regression gap flagged in review.
  * A stable `interaction-plane` test hook was added to keep the new tests deterministic without changing behavior.

## Release Summary

Updated 5 product files and added 3 test surfaces to consolidate client tile UI state behind one reducer-backed active-tile model. The client App and TilePalette now share one typed selection source of truth while preserving the existing MosaicScene prop contract, and MosaicScene now has direct regression coverage for right-drag rotate and middle-drag pan.

Validation passed for the required Phase 4 commands: `npm run lint`, `npm run lint --workspace=apps/client`, `npm run build --workspace=apps/client`, and `npm run test --workspace=apps/client`. The only recorded follow-on item is to add or restore dedicated MosaicScene pointer-gesture coverage if that test surface is reintroduced.
