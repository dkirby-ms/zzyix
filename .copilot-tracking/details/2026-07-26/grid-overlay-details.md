<!-- markdownlint-disable-file -->
# Implementation Details: Grid Overlay

## Context Reference

Sources: .copilot-tracking/research/2026-07-26/grid-overlay-research.md, Issue #85, and user request context from prompt:task-plan.prompt.md

## Implementation Phase 1: Define Constructible Grid Patterns

<!-- parallelizable: false -->

### Step 1.1: Add the grid pattern domain model and catalog

Create a pure client-domain module for repeating world-space patterns. Define typed pattern IDs, basis vectors, template slots, labels, descriptions, slot transforms, and deterministic generated slot IDs. Anchor every pattern to world origin `(0, 0)` so pattern output is independent of viewport size, camera position, and collaborator state.

Initial patterns:
* Square lattice with one square slot per repeating cell
* Running bond with rectangle slots across two offset rows
* Triangle tessellation with alternating triangle orientations

Files:
* apps/client/src/domain/gridPatterns.ts - New pattern types, catalog, and geometry helpers
* apps/client/src/domain/tileGeometry.ts - Reuse `TILE_SHAPES`, `TileShape`, `Transform2D`, and canonical outlines without introducing a second shape registry

Success criteria:
* Pattern definitions derive their supported shapes from template slots rather than a separate `requiredShapes` field
* Every basis vector is finite and the two basis vectors form an invertible lattice
* Every generated slot has a stable ID composed from pattern ID, integer cell coordinates, and template slot ID
* Slot transforms include pattern-owned position, rotation, and mirroring
* No pattern state or type is added to server contracts

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 129-134) - Tile-library availability and derived requirements
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 153-168) - Recommended product decisions
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 170-216) - Pattern schema and initial catalog

Dependencies:
* Existing canonical tile definitions in apps/client/src/domain/tileGeometry.ts

### Step 1.2: Add constructibility filtering and deterministic lattice math

Implement pure helpers that:
* Derive a pattern's compatible shape set from its template slots
* Filter the catalog against an available `ReadonlySet<TileShape>`
* Convert world positions into fractional lattice coordinates by inverting the basis matrix
* Enumerate the nearest cell and immediate neighboring cells for pointer targeting
* Convert viewport corners into an integer cell range with one-cell overscan
* Generate visible slots only for the requested cell range

Use canonical outline bounds to derive slot spacing and define a documented visual grout gap that remains within the existing placement validator's accepted maximum. Avoid hard-coding a second copy of collision or adjacency rules; fill-sequence tests must validate the chosen dimensions through `validatePlacement`.

Files:
* apps/client/src/domain/gridPatterns.ts - Constructibility, coordinate conversion, cell-range, and slot-generation helpers

Success criteria:
* Removing any shape required by a template filters that pattern out
* Current `TILE_SHAPES` exposes at least square lattice, running bond, and triangle tessellation
* Cell-range generation is stable at negative coordinates and lattice boundaries
* Visible-slot generation is bounded by viewport plus overscan rather than world bounds
* Slot spacing passes the existing overlap, bounds, and adjacency validator

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 204-216) - Initial patterns and geometry requirements
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 251-271) - Viewport-local rendering constraints

Dependencies:
* Step 1.1 completion

### Step 1.3: Add pattern catalog and generation tests

Add domain tests for schema invariants, availability filtering, world-origin anchoring, deterministic IDs, nearest-cell behavior, negative coordinates, viewport overscan, and complete valid fill sequences.

For each initial pattern, define a documented adjacent placement order and run every generated slot through the existing `validatePlacement` function. The test must fail if a pattern overlaps itself, exceeds grout distance, or cannot be incrementally constructed.

Files:
* apps/client/src/domain/gridPatterns.test.ts - New domain tests for catalog and generated slots

Success criteria:
* Pattern IDs and template slot IDs are unique
* Basis vectors are finite, non-zero, and non-collinear
* Every template slot references a canonical `TileShape`
* Availability tests use reduced shape sets and the current full tile library
* Full fill-sequence fixtures remain valid under `validatePlacement`

Validation commands:
* `npm run test --workspace=apps/client -- gridPatterns`
* `npm run lint --workspace=apps/client`

Dependencies:
* Steps 1.1 and 1.2 completion

## Implementation Phase 2: Resolve Strict Pattern-Aligned Placement

<!-- parallelizable: false -->

### Step 2.1: Add the pattern placement resolver

Create a client-only resolver that receives pointer position, active tile, selected pattern, settled tiles, and current bounds. Enumerate compatible slots from the nearest lattice cell and its immediate neighbors, compose exact transforms, validate every candidate with `validatePlacement`, and choose the closest valid candidate with stable slot-ID tie-breaking.

Required fallback behavior:
* If compatible candidates exist but all are blocked, return the closest exact compatible slot as invalid
* If the active shape is incompatible, return the closest pattern slot transform as invalid with an actionable incompatibility reason
* Never return the raw pointer transform while a pattern guide is enabled
* Preserve active tile color and material; pattern slots control only position, rotation, and mirroring

Files:
* apps/client/src/domain/gridPlacement.ts - New candidate resolution and validation integration

Success criteria:
* The selected transform is always an exact generated slot transform
* Valid candidates win over closer invalid candidates
* Equal-distance candidate selection is deterministic
* Existing off-pattern tiles are never changed and can block a candidate through normal validation
* Bounded and unbounded bounds policies continue to use existing validator behavior

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 218-249) - Pattern-aware placement algorithm and edge cases
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 397-407) - Selected client-only architecture

Dependencies:
* Implementation Phase 1 completion
* Existing `validatePlacement` in apps/client/src/domain/placementSolver.ts

### Step 2.2: Add placement resolver tests

Cover strict snapping, slot-owned orientation, incompatible shapes, occupied slots, bounds, adjacency, deterministic tie-breaking, and the no-raw-pointer guarantee.

Files:
* apps/client/src/domain/gridPlacement.test.ts - New resolver tests

Success criteria:
* Pointer movement within one slot's attraction region returns the same exact transform
* Pattern rotation and mirroring override active-tile orientation only for the guided ghost and placement
* An incompatible shape produces an invalid aligned target and a useful reason
* Existing tiles can invalidate a slot without being normalized, moved, hidden, or deleted
* No enabled-guide result has a position equal to an arbitrary raw pointer unless that pointer is itself an exact slot

Validation commands:
* `npm run test --workspace=apps/client -- gridPlacement`

Dependencies:
* Step 2.1 completion

### Step 2.3: Route the interaction controller through an optional placement guide

Add a discriminated `PlacementGuide` input to `updateGhostTarget`. Keep the current `solveGuidedPlacement` call for `{ enabled: false }` and call the new pattern resolver for `{ enabled: true, pattern }`. Map the selected resolver result into the existing `GhostState` fields so `tryPlaceTile` continues to persist `ghost.target` without a second placement transform path.

Files:
* apps/client/src/interaction/controller.ts - Add placement-guide type and resolver branch
* apps/client/src/interaction/controller.test.ts - Add disabled parity and enabled guide coverage

Success criteria:
* Omitting or disabling the guide preserves current raw-pointer behavior exactly
* Enabling the guide returns slot position, rotation, mirroring, validity, and reason through the existing ghost contract
* `tryPlaceTile` remains unchanged and uses the exact guided target
* The guide does not alter optimistic acknowledgement or sequenced-state reconciliation

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 234-249) - Controller seam and unchanged placement path

Dependencies:
* Steps 2.1 and 2.2 completion

## Implementation Phase 3: Add Accessible Grid Controls

<!-- parallelizable: true -->

### Step 3.1: Build GridOverlayControls

Create a canvas-local control surface with:
* A native toggle button with stable label "Grid overlay" and `aria-pressed`
* A single-select pattern chooser using the existing `ToggleGroup`
* Pattern labels and compatible tile-shape text
* Reused `TileShapePreview` visuals as supplemental, decorative cues
* A polite status region for incompatible active shapes and automatic availability fallback changes

Only pass constructible patterns to the component; do not render unavailable patterns as disabled choices. Do not announce pointer movement or per-slot validity changes.

Files:
* apps/client/src/ui/GridOverlayControls.tsx - New accessible controls and compatible-shape summary
* apps/client/src/ui/TileShapePreview.tsx - Reuse only; no new geometry source

Success criteria:
* The toggle has a stable accessible name and exposes enabled state with `aria-pressed`
* Pattern selection has one selected value and keyboard-operable radio-style semantics
* Every compatible shape is named in text
* Incompatible selection guidance is actionable, for example "Choose Rectangle to place on Running bond"
* Hidden overlay state does not clear the selected pattern

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 273-298) - Controls, semantics, status, sizing, and responsive placement

Dependencies:
* Pattern types and compatibility helpers from Implementation Phase 1
* Existing ToggleGroup and TileShapePreview components

### Step 3.2: Add controls tests

Test toggle semantics, pattern selection, constructibility filtering at the caller boundary, compatible-shape labels, keyboard operation, status messages, and selection retention while hidden.

Files:
* apps/client/src/ui/GridOverlayControls.test.tsx - New component tests

Success criteria:
* `aria-pressed` changes without changing the toggle's accessible name
* Arrow, Space, and Enter paths select patterns through existing ToggleGroup semantics
* Unavailable patterns are absent
* Compatible shapes are available to screen readers as text
* The polite status region changes only for meaningful compatibility or fallback events

Validation commands:
* `npm run test --workspace=apps/client -- GridOverlayControls`

Dependencies:
* Step 3.1 completion

## Implementation Phase 4: Render a Viewport-Cullable Overlay

<!-- parallelizable: true -->

### Step 4.1: Build batched canonical-outline overlay geometry

Create a non-interactive R3F scene component that generates visible pattern slots from the current orthographic viewport plus one-cell overscan. Transform canonical tile outlines for each slot and batch them into `BufferGeometry`/`LineSegments` grouped by visual state rather than rendering one React component per edge or slot.

Classify visible slots using active shape and existing placement validation:
* Placeable compatible slot - solid outline
* Nearest active slot - thicker outline or center marker
* Occupied or otherwise blocked slot - reduced opacity plus dash/marker treatment
* Incompatible slot - omitted or rendered as a faint structural outline

Dispose replaced Three.js geometries and materials according to existing scene lifecycle conventions. Keep the overlay free of pointer handlers and below settled tiles and the ghost.

Files:
* apps/client/src/render/GridOverlay.tsx - New viewport tracking, slot classification, and batched line rendering
* apps/client/src/render/MosaicScene.tsx - Add overlay props and compose the overlay after CanvasBounds but before settled tiles

Success criteria:
* Camera pan and zoom regenerate only the visible cell range
* Overlay geometry uses `getTileDefinition(slot.shape).outline`
* Overlay objects do not intercept interaction-plane pointer events
* Placed tiles, collaborator indicators, and the ghost remain visually dominant
* Pattern, viewport cell range, active shape, and settled tiles are the only semantic geometry rebuild inputs

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 251-271) - Rendering strategy and GridHelper rejection
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 300-316) - State and rendering data flow

Dependencies:
* Implementation Phases 1 and 2
* Existing orthographic camera and viewport reporting in MosaicScene

### Step 4.2: Add renderer integration coverage

Keep geometry-state calculations pure where practical and test them without WebGL. Extend the scene test surface to assert overlay composition, prop forwarding, and pointer-plane continuity.

Files:
* apps/client/src/render/GridOverlay.test.tsx - Pure geometry/classification and component lifecycle tests
* apps/client/src/render/MosaicScene.test.tsx - Overlay composition and unchanged input callback coverage

Success criteria:
* Visible geometry excludes cells outside viewport plus overscan
* Line positions match transformed canonical outlines
* Enabled and disabled overlay states mount and unmount predictably
* Existing pointer and touch-equivalent callbacks still reach the interaction plane
* Geometry cleanup is asserted where the test harness supports disposal observation

Validation commands:
* `npm run test --workspace=apps/client -- GridOverlay MosaicScene`

Dependencies:
* Step 4.1 completion

## Implementation Phase 5: Wire App State and Preserve Existing Tiles

<!-- parallelizable: false -->

### Step 5.1: Add App-local overlay state and deterministic availability fallback

Add local state containing `enabled` and `patternId`. Derive available patterns from `TILE_SHAPES`, retain the selected pattern when hidden, and repair the selection to the first constructible pattern if the available shape set changes. If no patterns are constructible, disable the overlay and expose a polite status message.

Keep this state separate from `ActiveTileUiState`, sequenced tile state, socket payloads, and session snapshots. Do not persist it to local storage in this issue.

Files:
* apps/client/src/App.tsx - Own grid preference state, derive available patterns, and compose controls

Success criteria:
* Toggling visibility or changing pattern never mutates `sequencedState.tiles`
* Hiding and re-enabling restores the same selected pattern
* Active tile shape, color, material, rotation, and mirroring remain unchanged
* No grid fields are emitted in `PlaceTilePayload` or collaboration events

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 120-168) - State boundary and preservation decisions
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 318-327) - Recommended App state

Dependencies:
* Implementation Phases 1 and 3

### Step 5.2: Recompute the ghost from the last pointer when guide inputs change

Store the last canvas pointer world position in a ref. Centralize ghost resolution so pointer movement and guide-input changes call the same `updateGhostTarget` path. Recompute from the last pointer when enabled state, selected pattern, active shape, settled tiles, or bounds change.

Update the existing active rotation/mirror effect so it does not overwrite slot-owned orientation while the guide is enabled. When the guide is disabled, preserve the current behavior that immediately reflects active-tile rotation and mirror changes in the ghost.

Files:
* apps/client/src/App.tsx - Last-pointer ref, guide derivation, shared ghost update, and orientation-effect guard

Success criteria:
* Switching pattern updates the visible target without requiring pointer movement
* Changing to an incompatible shape immediately marks the ghost invalid and updates status
* Active-tile orientation is restored as the source of ghost orientation after disabling the guide
* Existing tile changes reclassify or move the guided target without modifying settled transforms

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 159-164) - Strict slot transform and preserved active orientation
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 430-440) - App wiring and ghost recomputation

Dependencies:
* Implementation Phase 2
* Step 5.1 completion

### Step 5.3: Compose controls and scene overlay responsively

Place GridOverlayControls in a compact canvas-local toolbar and pass the active guide, nearest slot, settled tiles, and current pattern into MosaicScene. Add responsive styles that wrap or compact the pattern chooser without obscuring the central canvas or creating horizontal overflow.

Reuse the existing `--touch-target-min` token. Provide visible focus, pressed, selected, active-slot, and blocked-slot cues that do not rely on hue alone and meet non-text contrast requirements.

Files:
* apps/client/src/App.tsx - Compose controls and pass overlay props
* apps/client/src/App.css - Canvas-local control layout, responsive behavior, and state styling
* apps/client/src/render/MosaicScene.tsx - Receive and forward active overlay data

Success criteria:
* Controls remain usable at desktop and narrow responsive breakpoints
* Interactive targets remain at least 44 by 44 CSS pixels
* No horizontal document overflow is introduced at 320px viewport width
* Overlay is available independently of the palette's open/collapsed state
* Reduced-motion mode does not add overlay animation

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 146-151) - Responsive and input constraints
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 292-298) - Sizing and responsive placement

Dependencies:
* Implementation Phases 3 and 4
* Steps 5.1 and 5.2 completion

### Step 5.4: Add App integration and preservation regressions

Extend App tests to cover state wiring, tile preservation, exact placement payload transforms, hidden-pattern retention, incompatible shapes, optimistic placement, and rejected server acknowledgement.

Files:
* apps/client/src/App.test.tsx - Grid state, placement payload, and reconciliation scenarios

Success criteria:
* Toggling and pattern switching preserve every settled tile object and transform
* `place_tile` sends the selected slot position, rotation, and mirrored value
* A rejected acknowledgement removes only the optimistic tile and preserves guide selection
* The guide-disabled path continues to send the existing raw-pointer transform
* Palette selection and active-tile persistence regressions continue to pass

Validation commands:
* `npm run test --workspace=apps/client -- App controller GridOverlayControls`

Dependencies:
* Steps 5.1 through 5.3 completion

## Implementation Phase 6: Documentation and Validation

<!-- parallelizable: false -->

### Step 6.1: Update client documentation

Replace stale hidden-anchor and soft-magnetization claims with the actual behavior: raw-pointer placement by default and optional strict pattern-slot guidance when the overlay is enabled. Document the initial pattern catalog, compatible-shape behavior, local-only state boundary, and unchanged server validation.

Files:
* apps/client/README.md - User-facing controls and placement behavior
* apps/client/IMPLEMENTATION_NOTES.md - Pattern architecture, renderer, controller seam, and authority boundary

Success criteria:
* Documentation no longer claims always-on hidden guidance or soft magnetization
* Guide visibility and pattern selection are clearly described as local editing preferences
* Server overlap, bounds, adjacency, revision, and concurrency validation remain documented as authoritative

Context references:
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 112-116) - Documentation drift
* .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 443-455) - Documentation and server non-goals

Dependencies:
* Implementation Phase 5 completion

### Step 6.2: Run targeted and full client validation

Run the smallest relevant tests after each phase, then execute the complete client checks:
* `npm run lint --workspace=apps/client`
* `npm run test --workspace=apps/client`
* `npm run build --workspace=apps/client`

Manual validation checklist:
* Toggle and select patterns using keyboard, pointer, and current touch input paths
* Pan and zoom while observing viewport-local slot updates
* Confirm the overlay remains behind placed tiles and does not block canvas input
* Confirm selected, focus, placeable, nearest, and blocked states do not rely on color alone
* Confirm no horizontal overflow at 320px and minimum 44px control targets
* Confirm switching and hiding patterns leaves settled tiles unchanged

### Step 6.3: Report blockers and deferred scope

Document any pattern geometry that cannot pass complete fill-sequence tests, WebGL lifecycle issue that requires renderer restructuring, or input conflict that depends on unfinished touch gesture work. Do not expand this implementation into shared server pattern state, persistent user preferences, or the issue #80 multi-pointer gesture contract.

## Dependencies

* React 19, TypeScript, React Three Fiber, and Three.js client stack
* Existing canonical tile geometry and placement validator
* Existing ToggleGroup, TileShapePreview, and responsive design tokens
* Existing Vitest and Testing Library client test stack

## Success Criteria

* At least three constructible patterns are offered from the current tile library
* Enabled guide placement always resolves to an exact typed pattern slot
* Overlay visibility and pattern changes preserve all settled tile data
* Overlay rendering is viewport-cullable, batched, non-interactive, and subordinate to tile content
* Controls are responsive and operable through current keyboard, pointer, and touch paths
* Server contracts and authoritative validation remain unchanged
