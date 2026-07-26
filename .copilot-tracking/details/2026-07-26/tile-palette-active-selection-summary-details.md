<!-- markdownlint-disable-file -->
# Implementation Details: Tile Palette and Active Selection Summary

## Context Reference

Sources: .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md, .copilot-tracking/research/subagents/2026-07-26/tile-palette-active-selection-summary-planning-research.md, attached repository metadata, and repository workspace inspection of the apps/client code path.

## Implementation Phase 1: Extract TilePalette Surface

<!-- parallelizable: false -->

### Step 1.1: Create the TilePalette component and replace ad hoc button rows with one radio-style selection contract

Create a dedicated TilePalette presentation component under apps/client/src/ui that takes the existing App-owned selection state and callbacks as props. Reuse the current shapes and materials option sets from ControlsPanel, rename the surface around the Issue #76 vocabulary, and apply one radio-style single-select contract across shape, material, palette, and color rows. Implement that contract with the existing ToggleGroup primitive where practical so keyboard behavior and selected-state semantics stay consistent across the full surface.

Files:
* apps/client/src/ui/TilePalette.tsx - New control surface for shape, material, palette, color, and summary rendering
* apps/client/src/ui/ControlsPanel.tsx - Remove after App composition is switched to TilePalette
* apps/client/src/ui/primitives/ToggleGroup.tsx - Reuse existing primitive API without broad wrapper changes

Success criteria:
* TilePalette owns rendering concerns only and continues receiving state and callbacks from App.
* Shape, material, palette, and color rows all expose one explicit radio-style selected-state contract.

Context references:
* .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md (Lines 166-190) - Preferred TilePalette extraction and semantic upgrades
* .copilot-tracking/research/subagents/2026-07-26/tile-palette-active-selection-summary-planning-research.md (Lines 7-10) - Single-select ToggleGroup planning guidance

Dependencies:
* Existing controls contract in apps/client/src/ui/ControlsPanel.tsx

### Step 1.2: Add active selection summary rendering inside the TilePalette surface

Render a persistent active selection summary directly below the creation-order controls. Keep the summary always visible and scoped to the palette surface rather than moving it into the global status strip. The baseline summary should include shape, material, palette, and color, with transform fields intentionally excluded unless implementation reveals a requirement to surface rotation and mirrored state.

Files:
* apps/client/src/ui/TilePalette.tsx - Add summary markup and labels for active selection details
* apps/client/src/ui/palettes.ts - Add color display metadata if local derivation would make tests or announcements ambiguous

Discrepancy references:
* Addresses DR-01 by selecting the reduced-scope summary payload of shape, material, palette, and color unless product evidence later requires transform state.

Success criteria:
* The active selection summary remains visible at all times in the TilePalette region.
* The summary uses stable, human-readable labels for the currently selected values.

Context references:
* .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md (Lines 187-194, 215-221) - Summary content recommendation
* .copilot-tracking/research/subagents/2026-07-26/tile-palette-active-selection-summary-planning-research.md (Lines 23-26) - Open question on summary scope

Dependencies:
* Step 1.1 completion

### Step 1.3: Validate phase changes

Validation commands:
* npm run lint --workspace=apps/client - Validate the extracted TilePalette component and semantic props
* npm run test --workspace=apps/client -- TilePalette - Run any focused TilePalette test selection if available

## Implementation Phase 2: Update App State Flow and Palette Fallback Behavior

<!-- parallelizable: false -->

### Step 2.1: Replace ControlsPanel composition in App with TilePalette while preserving App-owned state

Update apps/client/src/App.tsx to import and render TilePalette in the current palette-region slot, then remove the obsolete ControlsPanel surface from the client UI path. Preserve App-owned state for shape, material, paletteName, color, rotation, and mirrored so existing placement logic and render dependencies remain stable. Do not move placement decision logic out of App in this task.

Files:
* apps/client/src/App.tsx - Replace ControlsPanel usage and update imports
* apps/client/src/ui/ControlsPanel.tsx - Remove once TilePalette is wired into App and no longer imported

Success criteria:
* TilePalette is mounted where ControlsPanel currently renders.
* Existing activeTile construction and placement logic continue using App-owned state.
* No compatibility wrapper remains on the runtime path after the replacement.

Context references:
* apps/client/src/App.tsx (Lines 202-205) - App-owned selection state
* apps/client/src/App.tsx (Lines 260-269) - activeTile memo contract
* apps/client/src/App.tsx (Lines 1081-1093) - Current ControlsPanel composition slot

Dependencies:
* Phase 1 completion

### Step 2.2: Implement preserve-or-fallback palette switching and fallback announcement state in App

Replace the unconditional `setColor(palettes[name][0])` palette switch behavior with preserve-or-fallback logic. When the currently selected color exists in the destination palette, retain it. Otherwise fall back deterministically to the first swatch and record a polite announcement message that explains the automatic substitution. Keep routine selection updates silent.

Files:
* apps/client/src/App.tsx - Add palette change handler, fallback announcement state, and live-region rendering
* apps/client/src/ui/palettes.ts - Add color naming helpers or metadata if raw hex values would make announcements unclear

Success criteria:
* Palette switching preserves color when possible.
* Fallback selections are deterministic and announced through a polite status region.
* Visual-only selection changes do not trigger extra live announcements.

Context references:
* apps/client/src/App.tsx (Lines 1086-1090) - Current unconditional reset behavior
* .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md (Lines 183-186, 202-213) - Preserve-or-fallback algorithm and announcement example
* .copilot-tracking/research/subagents/2026-07-26/tile-palette-active-selection-summary-planning-research.md (Lines 19-22) - Limit live announcements to fallback events

Dependencies:
* Step 2.1 completion

### Step 2.3: Confirm placement success path continues to preserve the active selection after acknowledgements

Treat post-placement persistence as a regression check, not a new feature branch. Confirm that the optimistic placement path and acknowledgement reconciliation leave shape, material, paletteName, and color untouched after successful placement, and only adjust code if the TilePalette extraction accidentally introduces resets.

Files:
* apps/client/src/App.tsx - Verify no new reset behavior was added during refactor
* apps/client/src/interaction/controller.ts - Read-only confirmation of activeTile usage unless tests expose a deeper mismatch

Success criteria:
* Successful placement keeps the user's active selection intact.
* Any persistence fix stays within the selection-state slice and does not alter placement validation logic.

Context references:
* apps/client/src/App.tsx (Lines 893-927) - Placement acknowledgement path
* .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md (Lines 49-50, 101-103, 195-199) - Existing persistence evidence and regression target

Dependencies:
* Step 2.2 completion

### Step 2.4: Validate phase changes

Validation commands:
* npm run lint --workspace=apps/client - Validate App state-flow changes and TSX wiring
* npm run test --workspace=apps/client -- App - Run App-focused tests covering palette and placement state where supported
* Verify issues #75 and #78 are present in the branch context or note any temporary fencing in the implementation record before proceeding to final validation

## Implementation Phase 3: Styling, Accessibility Semantics, and Tests

<!-- parallelizable: false -->

### Step 3.1: Update styles for TilePalette summary, radio-style selected indicators, and 44px touch targets

Evolve apps/client/src/App.css to style the new TilePalette surface while retaining the current palette-region footprint. Preserve the existing touch-target token usage and selected swatch affordance, then extend it for explicit radio-style selected indicators, summary layout, and any ToggleGroup-specific states needed for the grouped rows.

Files:
* apps/client/src/App.css - Update palette-region, color-row, swatch, and summary styles
* apps/client/src/ui/primitives/ToggleGroup.css - Extend only if TilePalette needs state styling not already covered

Success criteria:
* Swatches remain at or above the 44px touch-target minimum.
* Selected, hover, focus, and pressed states are visually distinct for shape, material, palette, and color controls.
* The summary layout remains readable on desktop and mobile widths.

Context references:
* .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md (Lines 58-62, 191-194) - Current touch-target evidence and selected swatch requirements

Dependencies:
* Phase 2 completion

### Step 3.2: Add component and integration tests for semantics, fallback announcements, and placement persistence

Add focused tests around TilePalette semantics and App integration behavior. Component tests should assert radio-style selected-state metadata and keyboard interaction behavior for the extracted surface. App integration tests should cover preserve-or-fallback palette changes, fallback announcement rendering, and successful placement keeping the active selection intact.

Files:
* apps/client/src/ui/TilePalette.test.tsx - Semantics and interaction tests for the extracted component
* apps/client/src/App.test.tsx - Integration coverage for palette fallback and placement persistence
* apps/client/src/ui/primitives/ToggleGroup.test.tsx - Extend only if TilePalette use reveals missing primitive assumptions

Discrepancy references:
* Resolves DR-02 by turning the keyboard-contract ambiguity into one explicit, test-backed radio-style behavior for all rows in this issue.

Success criteria:
* Tests cover selected-state semantics for TilePalette rows.
* Tests confirm arrow-key or primitive-managed roving works consistently across grouped rows.
* App tests verify fallback announcement behavior only when automatic substitution occurs.
* App tests verify post-placement selection persistence.

Context references:
* .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md (Lines 196-199) - Planned test strategy
* .copilot-tracking/research/subagents/2026-07-26/tile-palette-active-selection-summary-planning-research.md (Lines 7-10, 19-22) - Semantic and live-region scope recommendations

Dependencies:
* Steps 2.1 through 2.3 completion

### Step 3.3: Update client documentation for TilePalette behavior and keyboard or accessibility notes

Refresh client-facing docs so they reflect the new TilePalette naming, selected-state behavior, and any keyboard expectations introduced during implementation. Document deterministic palette fallback and the active summary rationale in implementation notes so future changes do not regress the accessibility model.

Files:
* apps/client/README.md - Update feature bullets, controls, and project structure references
* apps/client/IMPLEMENTATION_NOTES.md - Document TilePalette fallback and active summary design rationale

Success criteria:
* Client docs no longer reference outdated ControlsPanel behavior if TilePalette replaces it.
* Implementation notes capture the fallback-announcement rule and summary visibility rationale.

Context references:
* apps/client/README.md (Lines 23-35, 80-99) - Existing feature, controls, and project structure references
* apps/client/IMPLEMENTATION_NOTES.md (Lines 1-77) - Existing design-notes baseline
* .copilot-tracking/research/subagents/2026-07-26/tile-palette-active-selection-summary-planning-research.md (Lines 13-15) - Documentation target recommendation

Dependencies:
* Step 3.2 completion

### Step 3.4: Validate phase changes

Validation commands:
* npm run lint --workspace=apps/client - Validate final UI, test, and docs-adjacent TypeScript changes
* npm run build --workspace=apps/client - Validate final client bundle compiles
* npm run test --workspace=apps/client - Run the full client test suite with coverage

## Implementation Phase 4: Validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all validation commands for the project:
* npm run lint
* npm run lint --workspace=apps/client
* npm run build --workspace=apps/client
* npm run test --workspace=apps/client
* Verify and record whether issues #75 and #78 were already satisfied in-branch or locally fenced for this change set

### Step 4.2: Fix minor validation issues

Iterate on lint errors, build warnings, and narrowly-scoped test failures introduced by the TilePalette change set. Apply fixes directly when they remain local to the client selection-surface slice.

### Step 4.3: Report blocking issues

When validation uncovers broader interaction model changes, document them for follow-on planning rather than widening this implementation into a full control-system refactor.

## Dependencies

* Node.js and npm workspace scripts defined in package.json
* Existing client test infrastructure in apps/client/package.json

## Success Criteria

* The implementation path is concrete enough to execute without re-researching TilePalette state ownership, fallback behavior, or test targets.