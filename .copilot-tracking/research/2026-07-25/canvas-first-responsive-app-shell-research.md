<!-- markdownlint-disable-file -->
---
title: Canvas-First Responsive App Shell Research
description: Evidence-based research and recommended implementation approach for issue #77 introducing a canvas-first responsive shell in apps/client
ms.date: 2026-07-25
ms.topic: reference
---

# Task Research: Canvas-First Responsive App Shell

Issue #77 requests a shell refactor that keeps the canvas dominant, relocates key controls into clearer regions, and moves technical diagnostics behind development-only affordances.

## Task Implementation Requests

* Introduce AppHeader, dedicated responsive palette region, and canvas-local action bar
* Preserve existing lobby, collaboration, camera, placement, and undo behaviors
* Hide zoom tier, world bounds, and solver diagnostics from consumer UI, while preserving developer visibility
* Enforce no horizontal overflow at 320px and above

## Scope and Success Criteria

* Scope: apps/client shell composition, shell CSS, and component extraction/refactoring
* Scope exclusions: mobile bottom sheet behavior and new placement gestures
* Assumptions:
  * Existing behavior tests are the contract for regression safety
  * No server API or schema changes are required
  * #75 dependency behavior is already reflected in this branch baseline
* Success Criteria:
  * Canvas remains the largest visual region at desktop/tablet breakpoints
  * Header contains back navigation, connection summary, collaborator summary, undo
  * Rotate/mirror controls are moved near canvas into a local action bar
  * Diagnostics become debug-only
  * No horizontal overflow at 320px+

## Outline

1. Baseline current shell and control locations
2. Identify state/prop coupling risks
3. Analyze responsiveness and overflow pressure points
4. Evaluate implementation alternatives
5. Select one approach with file-level implementation plan and test strategy

## Potential Next Research

* Confirm final product decision on whether zoom tier and world bounds are fully debug-only
  * Reasoning: current implementation exposes both in always-visible strip
  * Reference: apps/client/src/App.tsx:998, apps/client/src/App.tsx:999
* Confirm whether AppHeader is canvas-only or shared with lobby mode
  * Reasoning: impacts duplication and navigation architecture
  * Reference: apps/client/src/App.tsx:947, apps/client/src/App.tsx:964

## Research Executed

### File Analysis

* apps/client/src/App.tsx
  * Mode split, shell composition, overlay assembly, command callbacks, diagnostic rendering
* apps/client/src/App.css
  * Grid/flex behavior, breakpoints, overlay positioning, overflow constraints
* apps/client/src/ui/ControlsPanel.tsx
  * Current transform/edit actions and palette region placement
* apps/client/src/ui/LobbyScreen.tsx
  * Current lobby-mode navigation and creation controls
* apps/client/src/render/MosaicScene.tsx
  * Camera callbacks, bounds usage, zoom-tier callback behavior
* apps/client/src/network/serverUrl.ts
  * Existing Vite env resolver pattern for introducing debug flag resolver

### Code Search Results

* "status-strip"
  * apps/client/src/App.tsx:993, apps/client/src/App.css:297
* "debug-overlay"
  * apps/client/src/App.tsx:1066, apps/client/src/App.css:409
* "onZoomTierChanged"
  * apps/client/src/App.tsx:1045, apps/client/src/render/MosaicScene.tsx:357
* "onUndo"
  * apps/client/src/App.tsx:986, apps/client/src/ui/ControlsPanel.tsx:26
* "grid-template-columns"
  * apps/client/src/App.css:157

### External Research

* No external sources required
* Evidence is fully repository-grounded

### Project Conventions

* Standards referenced: markdown.instructions.md and writing-style.instructions.md
* Task-mode constraints followed: research-only, subagent-delegated investigation, writes limited to .copilot-tracking/research

## Key Discoveries

### Project Structure

* Canvas mode and lobby mode already have a top-level split in App render flow
  * apps/client/src/App.tsx:947
* Canvas mode currently combines sidebar controls, status strip, collaborator roster, scene, and debug overlay in one branch
  * apps/client/src/App.tsx:964, apps/client/src/App.tsx:992, apps/client/src/App.tsx:1066
* Controls are grouped in ControlsPanel, including rotate/mirror and undo
  * apps/client/src/ui/ControlsPanel.tsx:117, apps/client/src/ui/ControlsPanel.tsx:131

### Implementation Patterns

* App-level state ownership is broad (shape, palette, rotation, mirror, collaborators, camera pan, diagnostics)
  * apps/client/src/App.tsx:199, apps/client/src/App.tsx:201, apps/client/src/App.tsx:203, apps/client/src/App.tsx:223
* Undo exists in both keyboard and button pathways and must remain semantically identical
  * apps/client/src/App.tsx:820, apps/client/src/App.tsx:923, apps/client/src/App.tsx:986
* Debug diagnostics are interaction-gated (`ghostVisible`) but not environment-gated
  * apps/client/src/App.tsx:1066
* Existing env utility pattern (VITE resolver module) is already established
  * apps/client/src/network/serverUrl.ts:1

### Complete Examples

```text
Current canvas mode composition (simplified)

App.tsx
  main.app-shell
    ControlsPanel
    section.canvas-shell
      div.status-strip (connection + collaborators + zoom tier + bounds)
      div.collaborator-roster
      MosaicScene
      div.debug-overlay (ghostVisible only)
```

### API and Schema Documentation

* No contract/schema changes required
* Client-only UI composition and CSS restructuring are sufficient

### Configuration Examples

```text
Existing env resolver precedent

apps/client/src/network/serverUrl.ts
  resolveServerUrl() reads import.meta.env.VITE_SERVER_URL

Candidate addition

apps/client/src/config/debugFlags.ts
  resolveCanvasDebugEnabled() reads import.meta.env.VITE_CANVAS_DEBUG
  and/or import.meta.env.DEV fallback
```

## Technical Scenarios

### Scenario 1: Minimal Relocation in Existing Sidebar-First Grid

Description:
Keep current grid structure and only move transform buttons into canvas area, while retaining most shell architecture.

Requirements:

* Least code churn
* Low regression risk

Preferred Approach:

* Not selected

```text
Potential changes
  - Keep app-shell grid columns as-is
  - Create CanvasActionBar under canvas-shell
  - Leave ControlsPanel mostly intact
```

Implementation Details:

* Pros: small change set
* Cons: does not fully satisfy canvas-first objective and header consolidation intent
* Risk: preserves existing desktop control-rail dominance

#### Considered Alternatives

* Rejected because it under-delivers on acceptance criteria requiring canvas dominance and compact header consolidation

### Scenario 2: Canvas-First Two-Column Grid with New Header and Local Action Bar

Description:
Refactor canvas-mode shell into a header + main region. Main region uses canvas-first grid where canvas gets flexible primary width and palette/control region is constrained.

Requirements:

* Strong alignment with issue #77
* Preserve behavior contracts
* Manageable complexity without drawer-level interaction overhead

Preferred Approach:

* Selected

```text
Target composition (canvas mode)

main.app-shell
  AppHeader
  div.canvas-workspace
    section.canvas-shell
      CanvasActionBar
      status-strip (consumer-safe only)
      collaborator-roster
      MosaicScene
      DebugDiagnostics (debug-gated)
    aside.palette-region
      PaletteControls + shape/create controls
```

Implementation Details:

* Add AppHeader mounted in canvas branch before workspace region
  * insertion anchor: apps/client/src/App.tsx:964
* Extract rotate/mirror/undo controls from ControlsPanel into CanvasActionBar near canvas
  * source actions: apps/client/src/App.tsx:979, apps/client/src/App.tsx:986
  * source UI cluster: apps/client/src/ui/ControlsPanel.tsx:117
* Keep command parity by reusing existing handlers for keybind and button pathways
  * apps/client/src/App.tsx:806, apps/client/src/App.tsx:816, apps/client/src/App.tsx:820
* Split diagnostics into consumer strip vs debug-only details
  * consumer strip keeps connection + concise collaborator summary
  * debug-only includes zoom tier, bounds, solver reason/confidence
  * current diagnostic sources: apps/client/src/App.tsx:998, apps/client/src/App.tsx:999, apps/client/src/App.tsx:1074
* Introduce debug flag resolver utility using existing env-resolver pattern
  * precedent: apps/client/src/network/serverUrl.ts:1
* Rework CSS to canvas-first dominance and overflow safety
  * current grid: apps/client/src/App.css:154
  * add multi-tier breakpoints beyond 960px collapse point: apps/client/src/App.css:371
  * enforce strip item truncation/wrapping strategy similar to StatusIndicator resilient text style
    * apps/client/src/ui/StatusIndicator.css:112

#### Considered Alternatives

* Selected over Scenario 1 because it satisfies acceptance criteria while keeping complexity moderate
* Selected over Scenario 3 because it avoids drawer/focus-management overhead and interaction rework

### Scenario 3: Canvas-Primary with Collapsible/Drawer Palette on Small and Medium Widths

Description:
Convert palette region to a drawer/collapsible panel and make canvas always primary.

Requirements:

* Maximum canvas emphasis
* Tight narrow-screen adaptation

Preferred Approach:

* Not selected

```text
Potential changes
  - ControlsPanel replaced with drawer state machine
  - New keyboard/focus and a11y handling for panel open/close
```

Implementation Details:

* Pros: strongest canvas-first posture
* Cons: highest complexity and interaction risk
* Risk: exceeds issue scope (mobile bottom-sheet behavior out-of-scope)

#### Considered Alternatives

* Rejected because complexity and UX behavior expansion exceed issue scope and raise regression risk

## Selected Approach and Rationale

Selected approach: Scenario 2, canvas-first two-column grid with AppHeader and CanvasActionBar, plus debug-gated diagnostics.

Rationale:

* Matches issue #77 scope and acceptance criteria directly
* Keeps functional behavior intact by reusing existing command/state pathways instead of redesigning them
* Improves layout determinism at desktop/tablet while allowing explicit overflow safeguards at 320px+
* Introduces debug gating using an established configuration pattern already present in client code

## Actionable Implementation Plan

1. Extract `AppHeader` component and mount at canvas mode root
2. Extract `CanvasActionBar` and wire to existing rotate/mirror/undo callbacks
3. Split `ControlsPanel` into palette-focused region and move transform/edit controls out
4. Add `resolveCanvasDebugEnabled()` utility and gate debug diagnostics
5. Reduce consumer status strip to non-technical indicators
6. Update shell CSS to canvas-first grid and add narrow-width overflow protection
7. Update/add tests for header presence, action bar actions, debug gating, and 320px overflow safety

## Test Impact and Coverage Mapping

Behavior contracts to preserve with evidence-backed test anchors:

* Lobby flow: apps/client/src/App.test.tsx:127, apps/client/src/App.test.tsx:140, apps/client/src/App.test.tsx:157
* Collaboration flow: apps/client/src/App.test.tsx:177, apps/client/src/App.test.tsx:268, apps/client/src/App.test.tsx:299
* Camera flow: apps/client/src/App.test.tsx:414, apps/client/src/App.test.tsx:435
* Placement and geometry: apps/client/src/domain/placementSolver.test.ts:12, apps/client/src/domain/tileGeometry.test.ts:11
* Undo semantics: apps/client/src/interaction/controller.test.ts:410, apps/client/src/interaction/controller.test.ts:421

Recommended new tests:

* Header rendering in canvas mode with connection/collaborator summary and undo action
* CanvasActionBar triggers same callbacks as existing keyboard paths
* Debug details hidden by default and visible when debug flag enabled
* Shell does not introduce horizontal overflow at 320px

## Open Questions

* Should AppHeader also appear in lobby mode for visual continuity
* Should zoom tier and bounds be fully removed from consumer strip or optionally summarized
* Should debug flag be build-only or build + runtime override

