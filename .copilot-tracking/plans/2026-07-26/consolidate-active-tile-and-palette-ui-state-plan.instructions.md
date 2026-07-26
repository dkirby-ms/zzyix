---
applyTo: '.copilot-tracking/changes/2026-07-26/consolidate-active-tile-and-palette-ui-state-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Consolidate Active Tile and Palette UI State

## Overview

Consolidate the client tile configuration into one typed active-tile model, move palette open/collapsed and gesture UI state out of collaborative domain state, preserve existing keyboard and scene behavior, and add focused regression tests for Issue #79.

## Objectives

### User Requirements

* Define a typed ActiveTile configuration that unifies shape, color, material, rotation, and mirror. Source: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 1-5, 122-124)
* Separate palette open/collapsed and pointer gesture state from domain/network state. Source: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 1-5, 115-131, 204-214)
* Preserve existing keyboard shortcuts and MosaicScene prop behavior. Source: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 126-131, 115-118)
* Add focused tests for state transitions without introducing any casts or duplicate sources of truth. Source: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 6-10, 131-142)

### Derived Objectives

* Move App.tsx from primitive tile selection state variables to one reducer-backed active-tile source of truth. Derived from: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 122-124, 204-214)
* Keep placement, collaboration, and socket state intact while isolating palette and gesture UI state into a dedicated slice. Derived from: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 115-131)
* Preserve the current MosaicScene contract in this issue to avoid widening the blast radius. Derived from: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 115-118, 228-235)
* Add regression coverage for keyboard, palette, and pointer gesture transitions so the refactor remains behaviorally stable. Derived from: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 131-142, 215-223)

## Context Summary

### Project Files

* apps/client/src/App.tsx - Owns primitive tile state, keyboard handlers, palette switching, placement logic, and scene prop wiring that will become the main refactor target
* apps/client/src/interaction/controller.ts - Already defines the typed ActiveTile model used by placement helpers
* apps/client/src/render/MosaicScene.tsx - Keeps the current split prop contract and owns pointer-button gesture handling that must remain behaviorally stable
* apps/client/src/ui/TilePalette.tsx - Stateless palette control surface that will receive the new palette open/collapsed and selection props
* apps/client/src/App.test.tsx - Best integration surface for keyboard, palette, and persistence regression coverage
* apps/client/src/render/MosaicScene.test.tsx - Best focused surface for pointer-button gesture regressions if existing test coverage is insufficient

### References

* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md - Primary task research and selected approach
* .copilot-tracking/research/subagents/2026-07-26/active-tile-palette-state-repo-analysis.md - Subagent repository analysis supporting state ownership and test gaps
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Prompt requirements for this planning output

### Standards References

* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 204-235) - Selected reducer-based active-tile path and scene contract recommendation
* .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 131-142) - Keyboard and pointer gesture coverage gaps

## Implementation Checklist

### [x] Implementation Phase 1: Introduce typed UI state slices

<!-- parallelizable: false -->

* [x] Step 1.1: Introduce a reducer-backed active-tile model in App.tsx
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 9-29)
* [x] Step 1.2: Add a dedicated palette UI slice for open/collapsed state and fallback messaging
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 31-50)
* [x] Step 1.3: Keep gesture/transient pointer state separate from domain and network state
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 52-67)

### [x] Implementation Phase 2: Wire active-tile transitions through App handlers

<!-- parallelizable: false -->

* [x] Step 2.1: Replace primitive tile setters with typed reducer actions in palette and keyboard handlers
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 75-98)
* [x] Step 2.2: Preserve the current MosaicScene prop contract while sourcing activeTile from the reducer
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 100-114)
* [x] Step 2.3: Keep pointer gesture logic and placement behavior unchanged except for the new state source
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 116-132)

### [x] Implementation Phase 3: Focused tests and validation

<!-- parallelizable: false -->

* [x] Step 3.1: Add App tests for keyboard shortcuts, palette open/collapsed transitions, and active-tile persistence
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 140-162)
* [x] Step 3.2: Add MosaicScene pointer gesture tests for right-drag rotate and middle-drag pan paths if coverage is missing
  * Details: .copilot-tracking/details/2026-07-26/consolidate-active-tile-and-palette-ui-state-details.md (Lines 164-178)
* [x] Step 3.3: Validate phase changes
  * Run focused client tests and a client build for the touched TSX and test files

### [x] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation
  * Execute all lint commands (`npm run lint`, `npm run lint --workspace=apps/client`)
  * Execute build scripts for modified components (`npm run build --workspace=apps/client`)
  * Run tests covering modified code (`npm run test --workspace=apps/client`)
* [x] Step 4.2: Fix minor validation issues
  * Iterate on narrow lint or test failures introduced by the state-slice refactor
* [x] Step 4.3: Report blocking issues
  * Document any remaining contract questions or follow-on UI work that should be planned separately

## Planning Log

See .copilot-tracking/plans/logs/2026-07-26/consolidate-active-tile-and-palette-ui-state-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Existing React 19 + TypeScript + Vite client architecture in apps/client
* Existing typed ActiveTile helpers in apps/client/src/interaction/controller.ts
* Existing client test stack in apps/client/package.json

## Success Criteria

* App.tsx owns one typed active-tile source of truth for shape, color, material, rotation, and mirror, with no duplicate primitive selection state. Traces to: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 122-124, 204-214)
* Palette open/collapsed and pointer gesture state are isolated from collaborative domain and network state. Traces to: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 115-131, 204-214)
* Keyboard shortcuts, placement flow, and MosaicScene behavior remain stable after the refactor. Traces to: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 126-131, 115-118)
* Focused tests cover the state transitions introduced by the reducer-backed UI model. Traces to: .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md (Lines 131-142, 228-235)