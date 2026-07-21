---
title: Subagent Research - Collaboration UX Primitives Implementation
description: Targeted implementation research for unresolved planning gaps on issue #15.
author: GitHub Copilot
ms.date: 2026-07-21
ms.topic: reference
keywords:
  - collaboration
  - presence
  - cursor
  - reconnect
  - validation
estimated_reading_time: 8
---

## Status

* Complete

## Scope

* Baseline used: .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md
* Targeted gaps researched:
  * Exact validation commands for lint/test/build in client and server packages.
  * Existing tests to extend for presence/cursor/selection flows.
  * Reconnect and multi-tab identity edge cases visible in current code.

## Findings

### 1. Exact Validation Commands

Run from repository root:

* Client lint: npm run lint:client
* Client test: npm run test:client
* Client build: npm run build:client
* Server lint: npm run lint:server
* Server test: npm run test:server
* Server build: npm run build:server

Evidence:

* package.json:18
* package.json:19
* package.json:21
* package.json:22
* package.json:25
* package.json:26

Package-local equivalents:

* Client package scripts:
  * npm run lint
  * npm run test
  * npm run build
  * Evidence: apps/client/package.json:8, apps/client/package.json:9, apps/client/package.json:11
* Server package scripts:
  * npm run lint
  * npm run test
  * npm run build
  * Evidence: apps/server/package.json:8, apps/server/package.json:9, apps/server/package.json:15

### 2. Existing Tests to Extend for Presence/Cursor/Selection

Most suitable existing tests for extension:

* Server presence/reconnect behavior already covered in integration unit-level tests:
  * initialize participant presence: apps/server/src/index.integration.test.ts:93
  * finalize participant presence: apps/server/src/index.integration.test.ts:123
  * reconnect snapshot behavior: apps/server/src/index.integration.test.ts:55
  * multi-client snapshot parity: apps/server/src/index.integration.test.ts:266
* Client snapshot/reconnect attribution behavior already covered in controller tests:
  * placedBy retention through snapshot: apps/client/src/interaction/controller.test.ts:380
  * revision propagation in sequenced broadcast handling: apps/client/src/interaction/controller.test.ts:342

High-value extension targets for issue #15:

* apps/server/src/index.integration.test.ts
  * Add tests for pointer event fanout semantics (sender excluded, peers receive pointer_update).
  * Add tests for join/leave event payload correctness for client_joined and client_left.
  * Add tests for same-client multi-socket behavior (current code may incorrectly emit client_left when one tab disconnects).
* apps/client/src/App.test.tsx
  * Add tests that session_snapshot clients are rendered in presence UI once implemented.
  * Add tests for client_joined/client_left transitions in local collaborator state.
* apps/client/src/network/useSocketConnection.ts (new test file likely needed)
  * Add coverage verifying subscriptions/unsubscriptions for pointer_update, client_joined, client_left.
  * Current hook only wires session_snapshot/tile_placed/tile_removed/resync_required events.

Evidence for current missing client subscriptions:

* apps/client/src/network/useSocketConnection.ts:51
* apps/client/src/network/useSocketConnection.ts:52
* apps/client/src/network/useSocketConnection.ts:53
* apps/client/src/network/useSocketConnection.ts:55

### 3. Reconnect and Multi-tab Identity Edge Cases

Observed edge cases from current implementation:

* Client identity is persisted in localStorage, so tabs share the same clientId on the same origin.
  * apps/client/src/network/session.ts:89
  * apps/client/src/network/session.ts:93
* Session selection is stored in sessionStorage, which is per-tab; identity and session affinity are split across storage scopes.
  * apps/client/src/network/session.ts:30
  * apps/client/src/network/session.ts:33
* Server presence row uses (canvasId, clientId) uniqueness and upsert, not per-socket presence.
  * apps/server/src/db/repository.ts:358
  * apps/server/src/db/repository.ts:359
  * apps/server/src/db/repository.ts:360
* On disconnect, server marks participant left by clientId and emits client_left immediately, regardless of other live sockets with same clientId.
  * apps/server/src/index.ts:994
  * apps/server/src/index.ts:995
  * apps/server/src/db/repository.ts:366
  * apps/server/src/db/repository.ts:371

Likely user-visible risk:

* If two tabs share one clientId and one tab disconnects first, the remaining tab can be treated as left in persisted presence and peers can see a false client_left event.

Additional reconnect constraints:

* Socket reconnection attempts are capped at 5 in the client hook.
  * apps/client/src/network/useSocketConnection.ts:36
* App snapshot handler currently applies only tile/revision data and ignores snapshot clients, so reconnect presence is not surfaced in UI.
  * apps/client/src/App.tsx:146
  * apps/client/src/App.tsx:149
  * apps/client/src/App.tsx:150
  * apps/client/src/App.tsx:151

## Planning Implications

* Presence implementation should model connection instances per clientId, or track active socket count before emitting client_left.
* Presence UI state should be initialized from session_snapshot.clients and then reconciled from client_joined/client_left events.
* Pointer/cursor telemetry tests should include reconnect and rapid connect/disconnect churn to prevent ghost users/cursors.

## Remaining Gaps and Questions

* Should identity be per-browser-profile (shared localStorage clientId) or per-tab (distinct IDs)?
* Should server emit client_left only when no sockets remain for a clientId in a session room?
* Desired pointer update cadence and throttling target for moderate contention (for example 20 Hz or 30 Hz) is not yet specified.

## Recommended Next Research (Not Completed Here)

* Add a small Socket.IO room-membership experiment to confirm expected behavior for multiple sockets with same auth clientId.
* Validate whether selection indicators should be rendered in Three.js scene space or DOM overlay for best frame-time under contention.
* Define explicit stale-cursor TTL policy and verify against reconnect delays.
