<!-- markdownlint-disable-file -->
# Implementation Details: Visual Tile Picker

## Context Reference

Sources: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md, user request context from prompt:task-plan.prompt.md

## Implementation Phase 1: Build Geometry-Driven Tile Previews

<!-- parallelizable: true -->

### Step 1.1: Add a reusable TileShapePreview component

Create a new UI component that accepts `shape` and optional size props, reads canonical shape outline points from `getTileDefinition(shape).outline`, and renders an inline SVG thumbnail intended for decorative preview usage.

Files:
* apps/client/src/ui/TileShapePreview.tsx - New presentational component for shape thumbnails

Discrepancy references:
* Addresses DR-01 by making preview generation derive from domain geometry

Success criteria:
* Component renders an SVG path for each supported shape without importing scene rendering logic
* SVG is marked decorative (`aria-hidden`) while external card labels provide accessible names

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 157-172) - Preferred architecture and component contract
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 238-245) - Rationale for inline SVG approach

Dependencies:
* `getTileDefinition` from apps/client/src/domain/tileGeometry.ts
* Existing React component patterns in apps/client/src/ui

### Step 1.2: Add geometry normalization utility and path generation

Implement or co-locate a utility that transforms polygon points into normalized path data by computing bounds, applying padding, and fitting to the target viewBox without clipping.

Files:
* apps/client/src/ui/TileShapePreview.tsx - Utility implementation location (or adjacent helper file if extracted)
* apps/client/src/ui/TileShapePreview.test.tsx - Unit-level assertions for normalization/path output

Success criteria:
* All four target shapes produce non-empty path data
* Orientation and padding remain consistent across shape variants

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 191-194) - Utility algorithm guidance
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 249-251) - Clipping/orientation risk mitigation

Dependencies:
* Step 1.1 completion

### Step 1.3: Validate phase changes

Run lint and tests that cover the new preview component and utility.

Validation commands:
* `npm run --prefix apps/client lint` - TypeScript and lint checks for client UI code
* `npm run --prefix apps/client test -- TileShapePreview` - Focused preview component and utility tests

## Implementation Phase 2: Integrate Visual Cards into TilePalette with A11y Semantics

<!-- parallelizable: false -->

### Step 2.1: Replace text-only shape items with visual cards

Update shape selection items in TilePalette to compose preview + text label in each ToggleGroupItem while retaining existing value/onValueChange behavior and role semantics from the primitive.

Files:
* apps/client/src/ui/TilePalette.tsx - Replace text-only item content with card layout

Success criteria:
* Shape options are driven from a geometry-backed shape list rather than a duplicated local constant
* Shape options remain single-select radios in a radiogroup
* Each card displays the matching preview and a human-readable label

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 37-39) - Option drift risk and registry-derivation direction
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 51-54) - Current picker behavior
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 169-171) - Keep ToggleGroup semantics unchanged

Dependencies:
* Implementation Phase 1 completion

### Step 2.2: Derive shape option list from domain geometry source

Export or consume a canonical shape list from the domain geometry module and use it to render TilePalette options so future shape additions remain aligned with previews and geometry definitions.

Files:
* apps/client/src/domain/tileGeometry.ts - Expose canonical shape option list if needed
* apps/client/src/ui/TilePalette.tsx - Consume canonical shape list for option rendering

Discrepancy references:
* Addresses DR-01 by eliminating duplicated UI shape option constants

Success criteria:
* TilePalette no longer defines an independent hardcoded shape constant
* Option list and preview geometry are both sourced from domain geometry artifacts

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 37-39, 251-253) - Drift risk and mitigation

Dependencies:
* Step 2.1 completion

### Step 2.3: Keep App shape wiring unchanged and verify persistence

Confirm `TilePalette` continues to emit shape values through existing callback contract and that App state ownership and placement pipeline remain unchanged.

Files:
* apps/client/src/ui/TilePalette.tsx - Ensure callback contract remains identical
* apps/client/src/App.tsx - No functional change expected; verify wiring and behavior only

Success criteria:
* Selecting a card updates active shape exactly as before
* Placed tiles continue to persist chosen shape after placement

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 54-57, 93-96) - State ownership and pipeline continuity
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 137-138) - Placement persistence path

Dependencies:
* Step 2.2 completion

### Step 2.4: Validate phase changes

Run picker-focused tests and interaction checks after integration.

Validation commands:
* `npm run --prefix apps/client test -- TilePalette` - Picker behavior and semantics
* `npm run --prefix apps/client test -- ToggleGroup` - Primitive semantics verification

Additional validation checklist:
* Verify keyboard navigation and selection with arrow keys, Space, and Enter
* Verify pointer and touch-equivalent activation update selected shape consistently
* Verify each option exposes a stable accessible name for screen-reader announcement
* Verify geometry-derived shape list is the source for rendered options

## Implementation Phase 3: Styling and Interaction State Hardening

<!-- parallelizable: true -->

### Step 3.1: Add shape card interaction states and visual hierarchy

Introduce or update CSS classes used by TilePalette card content for selected, hover, pressed, focus-visible, and disabled states. Reuse data-state attributes emitted by ToggleGroupItem where possible.

Files:
* apps/client/src/App.css - Add or adjust tile-picker card classes and state selectors

Discrepancy references:
* Addresses DR-03 by explicitly mapping interaction-state requirements to CSS selectors

Success criteria:
* Distinct state visuals exist for selected, hover, focus-visible, pressed, and disabled interactions
* State styling does not reduce label readability or visible focus indicator clarity

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 198-200) - State and sizing requirements
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 253-255) - State regression mitigation

Dependencies:
* Step 2.1 completion

### Step 3.2: Enforce minimum visual and hit target sizes

Set dimensions so each visual card is at least 72x72 and ensure interactive target area is at least 44x44, accounting for padding and layout behavior across breakpoints.

Files:
* apps/client/src/App.css - Size constraints and spacing rules for shape cards

Success criteria:
* Card visuals satisfy >=72x72 dimensions
* Click/tap target satisfies >=44x44 dimensions for all shape options

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 12, 199-200) - Explicit target sizing requirements

Dependencies:
* Step 3.1 completion

### Step 3.3: Validate phase changes

Run CSS-impacted tests and optional manual viewport checks.

Validation commands:
* `npm run --prefix apps/client test -- TilePalette` - Confirm behavior remains correct with new classes
* `npm run --prefix apps/client test -- App` - Smoke coverage for integration path

Additional validation checklist:
* Confirm focus-visible ring remains clearly visible at all card states
* Confirm touch targets satisfy sizing on narrow/mobile viewport layouts

## Implementation Phase 4: Test Coverage and Drift Guarding

<!-- parallelizable: false -->

### Step 4.1: Extend TilePalette accessibility and state tests

Update existing TilePalette tests to assert that visual card content still exposes the same role-based model and checked-state behavior.

Files:
* apps/client/src/ui/TilePalette.test.tsx - Existing semantic tests plus card-state assertions

Discrepancy references:
* Addresses DR-02 and DD-01 by validating semantic continuity across the visual redesign

Success criteria:
* Radiogroup/radio expectations remain passing
* Checked-state assertions map correctly to selected card item
* Per-option accessible-name assertions verify label announcement remains correct

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 62-63, 76-77) - Existing semantic coverage baseline

Dependencies:
* Implementation Phases 2 and 3 completion

### Step 4.2: Add TileShapePreview tests for all required shapes

Add tests that render the preview component for square, triangle, rectangle, and L-shape and assert each renders a stable, non-empty SVG path.

Files:
* apps/client/src/ui/TileShapePreview.test.tsx - New preview coverage

Success criteria:
* All four required shapes render path data
* Path data reflects geometry-driven generation rather than static assets

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 8-9, 201-204) - Scope and test guidance

Dependencies:
* Implementation Phase 1 completion

### Step 4.3: Add drift-guard test for shape option alignment

Add a test that compares UI-exposed shape options against geometry-backed definitions (or a canonical shape list shared from domain types) to detect future option drift.

Files:
* apps/client/src/ui/TilePalette.test.tsx - Add alignment assertion

Success criteria:
* Test fails if new geometry shapes are added without picker option updates
* Current four shape options remain aligned with geometry source

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 37-39, 251-253) - Drift risk and mitigation

Dependencies:
* Step 4.1 completion

### Step 4.4: Add placement-persistence regression test

Add or extend an integration test that selects a shape, places a tile, and verifies subsequent selected-shape behavior remains aligned with the expected single active selection flow.

Files:
* apps/client/src/App.test.tsx - Add integration scenario for post-placement selection continuity

Success criteria:
* Selected shape before placement remains consistent with expected active-selection behavior after placement
* Regression fails if placement flow mutates shape selection unexpectedly

Context references:
* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 10, 137-138, 165) - Placement persistence requirement and pathway

Dependencies:
* Implementation Phase 2 completion

## Implementation Phase 5: Validation

<!-- parallelizable: false -->

### Step 5.1: Run full project validation

Execute all validation commands for client changes:
* `npm run --prefix apps/client lint`
* `npm run --prefix apps/client build`
* `npm run --prefix apps/client test`

### Step 5.2: Fix minor validation issues

Address straightforward lint, build, and test regressions discovered in Step 5.1.

### Step 5.3: Report blocking issues

If failures require broad refactors or additional architecture decisions, document them and return for follow-on planning rather than forcing a large inline change.

## Dependencies

* Existing React + TypeScript client architecture
* Domain geometry definitions in apps/client/src/domain/tileGeometry.ts
* Existing test stack in apps/client (Vitest + Testing Library)

## Success Criteria

* Geometry-derived previews render for all required shapes in tile selection UI
* Existing selection behavior and accessibility semantics remain intact
* Card sizing and interaction states meet requirements and are covered by tests