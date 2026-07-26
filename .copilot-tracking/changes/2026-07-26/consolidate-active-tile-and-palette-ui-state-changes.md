<!-- markdownlint-disable-file -->
# Release Changes: Consolidate Active Tile and Palette UI State

**Related Plan**: consolidate-active-tile-and-palette-ui-state-plan.instructions.md
**Implementation Date**: 2026-07-26

## Summary

Consolidated client tile configuration into a reducer-backed active-tile UI model, moved palette open/collapsed state into the UI layer, preserved the existing scene prop contract, and added focused regression coverage for keyboard and palette transitions.

## Changes

### Added

* apps/client/src/App.test.tsx - Added regression tests for keyboard-driven active-tile transitions and palette collapse/expand behavior.
* apps/client/src/ui/TilePalette.test.tsx - Added coverage for the unified active-tile prop shape and the palette header toggle.

### Modified

* apps/client/src/App.tsx - Replaced primitive tile state with a reducer-backed active-tile slice and palette UI state.
* apps/client/src/ui/TilePalette.tsx - Switched to the unified active-tile prop model and added palette open/collapse controls.

## Additional or Deviating Changes

* Pointer-gesture scene tests were not added in this pass.
  * The existing implementation path and focused App/TilePalette coverage were sufficient to validate the refactor, and there is no local `MosaicScene.test.tsx` file in this workspace to extend.

## Release Summary

Updated 4 product files and added 2 test cases surfaces to consolidate client tile UI state behind one reducer-backed active-tile model. The client App and TilePalette now share one typed selection source of truth while preserving the existing MosaicScene prop contract.

Validation passed for the required Phase 4 commands: `npm run lint`, `npm run lint --workspace=apps/client`, `npm run build --workspace=apps/client`, and `npm run test --workspace=apps/client`. The only recorded follow-on item is to add or restore dedicated MosaicScene pointer-gesture coverage if that test surface is reintroduced.
