<!-- markdownlint-disable-file -->
# Implementation Details: Consolidate Active Tile and Palette UI State

## Context Reference

Sources: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md, .copilot-tracking/research/subagents/2026-07-26/active-tile-palette-state-repo-analysis.md, attached repository metadata, and repository workspace inspection of the apps/client code path.

## Implementation Phase 1: Introduce typed UI state slices

<!-- parallelizable: false -->

### Step 1.1: Introduce a reducer-backed active-tile model in App.tsx

Replace the current primitive shape, material, paletteName, color, rotation, and mirrored state variables in apps/client/src/App.tsx with one reducer-backed active-tile state object. Keep the typed ActiveTile shape consistent with apps/client/src/interaction/controller.ts so placement helpers continue to consume the same model. Keep initialization values equivalent to the current defaults and expose actions for shape, color, material, rotation, and mirror updates.

Files:
* apps/client/src/App.tsx - Replace primitive selection state with one reducer-backed active-tile slice
* apps/client/src/interaction/controller.ts - Read-only reference for the canonical ActiveTile type

Discrepancy references:
* Addresses DR-01 by eliminating duplicate tile-configuration sources of truth.

Success criteria:
* App.tsx has one typed active-tile state source and no parallel primitive selection state.
* The reducer actions map cleanly to the same updates now performed by keyboard and palette handlers.

Context references:
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 122-124, 204-214) - Current primitive state and reducer-backed recommendation
* apps/client/src/interaction/controller.ts (Lines 39-46) - Canonical ActiveTile type

Dependencies:
* Existing TypeScript strictness in apps/client
* Existing placement helpers that already accept ActiveTile

### Step 1.2: Add a dedicated palette UI slice for open/collapsed state and fallback messaging

Introduce palette-specific UI state separate from the active-tile model. Store whether the palette is open or collapsed, and keep palette fallback announcement text in the UI slice rather than mixing it into collaborative state. Preserve the current color preservation or fallback behavior while routing palette changes through typed actions or a small helper that updates both active-tile and palette UI state together.

Files:
* apps/client/src/App.tsx - Add palette UI state and update palette handlers
* apps/client/src/ui/TilePalette.tsx - Accept the new open/collapsed state and callback props if the surface renders the toggle itself

Discrepancy references:
* Addresses DR-02 by explicitly creating the palette UI state that the codebase currently lacks.

Success criteria:
* Palette open/collapsed state is owned in the client UI layer and not in domain or socket state.
* Palette fallback messaging remains deterministic and does not become a second source of truth for selection.

Context references:
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 115-118, 204-214) - Need to keep non-domain UI state isolated and preserve scene behavior
* apps/client/src/App.tsx (Lines 202-261) - Existing selection and fallback state that will be consolidated

Dependencies:
* Step 1.1 completion

### Step 1.3: Keep gesture and pointer transient state separate from domain and network state

Preserve the current ghost, invalidPulse, cameraPan, and zoomTier behavior, but group any gesture-only fields into a distinct transient UI slice so they are clearly separate from collaboration/session state. Do not move socket, sequenced canvas, or remote collaborator state into this slice. If a small helper or local reducer improves clarity for gesture state, keep it limited to the client UI boundary and do not change gesture semantics.

Files:
* apps/client/src/App.tsx - Separate transient gesture state from collaborative state ownership
* apps/client/src/render/MosaicScene.tsx - Read-only behavior reference for pointer-button gesture handling

Discrepancy references:
* Addresses DR-03 by making the state boundary between UI gestures and collaborative state explicit.

Success criteria:
* Pointer gesture and camera UI state are isolated from sequenced canvas and socket state.
* No gesture behavior changes are introduced while refactoring ownership.

Context references:
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 115-131) - Current placement, gesture, and collaborative state split
* apps/client/src/render/MosaicScene.tsx (Lines 223-271) - Existing right-button and middle-button gesture paths

Dependencies:
* Step 1.1 completion

## Implementation Phase 2: Wire active-tile transitions through App handlers

<!-- parallelizable: false -->

### Step 2.1: Replace primitive tile setters with typed reducer actions in palette and keyboard handlers

Update App.tsx so palette selections, keyboard shortcuts, and mirror or rotation mutations dispatch typed reducer actions rather than calling individual primitive setters. Preserve the existing key bindings: R and Shift+R for quarter-turn rotation, [ and ] for fine rotation, F for mirror, and Z for undo. Keep keyboard shortcuts behaviorally stable while changing the state update path underneath them.

Files:
* apps/client/src/App.tsx - Replace direct setShape, setColor, setMaterial, setRotation, and setMirrored calls with reducer dispatches

Discrepancy references:
* Addresses DD-01 by keeping keyboard semantics unchanged while changing the internal state ownership model.

Success criteria:
* Keyboard shortcuts continue to apply the same visible state changes as before.
* Palette and keyboard actions share one typed transition path for active-tile updates.

Context references:
* apps/client/src/App.tsx (Lines 828-850) - Current keyboard mutation paths
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 126-131) - Keyboard behavior requirements

Dependencies:
* Step 1.1 completion

### Step 2.2: Preserve the current MosaicScene prop contract while sourcing activeTile from the reducer

Keep the existing split MosaicScene prop behavior in this issue, including activeShape as a separate prop and the ghost payload carrying transform, confidence, color, material, and visibility. The only change in App.tsx should be the source of the active-tile values passed to the scene and placement helpers. Do not widen the scene contract unless a test proves the current contract is already incorrect.

Files:
* apps/client/src/App.tsx - Continue passing scene props through the current contract shape
* apps/client/src/render/MosaicScene.tsx - Read-only contract reference unless a test exposes an unhandled mismatch

Discrepancy references:
* Addresses DD-02 by preserving the split scene contract instead of collapsing it during this task.

Success criteria:
* MosaicScene receives the same shape of props after the refactor.
* The active-tile values passed into scene and placement logic come from the reducer-backed state.

Context references:
* apps/client/src/App.tsx (Lines 1016-1045) - Current scene prop handoff
* apps/client/src/render/MosaicScene.tsx (Lines 1-70) - Current prop contract definition
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 115-118, 204-235) - Scene contract recommendation and selected approach

Dependencies:
* Step 2.1 completion

### Step 2.3: Keep pointer gesture logic and placement behavior unchanged except for the new state source

Verify that updatePointer, attemptPlace, invalid pulse handling, and the right-button or middle-button gesture paths continue to behave the same after the state refactor. Only adjust code if the new state ownership exposes a local type mismatch or stale closure issue. Otherwise keep the placement and gesture logic semantically unchanged so the migration remains focused.

Files:
* apps/client/src/App.tsx - Keep placement and ghost update behavior intact while reading from the new state slices
* apps/client/src/render/MosaicScene.tsx - Read-only behavior reference for pointer button handling

Discrepancy references:
* Addresses DD-03 by limiting the task to state ownership refactoring rather than gesture redesign.

Success criteria:
* Pointer-driven placement and camera gesture behavior remain stable.
* No any casts or new duplicate gesture state sources are introduced.

Context references:
* apps/client/src/App.tsx (Lines 896-927) - Placement and pointer update flow
* apps/client/src/render/MosaicScene.tsx (Lines 223-271) - Gesture implementation to preserve

Dependencies:
* Step 2.2 completion

## Implementation Phase 3: Focused tests and validation

<!-- parallelizable: false -->

### Step 3.1: Add App tests for keyboard shortcuts, palette transitions, and active-tile persistence

Add focused regression tests in apps/client/src/App.test.tsx to cover active-tile updates after keyboard shortcuts, palette open/collapsed transitions, palette color or material changes, and successful placement preserving the active configuration. If needed, add a helper test harness that can inspect the reducer-backed UI state without reaching into implementation internals.

Files:
* apps/client/src/App.test.tsx - Keyboard, palette, and persistence regression coverage

Discrepancy references:
* Resolves DR-04 by covering the keyboard and state-transition gaps identified in research.

Success criteria:
* Tests prove the new reducer-backed active-tile model still reacts to the existing keyboard shortcut set.
* Tests verify palette open/collapsed state transitions without leaking into domain state.
* Tests verify active-tile persistence after successful placement.

Context references:
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 131-142, 215-223) - Current test gaps and recommended coverage
* apps/client/src/App.test.tsx - Existing integration test surface

Dependencies:
* Steps 1.1 through 2.3 completion

### Step 3.2: Add MosaicScene pointer gesture tests for right-drag rotate and middle-drag pan paths if coverage is missing

Add focused pointer interaction tests around the scene interaction plane if existing coverage does not already verify the right-button rotate and middle-button pan branches. Keep these tests narrow and behavior-focused so they validate the existing contract rather than rewriting it.

Files:
* apps/client/src/render/MosaicScene.test.tsx - Pointer gesture regression coverage if needed

Discrepancy references:
* Resolves DR-05 by covering the gesture button-path gaps identified in research.

Success criteria:
* Tests cover right-button rotate drag handling.
* Tests cover middle-button pan handling.

Context references:
* apps/client/src/render/MosaicScene.tsx (Lines 223-271) - Gesture branches under test
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 131-142) - Pointer gesture test gap

Dependencies:
* Step 2.3 completion

### Step 3.3: Validate phase changes

Run focused client tests and a client build for the touched TSX and test files. Keep this validation scoped to the state-consolidation slice unless the results reveal a local type error or a stale test assumption.

Validation commands:
* npm run test --workspace=apps/client -- App - Focused App regression coverage
* npm run test --workspace=apps/client -- MosaicScene - Focused scene gesture coverage if the test file exists
* npm run build --workspace=apps/client - Client bundle compile check

## Implementation Phase 4: Validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all validation commands for the project:
* npm run lint
* npm run lint --workspace=apps/client
* npm run build --workspace=apps/client
* npm run test --workspace=apps/client

### Step 4.2: Fix minor validation issues

Iterate on lint errors, build warnings, and narrowly scoped test failures introduced by the active-tile reducer refactor. Apply fixes directly when they remain local to the client state-slice changes.

### Step 4.3: Report blocking issues

When validation uncovers broader contract changes, document them for follow-on planning rather than widening this implementation into a scene-contract or collaboration refactor.

## Dependencies

* Node.js and npm workspace scripts defined in package.json
* Existing client test infrastructure in apps/client/package.json

## Success Criteria

* The implementation path is concrete enough to execute without re-researching ActiveTile ownership, palette UI state, or gesture boundaries.