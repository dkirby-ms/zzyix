---
applyTo: '.copilot-tracking/changes/2026-07-25/canvas-first-responsive-app-shell-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Canvas-First Responsive App Shell

## Overview

Refactor the client canvas-mode shell into a canvas-first responsive architecture with a dedicated header, local canvas actions, and debug-gated diagnostics while preserving existing behavioral contracts.

## Objectives

### User Requirements

* Introduce AppHeader, dedicated responsive palette region, and canvas-local action bar — Source: .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md
* Preserve existing lobby, collaboration, camera, placement, and undo behaviors — Source: .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md
* Hide zoom tier, world bounds, and solver diagnostics from consumer UI while preserving developer visibility — Source: .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md
* Enforce no horizontal overflow at 320px and above — Source: .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md

### Derived Objectives

* Reuse existing App-level command handlers for rotate, mirror, and undo to avoid semantic drift — Derived from: research findings on shared keyboard/button pathways
* Introduce environment-based debug gating utility aligned with existing Vite env resolver conventions — Derived from: serverUrl resolver precedent
* Partition phase-level validation to avoid redundant global checks during shell refactor steps — Derived from: phased change risk management

## Context Summary

### Project Files

* apps/client/src/App.tsx - Primary shell composition, callback ownership, diagnostics rendering, and mode split
* apps/client/src/App.css - Shell grid, breakpoints, status strip styles, and overflow behavior
* apps/client/src/ui/ControlsPanel.tsx - Current action cluster and palette controls to be split
* apps/client/src/ui/LobbyScreen.tsx - Lobby-mode continuity and navigation expectations
* apps/client/src/render/MosaicScene.tsx - Zoom tier and camera callback integration with App shell
* apps/client/src/network/serverUrl.ts - Pattern precedent for environment resolver utility

### References

* .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md - Canonical task research and selected implementation path
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Prompt requirement for planning workflow and research input usage

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md - Markdown authoring and frontmatter rules
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md - Markdown writing style conventions

## Implementation Checklist

### [x] Implementation Phase 1: Extract shell components and recompose canvas mode

<!-- parallelizable: false -->

* [x] Step 1.1: Add AppHeader and CanvasActionBar components
  * Details: .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md (Lines 11-34)
* [x] Step 1.2: Refactor ControlsPanel into palette-focused region
  * Details: .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md (Lines 35-54)
* [x] Step 1.3: Validate phase changes
  * Run lint and targeted tests for shell composition

### [x] Implementation Phase 2: Apply canvas-first responsive layout and overflow safeguards

<!-- parallelizable: false -->

* [x] Step 2.1: Rework shell CSS to prioritize canvas region
  * Details: .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md (Lines 65-87)
* [x] Step 2.2: Harden status and roster wrapping behavior for narrow widths
  * Details: .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md (Lines 88-104)
* [x] Step 2.3: Validate phase changes
  * Run shell behavior tests and production build
* [x] Step 2.4: Verify 320px overflow requirement explicitly
  * Run viewport-constrained assertion checking `document.documentElement.scrollWidth <= window.innerWidth` at 320px width
  * Details: .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md (Lines 105-118)

### [x] Implementation Phase 3: Gate diagnostics and preserve behavioral contracts

<!-- parallelizable: true -->

* [x] Step 3.1: Add debug flag resolver and gate technical diagnostics
  * Details: .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md (Lines 114-138)
* [x] Step 3.2: Preserve lobby/collaboration/camera/placement/undo contracts through test updates
  * Details: .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md (Lines 139-160)
* [x] Step 3.3: Validate phase changes
  * Run targeted and full client tests

### [x] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation
  * Execute lint, test, and build scripts for project scope
* [x] Step 4.2: Fix minor validation issues
  * Iterate on straightforward lint/build/test issues
* [x] Step 4.3: Report blocking issues
  * Document blockers and recommend additional planning where needed

### [x] Implementation Phase 5: Post-review rework and evidence closure

<!-- parallelizable: false -->

* [x] Step 5.1: Clear session-scoped connection context when returning to lobby
  * Ensure `sessionId` and related realtime state are reset when leaving canvas mode
* [x] Step 5.2: Align AppHeader class naming and style hooks
  * Match component classes to stylesheet selectors and add missing utility classes
* [x] Step 5.3: Replace mocked-shell App tests with real shell component coverage
  * Remove AppHeader/CanvasActionBar/ControlsPanel test doubles and assert real DOM contracts
* [x] Step 5.4: Add debug-enabled diagnostics positive-path assertion
  * Validate `.debug-overlay` appears when debug mode is enabled and pointer activity occurs
* [x] Step 5.5: Re-run full validation and capture outcome
  * Execute lint, test, and build after rework

## Planning Log

See .copilot-tracking/plans/logs/2026-07-25/canvas-first-responsive-app-shell-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Planning Outcomes

* Created artifacts:
  * .copilot-tracking/plans/2026-07-25/canvas-first-responsive-app-shell-plan.instructions.md
  * .copilot-tracking/details/2026-07-25/canvas-first-responsive-app-shell-details.md
  * .copilot-tracking/plans/logs/2026-07-25/canvas-first-responsive-app-shell-log.md
* Deferred scope items:
  * WI-01: Lobby visual continuity alignment
  * WI-02: Runtime debug toggling strategy

## Dependencies

* Client toolchain and scripts defined in apps/client/package.json and root package.json
* Existing App shell behavior tests in apps/client/src/App.test.tsx and related domain/interaction tests
* Vite environment variable support for debug flag resolver

## Success Criteria

* Canvas remains dominant across desktop and tablet breakpoints after shell refactor — Traces to: issue #77 acceptance criteria in research
* AppHeader provides back navigation, connection and collaborator summary, and undo affordance — Traces to: user requirements in research
* CanvasActionBar hosts rotate, mirror, and undo actions using existing callbacks — Traces to: behavior-preservation objective
* Technical diagnostics (zoom tier, world bounds, solver details) are hidden from consumer UI and available in debug mode — Traces to: debug visibility requirement
* No horizontal overflow appears at viewport widths >= 320px — Traces to: responsive safety requirement
