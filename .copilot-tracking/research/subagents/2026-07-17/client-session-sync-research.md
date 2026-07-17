---
title: Client Session And Sync Architecture Research
description: Research findings on current client-side session identity, optimistic sync, authoritative update consumption, and multi-client gaps for collaborative canvas editing.
author: GitHub Copilot (Researcher Subagent)
ms.date: 2026-07-17
ms.topic: reference
keywords:
  - client-session
  - realtime-sync
  - optimistic-ui
  - socketio
  - collaboration
estimated_reading_time: 12
---

## Research Scope

This research investigated the current client-side session and synchronization architecture for collaborative canvas editing in `/home/saitcho/zzyix`, focused on:

1. How the client manages session identity and lifecycle.
2. How local optimistic operations are queued, applied, and reconciled.
3. How remote authoritative updates are consumed.
4. Assumptions that imply single-client behavior.
5. Concrete gaps for multi-client support.
6. Existing and missing test coverage.

## Sources Reviewed

* apps/client/src/network/session.ts
* apps/client/src/network/useSocketConnection.ts
* apps/client/src/App.tsx
* apps/client/src/interaction/controller.ts
* apps/client/src/interaction/controller.test.ts
* apps/server/src/contracts.ts
* apps/server/src/index.ts
* apps/server/src/index.integration.test.ts
* apps/server/src/index.concurrency.test.ts

## Findings

### 1) Client session identity and lifecycle

The client maintains two identities with different persistence scopes:

* Session identity uses `sessionStorage` and is created via REST when absent.
  * apps/client/src/network/session.ts:3
  * apps/client/src/network/session.ts:4
  * apps/client/src/network/session.ts:7
  * apps/client/src/network/session.ts:11
* Client identity uses `localStorage` and persists across browser restarts.
  * apps/client/src/network/session.ts:15
  * apps/client/src/network/session.ts:16
  * apps/client/src/network/session.ts:20

Lifecycle in `App.tsx`:

* `ensureClientId()` is resolved once with `useMemo`.
  * apps/client/src/App.tsx:49
* `ensureSession()` is executed on mount; `sessionId` gates socket connection.
  * apps/client/src/App.tsx:48
  * apps/client/src/App.tsx:64
  * apps/client/src/App.tsx:127
* Socket auth passes both IDs (`sessionId`, `clientId`) to server handshake.
  * apps/client/src/network/useSocketConnection.ts:28
* Reconnection is enabled but bounded (`reconnectionAttempts: 5`).
  * apps/client/src/network/useSocketConnection.ts:33

Server behavior confirms intended lifecycle:

* Requires both `sessionId` and `clientId` in handshake auth.
  * apps/server/src/index.ts:589
  * apps/server/src/index.ts:599
* On connection, joins the room, sends `session_snapshot`, and broadcasts `client_joined`.
  * apps/server/src/index.ts:629
  * apps/server/src/index.ts:638
  * apps/server/src/index.ts:640
* On disconnect, broadcasts `client_left`.
  * apps/server/src/index.ts:839

### 2) Local optimistic ops queue/apply/reconcile behavior

There is optimistic apply and ack/broadcast reconciliation, but no explicit durable operation queue.

What exists:

* Local placement is optimistic: a temp tile is created and immediately appended to local tiles.
  * apps/client/src/App.tsx:222
  * apps/client/src/App.tsx:230
* Outbound `place_tile` uses a newly generated UUID tile ID for authoritative creation.
  * apps/client/src/App.tsx:239
  * apps/client/src/App.tsx:246
* Ack reconciliation replaces/removes temp tile and updates `lastOpSeq` when accepted.
  * apps/client/src/App.tsx:248
  * apps/client/src/App.tsx:253
  * apps/client/src/interaction/controller.ts:75
* Remove is issued against latest settled server tile.
  * apps/client/src/App.tsx:169
  * apps/client/src/App.tsx:175
  * apps/client/src/App.tsx:258
  * apps/client/src/App.tsx:264

Sequencing model in controller state:

* Local state tracks `tiles`, `lastOpSeq`, and `requiresSnapshot`.
  * apps/client/src/interaction/controller.ts:25
  * apps/client/src/interaction/controller.ts:26
  * apps/client/src/interaction/controller.ts:27
  * apps/client/src/interaction/controller.ts:28
* Incoming seq gap toggles `requiresSnapshot` instead of trying local replay.
  * apps/client/src/interaction/controller.ts:106
  * apps/client/src/interaction/controller.ts:117
  * apps/client/src/interaction/controller.ts:128
  * apps/client/src/interaction/controller.ts:139

What is missing:

* No explicit pending operation log/queue keyed by op id or expected revision on client.
* No replay of unsent/unacked ops after reconnect; snapshot recovery is the only fallback path.
* Client does not send `expectedRevision` precondition even though contract supports it.
  * apps/server/src/contracts.ts:205
  * apps/client/src/App.tsx:238

### 3) Remote authoritative update consumption

The client consumes authoritative state via snapshot and sequenced events:

* Subscribes to `session_snapshot`, `tile_placed`, `tile_removed`.
  * apps/client/src/network/useSocketConnection.ts:48
  * apps/client/src/network/useSocketConnection.ts:49
  * apps/client/src/network/useSocketConnection.ts:50
* Snapshot fully resets sequenced state to server tiles and `lastOpSeq`.
  * apps/client/src/App.tsx:86
  * apps/client/src/App.tsx:87
  * apps/client/src/interaction/controller.ts:69
* `tile_placed` and `tile_removed` are integrated using strict op sequencing.
  * apps/client/src/App.tsx:95
  * apps/client/src/App.tsx:110
  * apps/client/src/interaction/controller.ts:106
  * apps/client/src/interaction/controller.ts:128
* On seq gap, client forces reconnect-disconnect cycle to request fresh snapshot.
  * apps/client/src/App.tsx:76
  * apps/client/src/App.tsx:103
  * apps/client/src/App.tsx:118

Server events carry revision/ordering info (`opSeq`) and actor IDs:

* apps/server/src/contracts.ts:262
* apps/server/src/contracts.ts:268

### 4) Single-client assumptions observed

The following patterns imply a single-actor UX or weak multi-actor semantics:

* Undo removes the latest settled tile globally, not the latest tile placed by this `clientId`.
  * apps/client/src/App.tsx:169
  * apps/client/src/App.tsx:258
* Client subscribes only to tile/snapshot events; it ignores presence/pointer events exposed by contract (`pointer_update`, `client_joined`, `client_left`).
  * apps/server/src/contracts.ts:308
  * apps/server/src/contracts.ts:310
  * apps/server/src/contracts.ts:312
  * apps/client/src/network/useSocketConnection.ts:48
* Placement validation for preview uses local `sequencedState.tiles`, which may be stale between network updates; no visible awareness of concurrent in-flight operations from peers.
  * apps/client/src/App.tsx:207
* Reconnect policy is finite (`5` attempts); prolonged outage risks silent stop of convergence without explicit UI state handling.
  * apps/client/src/network/useSocketConnection.ts:33

### 5) Concrete gaps for multi-client support

Priority gaps inferred from current architecture:

1. Add client-side pending operation queue with deterministic op IDs and resend policy.
   * Current implementation applies optimistic updates but does not keep a replayable queue.
2. Include and enforce `expectedRevision` from client requests to prevent stale writes and support deterministic conflict messaging.
   * Contract supports this, but client does not populate it.
3. Track per-client authored tiles and define undo semantics (`undo mine` vs `undo session`).
   * Current logic always targets latest settled tile regardless of author.
4. Consume presence/pointer events in UI and state, or explicitly remove them from protocol if not planned.
5. Improve reconnection handling UX and reliability:
   * expose offline/reconnecting/error state,
   * retry strategy beyond fixed attempt count or user-driven retry.
6. Add explicit conflict-resolution UX for rejected acks by reason (`OVERLAP`, `STALE_REVISION`, etc.).
   * client currently treats all rejections similarly in placement path.

### 6) Existing tests and missing tests

Client-side tests currently present:

* Sequenced snapshot/reset and gap detection in placement/removal reconciliation.
  * apps/client/src/interaction/controller.test.ts:89
  * apps/client/src/interaction/controller.test.ts:100
  * apps/client/src/interaction/controller.test.ts:130
* Optimistic ack replacement/rejection paths.
  * apps/client/src/interaction/controller.test.ts:154
  * apps/client/src/interaction/controller.test.ts:189
  * apps/client/src/interaction/controller.test.ts:211
* Utility guardrails (server tile ID validation and UUID generation).
  * apps/client/src/interaction/controller.test.ts:239
  * apps/client/src/interaction/controller.test.ts:245

Server-side tests relevant to sync semantics:

* Authoritative snapshot initialization and reconnect snapshot behavior.
  * apps/server/src/index.integration.test.ts:13
  * apps/server/src/index.integration.test.ts:45
* Deterministic first-write-wins and remove idempotency at authoritative layer.
  * apps/server/src/index.concurrency.test.ts:5
  * apps/server/src/index.concurrency.test.ts:36
  * apps/server/src/index.concurrency.test.ts:103

Notable missing tests for the requested area:

* No client integration tests around `App.tsx` socket lifecycle (`ensureSession`, connect, reconnect, snapshot refresh).
* No tests for client behavior when socket is unavailable after optimistic local add (tile remains temp indefinitely risk).
* No tests for `expectedRevision` usage from client (currently absent).
* No tests for handling specific rejection reasons and user-visible conflict feedback.
* No tests for multi-client undo semantics (author-aware vs global latest).
* No tests for presence/pointer events from socket on client side.
* No end-to-end tests that run two browser clients against one session and verify convergence under interleavings.

## Key Evidence Summary

* Identity bootstrap and persistence split between session and client IDs:
  * apps/client/src/network/session.ts:3
  * apps/client/src/network/session.ts:15
* Socket handshake auth and limited reconnect policy:
  * apps/client/src/network/useSocketConnection.ts:28
  * apps/client/src/network/useSocketConnection.ts:33
* Optimistic local placement followed by ack reconciliation:
  * apps/client/src/App.tsx:230
  * apps/client/src/App.tsx:246
  * apps/client/src/interaction/controller.ts:75
* Sequenced event application with snapshot fallback on op gap:
  * apps/client/src/interaction/controller.ts:106
  * apps/client/src/interaction/controller.ts:128
  * apps/client/src/App.tsx:76
* Contract supports stronger client concurrency preconditions than current client uses:
  * apps/server/src/contracts.ts:205
  * apps/server/src/contracts.ts:244

## Follow-On Research Questions

* What are the DB-layer idempotency and dedupe keys in persistence paths (`persistTilePlacement`, `persistTileRemoval`) under reconnect retries?
* Should undo be scoped by author (`placedBy === clientId`) or remain global at product level?
* Is there an intended presence UI roadmap, or should presence events be removed to simplify the protocol?
* Is client-generated UUID required long-term, or should server assign IDs and map optimistic client temp IDs via correlation ID?
* What reconnect and offline guarantees are required (best-effort vs durable eventual send)?

## Clarifying Questions (Need Product/Engineering Input)

* Should a client be allowed to undo another client's latest tile?
* Should failed reconnect after fixed attempts present a blocking state, auto-fallback to REST polling, or keep trying indefinitely?
* Is multi-tab same-user behavior expected to share one `clientId` (current localStorage behavior), or should each tab be unique?
* Should rejected placement reasons be surfaced distinctly in UI for guided correction?
