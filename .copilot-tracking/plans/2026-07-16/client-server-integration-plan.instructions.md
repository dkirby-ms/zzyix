---
applyTo: '.copilot-tracking/changes/2026-07-16/client-server-integration-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Client-Server Integration (Issue #12)

## Overview

Integrate the React/WebGL client with the authoritative Socket.IO server by adding optimistic tile placement, ack-based reconciliation, broadcast event handling, undo via `remove_tile`, and session lifecycle management.

## Objectives

### User Requirements

* Apply local tile operations optimistically (show immediately, resolve against server ack) — Source: Issue #12, research — Complete Examples: Optimistic place in App.tsx
* Handle `place_tile` ack outcomes: accepted (swap temp → server tile) and rejected (remove + `invalidPulse`) — Source: Issue #12 / research — Technical Scenarios: Scenario A (Optimistic Placement with Temp-ID Swap)
* Handle incoming `tile_placed` / `tile_removed` broadcasts via `reconcileSequenced*` functions — Source: Issue #12 / research — Technical Scenarios: Scenario D (Broadcast Reconciliation from Peers)
* Rebase pending operations after remote updates via gap detection (already in controller.ts) — Source: Issue #12 / research — Technical Scenarios: Scenario D
* Session lifecycle: create/join session, connect socket, reconnect — Source: Issue #12 / research — Technical Scenarios: Scenario B (Session Lifecycle and Socket Connection)
* Cover failure and rollback paths in tests — Source: Issue #12 / research — Testing Strategy table

### Derived Objectives

* Add `socket.io-client` to `apps/client/package.json` — Required before any socket code can compile
* Create `apps/client/src/network/session.ts` for REST session bootstrap — Isolates network concerns from React component
* Create `apps/client/src/network/useSocketConnection.ts` typed socket hook — Centralizes socket lifecycle management
* Replace `useState<TileInstance[]>` in App.tsx with `useState<SequencedTilesState>` — Required to use existing reconciler infrastructure
* Implement race-condition-safe ack handler (unconditionally remove temp tile first) — Derived from research Subagent 1 finding: `tile_placed` broadcast is sent to sender; ack may arrive after broadcast
* Implement `isServerTileId` UUID guard for undo safety — Prevents `remove_tile` for pending (unacknowledged) tiles
* Disable `onClear` when connected or replace with sequential `remove_tile` calls — Server has no bulk-clear event

## Context Summary

### Project Files

* `apps/client/src/App.tsx` - Current local-only state and placement logic; full socket integration goes here
* `apps/client/src/interaction/controller.ts` - Contains all reconciler infrastructure (lines 9–210); `tryPlaceTile` generates temp IDs (line 181)
* `apps/client/src/interaction/controller.test.ts` - Existing unit tests for controller (lines 1–80+); new socket tests added here
* `apps/client/package.json` - Missing `socket.io-client` dependency (lines 1–40)
* `apps/server/src/contracts.ts` - Authoritative event/payload type definitions; import target for client types
* `apps/server/src/index.ts` - Socket.IO event handlers; `tile_placed` broadcast sent to ALL room members including sender (line 525)

### References

* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` — Full research including subagent findings, scenarios, code examples
* `.copilot-tracking/research/subagents/2026-07-16/socket-reconnect-and-race.md` — Ack-vs-broadcast race analysis (Subagent 1)
* `.copilot-tracking/research/subagents/2026-07-16/tiletype-and-store.md` — TileInstance type and store design (Subagent 2)

### Standards References

* `apps/server/src/contracts.ts` (lines 300–330) — Formal client-server agreement; client commitments listed explicitly

## Implementation Checklist

### [x] Implementation Phase 1: Foundation

<!-- parallelizable: false -->

* [x] Step 1.1: Add `socket.io-client` to client dependencies
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 15–30)
* [x] Step 1.2: Create `apps/client/src/network/session.ts`
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 32–70)
* [x] Step 1.3: Create `apps/client/src/network/useSocketConnection.ts`
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 72–120)
* [x] Step 1.4: Add `VITE_SERVER_URL` env var to `.env` and `.env.example`
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 122–140)
* [x] Step 1.5: Validate phase changes
  * Run `npm install` in `apps/client/` — installs socket.io-client
  * Run `npm run lint` in `apps/client/`
  * Run `npm run build` in `apps/client/` — should compile new network files with no errors

### [x] Implementation Phase 2: App.tsx Integration

<!-- parallelizable: false -->

* [x] Step 2.1: Replace tile state with `SequencedTilesState`
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 145–175)
* [x] Step 2.2: Add session bootstrap and socket connection
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 177–215)
* [x] Step 2.3: Wire `session_snapshot` → `applySequencedSnapshot`
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 217–235)
* [x] Step 2.4: Replace `attemptPlace` with two-phase optimistic placement
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 237–295)
* [x] Step 2.5: Wire `tile_placed` / `tile_removed` broadcast handlers
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 297–340)
* [x] Step 2.6: Export `isServerTileId` from `controller.ts`; replace undo/clear with `remove_tile` socket calls
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 342–390)
* [x] Step 2.7: Update ControlsPanel tile count reference
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 392–405)
* [x] Step 2.8: Validate phase changes
  * Run `npm run build` in `apps/client/` — type-check full App.tsx

### [ ] Implementation Phase 3: Tests

<!-- parallelizable: false -->

* [ ] Step 3.1: Add socket integration tests to `controller.test.ts`
  * Details: .copilot-tracking/details/2026-07-16/client-server-integration-details.md (Lines 410–490)
* [ ] Step 3.2: Validate test suite passes
  * Run `npm run test` in `apps/client/` — all existing + new tests pass

### [ ] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [ ] Step 4.1: Run full project validation
  * `cd apps/client && npm run lint && npm run build && npm run test`
* [ ] Step 4.2: Fix minor validation issues
  * Iterate on lint errors and type errors; apply fixes directly
* [ ] Step 4.3: Report blocking issues
  * Document issues requiring additional research or server changes

## Planning Log

See `.copilot-tracking/plans/logs/2026-07-16/client-server-integration-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* `socket.io-client` — npm package, must be installed in `apps/client/`
* Running server at `http://localhost:3001` — for manual verification
* `apps/server/src/contracts.ts` — type source; relative import from client
* SCHEMA_VERSION validation deferred — tracked in WI-05 (`.copilot-tracking/plans/logs/2026-07-16/client-server-integration-log.md`)

## Success Criteria

* Placing a tile emits `place_tile`; tile appears immediately; server UUID replaces temp ID on ack — Traces to: User Requirement 1, Scenario A
* Rejected placements remove the optimistic tile and trigger `invalidPulse` — Traces to: User Requirement 2, Scenario A
* `tile_placed` / `tile_removed` broadcasts from peers update local state via sequenced reconciler — Traces to: User Requirement 3, Scenario D
* `session_snapshot` on connect/reconnect resets `SequencedTilesState` via `applySequencedSnapshot` — Traces to: User Requirement 5, Scenario B
* Undo emits `remove_tile` with server UUID for settled tiles; no-op for pending tiles — Traces to: User Requirement 3, Scenario C
* `requiresSnapshot: true` triggers socket reconnect, which re-receives `session_snapshot` — Traces to: User Requirement 4, research Subagent 1
* Race condition handled: ack handler unconditionally strips temp tile before checking server tile presence — Traces to: research Subagent 1 critical finding
* All new test cases pass: optimistic accept, optimistic reject, broadcast dedup, snapshot reset, gap detection, undo settled (`isServerTileId` regex), race condition (broadcast before ack) — Traces to: User Requirement 6, research Subagent 1 critical finding
