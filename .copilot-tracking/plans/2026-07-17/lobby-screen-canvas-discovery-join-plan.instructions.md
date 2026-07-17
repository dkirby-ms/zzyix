---
applyTo: '.copilot-tracking/changes/2026-07-17/lobby-screen-canvas-discovery-join-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Lobby Screen for Canvas Discovery and Join

## Overview

Implement a lobby-first entry flow that lists available canvases with metadata and allows explicit join or create before websocket canvas participation begins.

## Objectives

### User Requirements

* Add a lobby screen shown when users first connect or login — Source: .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Line 8)
* Display available canvases with metadata including name, connected user count, and canvas size — Source: .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Line 9)
* Allow users to join a selected canvas from the lobby — Source: .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Line 10)

### Derived Objectives

* Keep websocket join path authoritative by delaying socket initialization until `sessionId` is selected — Derived from: Existing `useSocketConnection` null-session guard in research (Lines 47, 51, 139-141)
* Define V1 entry policy as always opening lobby for first-time and returning users with no automatic canvas resume — Derived from: Open decision in research and requirement to show lobby on first connect/login (Lines 8, 37-39)
* Define canonical `canvasSize` metadata as immutable board dimensions object `{width, height}` for every lobby summary row — Derived from: Metadata requirement for canvas size and unresolved semantic ambiguity (Lines 9, 173-180)
* Align server route and contracts for session listing metadata used by lobby — Derived from: Route/comment mismatch identified in research (Lines 53, 60, 82)
* Preserve low-risk delivery by using fallback display naming in V1 and deferring schema migration — Derived from: Research next-step risk and optional migration guidance (Lines 34-36, 183-184)

## Context Summary

### Project Files

* apps/client/src/App.tsx - Current auto-bootstrap flow and primary integration point for lobby gating
* apps/client/src/network/session.ts - Session utilities to extend for list and storage helpers
* apps/client/src/ui - Destination for new lobby screen component
* apps/server/src/index.ts - REST endpoints including session creation and planned list route
* apps/server/src/contracts.ts - Contract and route documentation alignment for lobby summary payload
* apps/server/src/db/repository.ts - Session and participant data source for metadata

### References

* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md - Full task research and selected approach
* .copilot-tracking/details/2026-07-17/lobby-screen-canvas-discovery-join-details.md - Phase execution details for this plan

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md — Required markdown conventions for planning artifacts
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md — Required writing style conventions for markdown artifacts

## Implementation Checklist

### [ ] Implementation Phase 1: Client Lobby Gating and UI

<!-- parallelizable: true -->

* [x] Step 1.1: Gate app entry with lobby mode and explicit join
  * Details: .copilot-tracking/details/2026-07-17/lobby-screen-canvas-discovery-join-details.md (Lines 11-30)
* [x] Step 1.2: Add client session list and storage helper APIs
  * Details: .copilot-tracking/details/2026-07-17/lobby-screen-canvas-discovery-join-details.md (Lines 32-48)
* [x] Step 1.3: Implement `LobbyScreen` component and lobby styles
  * Details: .copilot-tracking/details/2026-07-17/lobby-screen-canvas-discovery-join-details.md (Lines 50-67)
* [ ] Step 1.4: Validate phase changes
  * Run lint and build commands for modified files

### [x] Implementation Phase 2: Server Session Listing and Contract Alignment

<!-- parallelizable: true -->

* [x] Step 2.1: Add or verify `GET /sessions` session summary route
  * Details: .copilot-tracking/details/2026-07-17/lobby-screen-canvas-discovery-join-details.md (Lines 82-99)
* [x] Step 2.2: Implement V1 display-name and `canvasSize` semantics in contracts
  * Details: .copilot-tracking/details/2026-07-17/lobby-screen-canvas-discovery-join-details.md (Lines 101-127)
* [x] Step 2.3: Add server test coverage for lobby metadata
  * Details: .copilot-tracking/details/2026-07-17/lobby-screen-canvas-discovery-join-details.md (Lines 129-146)
* [x] Step 2.4: Validate phase changes
  * Run lint and build commands for modified files

### [ ] Implementation Phase 3: Validation

<!-- parallelizable: false -->

* [x] Step 3.1: Run full project validation
  * Execute all lint commands (`pnpm lint`)
  * Execute build scripts for modified components
  * Run test suites covering modified code
* [x] Step 3.2: Fix minor validation issues
  * Iterate on lint errors and build warnings
  * Apply straightforward corrections directly
* [x] Step 3.3: Report blocking issues
  * Document blockers requiring additional research
  * Provide next-step planning recommendations

## Planning Log

See `.copilot-tracking/plans/logs/2026-07-17/lobby-screen-canvas-discovery-join-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node.js and pnpm workspace scripts
* Existing client/server test harnesses
* API contract consistency between server and client packages

## Success Criteria

* Lobby is the first user-visible screen for both first-time and returning users, and canvas connection starts only after explicit join — Traces to: User requirement (research Lines 8-10) and open policy decision item (Lines 37-39)
* Lobby list shows required metadata fields for each canvas and supports join/create actions — Traces to: Research implementation details (Lines 173-180, 190-198)
* `canvasSize` in lobby metadata uses one canonical shape (`{width, height}` board dimensions) with contract and test coverage — Traces to: Metadata requirement and technical scenario details (Lines 9, 173-180, 186-198)
* Session list route, contracts, and tests are aligned and validated — Traces to: Research mismatch findings (Lines 53-60, 82, 186-198)
