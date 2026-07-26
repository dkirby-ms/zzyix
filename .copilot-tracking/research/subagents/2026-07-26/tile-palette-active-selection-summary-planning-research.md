<!-- markdownlint-disable-file -->
# Supplemental Research: Tile Palette Planning Follow-Up

## Status

Complete.

## Keyboard Interaction Contract

* Current tile palette controls use independent buttons with visual `active` classes and no grouped-selection semantics in apps/client/src/ui/ControlsPanel.tsx (Lines 30-89).
* Existing behavior therefore implies tab-only traversal today, not arrow-roving selection.
* The repository already includes a stronger single-select primitive in apps/client/src/ui/primitives/ToggleGroup.tsx (Lines 1-17), and its test coverage in apps/client/src/ui/primitives/ToggleGroup.test.tsx (Lines 1-19) verifies radio-role behavior.
* Planning guidance: use a single-select radio-style contract for shape, material, palette, and color rows in the new TilePalette component, implemented with the existing ToggleGroup primitive where practical so arrow-key roving and selected-state semantics are consistent across the full surface.

## Documentation Targets

* apps/client/README.md (Lines 23-35, 80-99) should be updated if the task changes control naming, keyboard behavior, or the project structure reference from ControlsPanel to TilePalette.
* apps/client/IMPLEMENTATION_NOTES.md (Lines 1-77) is the best internal design notes target for documenting deterministic palette fallback behavior, active selection summary behavior, and the accessibility rationale for the new control surface.

## Live Announcement Guidance

* Existing live-region usage is limited to status and exceptional flows, not routine selection changes.
* apps/client/src/ui/CanvasLoadingFallback.tsx (Lines 1-6) uses `role="status"` and `aria-live="polite"` for loading state.
* apps/client/src/ui/LobbyScreen.tsx (Lines 54-62) uses `aria-pressed` for selected buttons without additional live announcements.
* Planning guidance: keep the active selection summary visual-only by default, and add a polite live-region announcement only when palette switching forces a fallback color that the app chose on the user's behalf.

## Remaining Open Questions

* Whether human-readable color names should be added in apps/client/src/ui/palettes.ts or derived locally in TilePalette.
* Whether the active selection summary should remain limited to shape, material, palette, and color, or also include rotation and mirrored state.---