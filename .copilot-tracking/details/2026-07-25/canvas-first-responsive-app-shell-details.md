<!-- markdownlint-disable-file -->
# Implementation Details: Canvas-First Responsive App Shell

## Context Reference

Sources: .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md, user request (#prompt:task-plan.prompt.md), issue #77 scope from attached research

## Implementation Phase 1: Extract shell components and recompose canvas mode

<!-- parallelizable: false -->

### Step 1.1: Add AppHeader and CanvasActionBar components

Create dedicated UI components for top-level canvas-mode header and canvas-local transformation actions while keeping behavior bound to existing App command handlers.

Files:
* apps/client/src/ui/AppHeader.tsx - New component for back navigation, connection summary, collaborator summary, and undo affordance
* apps/client/src/ui/CanvasActionBar.tsx - New component for rotate, mirror, and undo controls near canvas
* apps/client/src/ui/index.ts (if present) - Export wiring update only if barrel pattern is already used

Discrepancy references:
* Addresses DR-01 by explicitly implementing AppHeader placement and action mapping

Success criteria:
* Components render from props only and do not own app state
* Existing callback signatures are reused without behavior changes

Context references:
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 170-198) - Selected composition and callback movement
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 50-73) - Existing shell composition and command ownership

Dependencies:
* Existing App.tsx handlers for rotate, mirror, and undo

### Step 1.2: Refactor ControlsPanel into palette-focused region

Move transform and undo controls out of ControlsPanel, keeping palette and shape creation responsibilities in the palette region to support a clear canvas-first workspace split.

Files:
* apps/client/src/ui/ControlsPanel.tsx - Remove rotate/mirror/undo UI cluster and preserve palette and creation controls
* apps/client/src/App.tsx - Mount AppHeader, CanvasActionBar, and palette region structure in canvas mode branch

Success criteria:
* ControlsPanel remains focused on palette and shape input
* Canvas mode render tree contains AppHeader, canvas workspace, and dedicated palette region

Context references:
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 173-189) - Target composition and extraction points
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 68-77) - Current ControlsPanel action cluster

Dependencies:
* Step 1.1 completion

### Step 1.3: Validate phase changes

Run lint and targeted tests for shell composition before proceeding to styling and debug gating changes.

Validation commands:
* cd apps/client && npm run lint - Validate client lint rules after component extraction
* cd apps/client && npm run test -- App.test.tsx --run - Validate core app-shell render behavior

## Implementation Phase 2: Apply canvas-first responsive layout and overflow safeguards

<!-- parallelizable: false -->

### Step 2.1: Rework shell CSS to prioritize canvas region

Update shell grid and breakpoint behavior so canvas remains dominant at desktop and tablet breakpoints, with constrained palette width and predictable small-screen stacking.

Files:
* apps/client/src/App.css - Introduce header/workspace layout, canvas-first two-column behavior, and breakpoint transitions
* apps/client/src/styles/* (if needed) - Add extracted styles only if existing pattern favors file separation

Discrepancy references:
* Addresses DR-02 by implementing explicit 320px+ overflow protections in shell containers

Success criteria:
* Canvas column uses flexible width and remains visually dominant above mobile breakpoints
* Palette region does not force horizontal scrolling in viewport widths >= 320px

Context references:
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 180-189) - Layout target and overflow strategy
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 39-49) - CSS pressure points and breakpoints

Dependencies:
* Implementation Phase 1 completion

### Step 2.2: Harden status and roster wrapping behavior for narrow widths

Apply truncation, wrapping, and min-width constraints for status-strip and collaborator summary content so dynamic text does not create horizontal overflow.

Files:
* apps/client/src/App.css - Status strip, roster, and inline metadata wrapping rules
* apps/client/src/ui/StatusIndicator.css (if needed) - Reuse resilient text handling patterns where applicable

Success criteria:
* Dynamic status content remains readable without causing horizontal overflow at 320px
* Collaborator summary wraps or truncates safely under narrow constraints

Context references:
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 185-189) - Responsive strip strategy

Dependencies:
* Step 2.1 completion

### Step 2.3: Validate phase changes

Run styling-sensitive tests and a production build to confirm CSS and composition changes compile and render.

Validation commands:
* cd apps/client && npm run test -- App.test.tsx --run - Verify app shell behavior after CSS changes
* cd apps/client && npm run build - Validate production bundle generation

### Step 2.4: Verify no horizontal overflow at 320px viewport

Add or update a viewport-constrained UI test that renders the shell at 320px width and asserts no horizontal overflow.

Files:
* apps/client/src/App.test.tsx - Add assertion for `document.documentElement.scrollWidth <= window.innerWidth` under 320px viewport setup

Success criteria:
* Automated test fails when shell introduces horizontal overflow at 320px
* Test passes with canvas-first shell updates applied

Context references:
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 20-35) - Scope and 320px requirement

Dependencies:
* Step 2.2 completion

## Implementation Phase 3: Gate diagnostics and update consumer-safe status output

<!-- parallelizable: true -->

### Step 3.1: Add debug flag resolver and gate technical diagnostics

Introduce a dedicated debug-flag utility using existing environment resolver patterns and gate technical diagnostics (zoom tier, world bounds, solver diagnostics) behind debug-only visibility.

Files:
* apps/client/src/config/debugFlags.ts - New resolver for canvas debug visibility (VITE_CANVAS_DEBUG with DEV fallback)
* apps/client/src/App.tsx - Replace always-on technical diagnostics with debug-gated output

Discrepancy references:
* Addresses DD-01 by using explicit VITE_CANVAS_DEBUG + DEV fallback rather than interaction-only gating

Success criteria:
* Consumer UI omits zoom tier, world bounds, and solver confidence/reason by default
* Debug diagnostics appear only when debug flag resolution enables them

Context references:
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 89-101) - Env resolver precedent and candidate utility
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 190-207) - Selected debug gating rationale

Dependencies:
* Implementation Phase 1 completion

### Step 3.2: Preserve lobby/collaboration/camera/placement/undo contracts through test updates

Update and extend tests to verify header/action bar composition and debug gating while preserving baseline behavior contracts from existing tests.

Files:
* apps/client/src/App.test.tsx - Add assertions for AppHeader, CanvasActionBar actions, and default hidden diagnostics
* apps/client/src/network/serverUrl.ts test style references - Mirror env mocking approach only; do not modify server URL behavior
* apps/client/src/ui/*.test.tsx (optional) - Add component-level smoke tests if coverage is clearer than App-level assertions

Success criteria:
* Existing behavioral tests remain passing for lobby, collaboration, camera, placement, and undo
* New assertions confirm debug diagnostics are hidden by default and enabled when flag is set
* 320px overflow assertion remains passing after diagnostics/header/action-bar updates

Context references:
* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Lines 219-234) - Existing behavior anchors and recommended new tests

Dependencies:
* Step 3.1 completion

### Step 3.3: Validate phase changes

Run targeted and full client test suites to verify regression safety and debug-visibility behavior.

Validation commands:
* cd apps/client && npm run test -- App.test.tsx --run - Verify app-shell and diagnostics assertions
* cd apps/client && npm run test -- --run - Validate complete client test suite

## Implementation Phase 4: Final project validation and handoff readiness

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all validation commands for the project:
* npm run lint
* npm run test -- --run
* npm run build

### Step 4.2: Fix minor validation issues

Iterate on lint errors, build warnings, and test failures. Apply fixes directly when corrections are straightforward and isolated.

### Step 4.3: Report blocking issues

When validation failures require changes beyond minor fixes:
* Document the issues and affected files
* Provide the user with next steps
* Recommend additional research and planning rather than inline fixes
* Avoid large-scale refactoring within this phase

## Dependencies

* Node.js and npm toolchain compatible with repository scripts
* Existing client test infrastructure in apps/client

## Success Criteria

* Canvas-mode shell structure reflects header + canvas workspace + palette region composition
* Rotate/mirror/undo controls are canvas-local without behavior regression
* Technical diagnostics are debug-only with environment-driven gating
* Layout avoids horizontal overflow at viewport widths of 320px and above
