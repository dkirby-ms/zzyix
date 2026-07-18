<!-- markdownlint-disable-file -->
# Implementation Details: Lobby Screen for Canvas Discovery and Join

## Context Reference

Sources: .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 8-10, 14-22, 45-60, 137-198, 224-246)

## Implementation Phase 1: Client Lobby Gating and UI

<!-- parallelizable: true -->

### Step 1.1: Gate canvas bootstrap behind explicit lobby join

Remove automatic session bootstrap on app mount and introduce lobby-first state (`lobby` or `canvas`). Keep websocket initialization dependent on `sessionId` so no socket connects before join.

V1 entry policy for this task: always enter lobby on app load for both first-time and returning users. Stored session id is retained only as a convenience for highlighting or preselecting a previous canvas in the lobby, not for automatic join.

Files:
* apps/client/src/App.tsx - Add mode state, lobby lifecycle, and join/create handlers
* apps/client/src/network/useSocketConnection.ts - Verify null session guard remains unchanged

Discrepancy references:
* Resolves DR-02 by defining explicit no-auto-resume policy for V1

Success criteria:
* First load renders lobby mode by default
* Returning users with stored session id still land on lobby and require explicit join
* Socket initialization remains disabled until `sessionId` is set

Context references:
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 45-52) - Current bootstrap and socket gating behavior
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 160-166) - Recommended join/create flow

Dependencies:
* Existing client session utilities remain available

### Step 1.2: Add lobby session-list API helpers and storage accessors

Expand session networking utilities with list, get/set/clear stored session helpers and reuse current client ID behavior.

Files:
* apps/client/src/network/session.ts - Add `listSessions`, `getStoredSessionId`, `setStoredSessionId`, and `clearStoredSessionId`

Success criteria:
* Lobby can fetch canvases with a typed API helper
* Join action updates storage through helper rather than inline direct storage usage

Context references:
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 48-50) - Existing session helper behavior
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 167-171) - Required helper expansions

Dependencies:
* Step 1.1 completion

### Step 1.3: Implement dedicated lobby screen component and styles

Create a lobby UI component that renders canvas metadata rows and join actions. Wire to App-level handlers and reuse current shell styling where possible.

Files:
* apps/client/src/ui/LobbyScreen.tsx - New lobby component for list and actions
* apps/client/src/App.css - Lobby-specific layout and list styles

Success criteria:
* Lobby displays name, connected user count, and canvas size
* User can join existing canvas and create a new canvas from lobby

Context references:
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 173-180) - Lobby row metadata requirements
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 240-243) - Implementation-ready checklist

Dependencies:
* Steps 1.1 and 1.2 completion

### Step 1.4: Validate phase changes

Run client lint, unit tests, and build for modified files in this phase.

Validation commands:
* pnpm --filter client lint - Client lint scope
* pnpm --filter client test -- --run - Client unit and integration tests
* pnpm --filter client build - Client build validation

## Implementation Phase 2: Server Session Listing and Contract Alignment

<!-- parallelizable: true -->

### Step 2.1: Add or verify `GET /sessions` lobby listing endpoint

Implement or confirm route that returns session summaries with stable fields required by lobby UI.

Files:
* apps/server/src/index.ts - Add or adjust `GET /sessions` response payload
* apps/server/src/db/repository.ts - Provide query helpers for session summary list and connected counts

Success criteria:
* `GET /sessions` returns list payload with id, display name, participant count, and `canvasSize` metadata
* Endpoint output is stable and typed for client consumption

Context references:
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 52-60) - Current route and schema mismatch
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 181-189) - Required server and contract updates

Dependencies:
* Existing session repository and presence lifecycle in server domain

### Step 2.2: Resolve canvas display name policy for V1

Use deterministic fallback display names (for example short session id) for V1 and defer persistent `canvases.name` migration until runtime schema drift is verified.

Define canonical V1 `canvasSize` semantics as immutable board dimensions object `{ width: number, height: number }` sourced from session/canvas configuration defaults rather than dynamic occupancy, tile count, or bounds.

Files:
* apps/server/src/index.ts - Populate `displayName` fallback in summary response
* apps/server/src/contracts.ts - Document and type `displayName` and `canvasSize: { width, height }` explicitly
* .copilot-tracking/plans/logs/2026-07-17/lobby-screen-canvas-discovery-join-log.md - Record path deviation rationale

Discrepancy references:
* Deviates via DD-01 from optional migration-first recommendation in research

Success criteria:
* Lobby receives non-empty name metadata for every listed canvas without DB migration dependency
* Lobby receives `canvasSize` with exact shape `{ width, height }` for every canvas summary
* Contract comments/types reflect real route behavior

Context references:
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 34-39) - Migration safety risk to validate first
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 9, 173-180, 183-188) - Metadata and contract alignment requirements

Dependencies:
* Step 2.1 completion

### Step 2.3: Add or update server tests for lobby metadata

Create test coverage for list endpoint shape and participant count correctness.

Files:
* apps/server/src/index.test.ts - Add route coverage for `GET /sessions`
* apps/server/src/index.integration.test.ts - Validate metadata wiring against repository/presence behavior

Success criteria:
* Tests assert metadata shape including `canvasSize.width` and `canvasSize.height` and participant count values
* Tests assert no implicit join behavior occurs from stored session id without explicit user action (client-side behavior contract)
* Regression protection exists for route and summary payload changes

Context references:
* .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 190-198) - Server testing requirements

Dependencies:
* Steps 2.1 and 2.2 completion

### Step 2.4: Validate phase changes

Run server lint, tests, and build for modified files in this phase.

Validation commands:
* pnpm --filter server lint - Server lint scope
* pnpm --filter server test -- --run - Server test scope
* pnpm --filter server build - Server build validation

## Implementation Phase 3: End-to-End Validation and Minor Fixes

<!-- parallelizable: false -->

### Step 3.1: Run full project validation

Execute all validation commands for modified components and shared root checks.

* pnpm lint
* pnpm test -- --run
* pnpm --filter client build
* pnpm --filter server build

### Step 3.2: Fix minor validation issues

Iterate on lint, build warnings, and test failures that are directly caused by lobby feature changes.

### Step 3.3: Report blocking issues

When failures require larger architectural changes:
* Document blocking issues and impacted files
* Propose next planning scope for follow-up
* Avoid broad refactors inside this implementation task

## Dependencies

* Node.js and pnpm workspace tooling configured
* Existing client and server test harnesses operational

## Success Criteria

* Lobby-first flow is implemented and prevents pre-join socket connection
* Users can discover and join canvases with required metadata
* Server contracts and route behavior are aligned for lobby summary responses
