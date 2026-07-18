---
title: Lobby Screen Client Architecture Research
description: Client-side architecture findings and implementation options for adding a lobby before entering the canvas.
author: GitHub Copilot (Researcher Subagent)
ms.date: 2026-07-17
ms.topic: reference
keywords:
  - lobby
  - client-architecture
  - session-bootstrap
  - socketio
  - canvas-entry
estimated_reading_time: 10
---

## Research Scope

This research focused on client architecture in the zzyix repo relevant to adding a lobby screen before canvas entry:

1. Current app entry flow.
2. Session bootstrap behavior.
3. Socket connection lifecycle and session join behavior.
4. Current canvas selection/join behavior.
5. Existing UI component and styling patterns suitable for lobby list + join actions.
6. Implementation options and trade-offs with concrete file-level edit plans.

## Concise Architecture Summary

The client currently has a single-screen flow that immediately bootstraps or reuses a session, opens a Socket.IO connection for that session, and renders the canvas editor UI.

* Entry is direct: main.tsx renders App with no route gating.
* App auto-runs ensureSession on mount, writing sessionId into state.
* Socket connection is created once sessionId is available, with auth `{ sessionId, clientId }`.
* Canvas UI is always rendered; there is no pre-canvas lobby state.
* Server contracts and server implementation already support listing sessions (`GET /sessions`) and creating sessions (`POST /sessions`), so lobby list/join can be client-driven without protocol changes.

## Evidence And Findings

### 1) App Entry Flow (Client)

* Root render is unconditional App mount:
  * apps/client/src/main.tsx:1
  * apps/client/src/main.tsx:6
* App is monolithic and includes all canvas/editor concerns:
  * apps/client/src/App.tsx:35
  * apps/client/src/App.tsx:299

Implication:
* There is currently no state boundary between "arrive in app" and "enter canvas".

### 2) Session Bootstrap (Client)

* App auto-bootstraps session on mount:
  * apps/client/src/App.tsx:64
  * apps/client/src/App.tsx:65
  * apps/client/src/App.tsx:66
* ensureSession behavior:
  * Reads `zzyix_session_id` from sessionStorage and reuses it if present.
    * apps/client/src/network/session.ts:4
    * apps/client/src/network/session.ts:5
  * Otherwise creates session via `POST /sessions`, then stores returned ID.
    * apps/client/src/network/session.ts:7
    * apps/client/src/network/session.ts:11

Implication:
* The current behavior effectively auto-joins the previously used session in this tab, or auto-creates a new session when no tab-scoped session exists.

### 3) Socket Connection And Join Behavior

Client hook behavior:
* Socket connection is gated by non-null sessionId:
  * apps/client/src/network/useSocketConnection.ts:27
* Connection auth passes sessionId and clientId:
  * apps/client/src/network/useSocketConnection.ts:29
  * apps/client/src/network/useSocketConnection.ts:30
* Subscribed server events:
  * apps/client/src/network/useSocketConnection.ts:50
  * apps/client/src/network/useSocketConnection.ts:51
  * apps/client/src/network/useSocketConnection.ts:52
  * apps/client/src/network/useSocketConnection.ts:54

Contract and server evidence for room join/snapshot:
* Contracts document join and first snapshot behavior:
  * apps/server/src/contracts.ts:171
  * apps/server/src/contracts.ts:172
* Event maps include snapshot/placement/removal and presence events:
  * apps/server/src/contracts.ts:324
  * apps/server/src/contracts.ts:330
  * apps/server/src/contracts.ts:336
  * apps/server/src/contracts.ts:338
  * apps/server/src/contracts.ts:346
  * apps/server/src/contracts.ts:348
* Server uses room join and snapshot on connect:
  * apps/server/src/index.ts:547
  * apps/server/src/index.ts:549
  * apps/server/src/index.ts:557
  * apps/server/src/index.ts:558

Implication:
* A lobby can safely delay socket creation until explicit join selection by controlling when sessionId is set.

### 4) Current Canvas Selection/Join Behavior

Observed behavior:
* There is no list/select UI for canvases.
* User enters canvas as soon as session bootstrap resolves.
* App renders ControlsPanel + MosaicScene regardless of source of sessionId:
  * apps/client/src/App.tsx:302
  * apps/client/src/App.tsx:326
  * apps/client/src/App.tsx:332

Implication:
* "Selection" is currently implicit via persisted tab session storage rather than explicit user choice.

### 5) Existing UI Components/Patterns Suitable For Lobby

Reusable component/layout patterns:
* Sidebar container pattern (`<aside className="controls-shell">`) already supports grouped sections, buttons, and small explanatory copy:
  * apps/client/src/ui/ControlsPanel.tsx:50
  * apps/client/src/ui/ControlsPanel.tsx:54
  * apps/client/src/ui/ControlsPanel.tsx:70
* Button style states (`button`, `button.active`, `button:disabled`) already defined globally in App.css:
  * apps/client/src/App.css:92
  * apps/client/src/App.css:108
  * apps/client/src/App.css:113
* Grid split shell (`app-shell`) can host lobby+preview variants with same visual language:
  * apps/client/src/App.css:16
  * apps/client/src/App.css:19
* Main content card (`canvas-shell`) can be repurposed for session list panel or lobby details panel:
  * apps/client/src/App.css:135

Implication:
* A lobby can be introduced with minimal visual churn by reusing `controls-shell`, section blocks, pill-row/button patterns, and app-shell two-column layout.

## Client-Side Implementation Options

### Option 1: In-App Mode Switch (Minimal Change)

Approach:
* Keep App.tsx as orchestrator.
* Add `viewMode` state (`'lobby' | 'canvas'`).
* On initial load, fetch sessions list and render lobby first.
* User picks existing session or creates a new one, then set sessionId and switch to canvas mode.
* Keep existing canvas logic mostly unchanged.

Suggested edits by file:
* apps/client/src/network/session.ts
  * Add `listSessions(): Promise<ListSessionsResponse['canvases']>` using `GET /sessions`.
  * Add small helpers: `getStoredSessionId`, `setStoredSessionId`, `clearStoredSessionId` to avoid hidden side effects in ensureSession.
* apps/client/src/App.tsx
  * Replace auto-ensureSession effect with lobby bootstrap effect that loads session list.
  * Add explicit handlers: `handleJoinSession(sessionId)`, `handleCreateSession()`.
  * Render branch:
    * `viewMode === 'lobby'` -> render new LobbyScreen.
    * `viewMode === 'canvas'` -> existing controls/canvas tree.
  * Keep `useSocketConnection` gated by sessionId (already true).
* apps/client/src/ui/LobbyScreen.tsx (new)
  * Present list of canvases and actions: Join, Refresh, Create New.
  * Reuse classes (`controls-shell`, `pill-row`, button active styles) for consistency.
* apps/client/src/App.css
  * Add lobby-specific classes only where needed (`lobby-shell`, `session-list`, `session-row`).

Trade-offs:
* Pros: Fastest path, smallest diff, low risk to canvas behavior.
* Cons: App.tsx grows further; harder to maintain long-term separation of concerns.

### Option 2: Split Into LobbyPage + CanvasPage (Cleaner Architecture)

Approach:
* Refactor current canvas/editor logic from App.tsx into `CanvasPage.tsx`.
* Keep App.tsx as lightweight state router between LobbyPage and CanvasPage.
* LobbyPage owns list/create/join UX and returns selected sessionId upward.

Suggested edits by file:
* apps/client/src/App.tsx
  * Reduce to high-level shell state: `selectedSessionId`, `clientId`, `appStage`.
  * Render `LobbyPage` until session selected; then render `CanvasPage`.
* apps/client/src/ui/LobbyPage.tsx (new)
  * Uses network/session APIs for list/create/select.
  * Optional manual session ID input for deep-link handoff.
* apps/client/src/canvas/CanvasPage.tsx (new)
  * Move current scene/controls/socket/placement logic from App.tsx.
  * Receives `sessionId`, `clientId`, `onLeaveSession`.
* apps/client/src/network/session.ts
  * Add list/get/set helpers (same as Option 1), avoid auto-create side effects during app init.
* apps/client/src/App.css
  * Keep shared tokens and shell styles; add page-specific classes if required.

Trade-offs:
* Pros: Better boundaries, easier testing, easier future features (presence roster, reconnect banners, lobby filters).
* Cons: Larger refactor and regression surface than Option 1.

### Option 3: URL-Driven Lobby + Session Deep Link (Best UX Flexibility)

Approach:
* Add `?session=<id>` support.
* If URL has session, open canvas directly.
* If URL has no session, show lobby with list and create.
* Selecting from lobby updates URL and persists in sessionStorage.

Suggested edits by file:
* apps/client/src/App.tsx
  * Parse query param on boot.
  * Set/replace URL on join/create.
* apps/client/src/network/session.ts
  * Same helper expansions.
* apps/client/src/ui/LobbyScreen.tsx (new)
  * Same list/join/create UI as above.

Trade-offs:
* Pros: Shareable links and explicit navigation semantics.
* Cons: Slightly more state synchronization complexity (URL + storage + React state).

## Recommended Path For Handoff

Recommendation: Option 1 for immediate delivery, then evolve to Option 2 when adding more lobby/presence features.

Why:
* The current architecture already gates socket by `sessionId`, so delaying session assignment is enough to insert a lobby.
* Existing CSS and panel patterns minimize visual and implementation overhead.
* Server endpoint support for session list already exists, reducing backend dependency risk.

## Implementation-Ready Edit Plan (Option 1)

1. Add session list and storage helpers.
   * File: apps/client/src/network/session.ts
   * Add:
     * `listSessions()` -> GET `/sessions`, returns `canvases`.
     * `getStoredSessionId()` / `setStoredSessionId()` / `clearStoredSessionId()`.
2. Create lobby component.
   * File: apps/client/src/ui/LobbyScreen.tsx (new)
   * Props:
     * `sessions`, `isLoading`, `error`, `onRefresh`, `onJoin`, `onCreate`.
3. Integrate lobby mode in app entry.
   * File: apps/client/src/App.tsx
   * Remove automatic `ensureSession().then(setSessionId)` mount effect.
   * Add lobby boot effect to fetch list.
   * Set session only from explicit user actions.
4. Add minimal lobby styles.
   * File: apps/client/src/App.css
   * Add list row/card styles that reuse current button and panel tokens.
5. Follow-up tests.
   * File: apps/client/src/App.test.tsx (new or equivalent setup)
   * Validate:
     * No socket connection until join/create action.
     * Join sets sessionId and renders canvas.
     * Create session path sets storage + enters canvas.

## Risks And Mitigations

* Risk: Existing users expect auto-reopen of last tab session.
  * Mitigation: In lobby, show "Resume last session" action if stored session exists.
* Risk: Socket/canvas logic depends on immediate session availability.
  * Mitigation: Existing null-guard in useSocketConnection already prevents early connect.
* Risk: App.tsx complexity growth (Option 1).
  * Mitigation: Keep lobby logic isolated in new component and thin helper functions.

## Clarifying Questions

1. Should lobby default behavior resume stored session automatically, or always require explicit click?
2. Should lobby display additional metadata per canvas (tile count, updatedAt), or only session ID initially?
3. Should users be able to manually paste a session ID to join private canvases?
4. Is URL deep-linking (`?session=`) required in this iteration or deferred?

## Status

Research complete for client architecture and implementation options relevant to adding a lobby before canvas entry.
