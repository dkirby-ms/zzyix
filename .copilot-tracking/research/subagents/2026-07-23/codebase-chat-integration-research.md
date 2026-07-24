---
title: Codebase Chat Integration Research
description: Evidence-based analysis of real-time architecture and integration points for per-canvas chat channels in the mosaic app
author: Researcher Subagent
ms.date: 2026-07-23
ms.topic: reference
keywords:
  - socket.io
  - chat
  - canvas
  - realtime
estimated_reading_time: 8
---

## Research Scope

* Topic: current real-time architecture and integration points for implementing per-canvas chat channels in the mosaic app
* Method: direct repository reads and targeted code search only
* Evidence sources: server Socket.IO entrypoint, shared contracts, client networking hook, app-level emit/listener wiring, DB schema

## Findings

### 1) Server-side Socket.IO lifecycle is centralized and already room-oriented

* Socket server instance and typed event maps are created in apps/server/src/index.ts:1254
* Auth middleware runs in apps/server/src/index.ts:1287 and reads auth from socket.handshake.auth in apps/server/src/index.ts:1316
* Connection handler starts in apps/server/src/index.ts:1348
* On connection, socket joins the session room via socket.join(sessionId) in apps/server/src/index.ts:1364
* Initial authoritative snapshot is emitted directly to the connecting socket in apps/server/src/index.ts:1378
* Presence join notification fans out to room peers via socket.to(sessionId).emit(...) in apps/server/src/index.ts:1388

Implication for chat:
* Per-canvas chat can attach naturally to this existing session room join point, without introducing a new namespace

### 2) Existing room/channel patterns already include both session-wide and chunk-scoped channels

* Session-wide fanout: io.to(sessionId).emit(...) for tile events in apps/server/src/index.ts:1489 and apps/server/src/index.ts:1569
* Peer-only fanout: socket.to(sessionId).emit(...) for pointer and selection in apps/server/src/index.ts:1605 and apps/server/src/index.ts:1823
* Chunk rooms are derived as chunk:<sessionId>:<chunkId> in apps/server/src/index.ts:235
* Chunk subscription joins and leaves are explicit in apps/server/src/index.ts:1628 and apps/server/src/index.ts:1740

Implication for chat:
* Chat can use sessionId room directly for per-canvas channels, mirroring tile and presence broadcasts
* If needed later, thread/subchannel chat could mirror chunk-style room naming patterns

### 3) Session and canvas identity currently converge to the same value in realtime payloads

* Client stores and uses a sessionId for canvas participation in apps/client/src/App.tsx:164 and apps/client/src/App.tsx:239
* Client connects socket with auth { sessionId, clientId } in apps/client/src/network/useSocketConnection.ts:48
* Server stores sessionId/clientId in socket.data during auth middleware in apps/server/src/index.ts:1335 and apps/server/src/index.ts:1336
* Selection/chunk payloads include canvasId and server enforces payload.canvasId === sessionId in apps/server/src/index.ts:1612, apps/server/src/index.ts:1720, apps/server/src/index.ts:1744, apps/server/src/index.ts:1808
* Contract types show these payloads as canvasId-bearing while connection auth uses sessionId in apps/server/src/contracts.ts:239, apps/server/src/contracts.ts:382, apps/server/src/contracts.ts:389, apps/server/src/contracts.ts:394

Implication for chat:
* Minimal-friction option is to model chat channel id as sessionId, with optional canvasId field in payload for consistency and future-proofing

### 4) Session ID flow from REST to socket is clear and reusable

* Session list/create REST endpoints exist in apps/server/src/index.ts:1206 and apps/server/src/index.ts:1219
* Client lobby flow loads sessions and enters canvas mode by setting sessionId in apps/client/src/App.tsx:222 and apps/client/src/App.tsx:242
* Session ID persistence in browser storage is handled in apps/client/src/network/session.ts:47 and apps/client/src/network/session.ts:49
* Client identity is stable via ensureClientId() in apps/client/src/App.tsx:203 and apps/client/src/network/session.ts:111

Implication for chat:
* Chat can bind to existing session join lifecycle and clientId identity without new identity plumbing

### 5) Event contract patterns are strongly typed and versioned

* Shared protocol source is apps/server/src/contracts.ts with SCHEMA_VERSION in apps/server/src/contracts.ts:28
* Socket contract split is explicit:
  * ClientToServerEvents in apps/server/src/contracts.ts:453
  * ServerToClientEvents in apps/server/src/contracts.ts:473
* Existing patterns include:
  * Ack-based mutation events: place_tile/remove_tile in apps/server/src/contracts.ts:455 and apps/server/src/contracts.ts:457
  * Fire-and-forget state signals: pointer_move/selection_update in apps/server/src/contracts.ts:461 and apps/server/src/contracts.ts:463
  * Snapshot request/response: request_snapshot and session_snapshot in apps/server/src/contracts.ts:459 and apps/server/src/contracts.ts:475

Implication for chat:
* Chat send can follow ack-based pattern when delivery confirmation is required
* Chat history bootstrap can follow request_snapshot style request/response

### 6) Validation style is explicit runtime type-guard based and should be reused

* Payload guards for place/remove/pointer/selection are defined at apps/server/src/index.ts:681, apps/server/src/index.ts:733, apps/server/src/index.ts:755, apps/server/src/index.ts:768
* Chunk payload guards follow same isObjectRecord style in apps/server/src/index.ts:262, apps/server/src/index.ts:294, apps/server/src/index.ts:310
* Handlers fail closed by returning early or sending reject ack on invalid payloads in apps/server/src/index.ts:1409, apps/server/src/index.ts:1522, apps/server/src/index.ts:1595, apps/server/src/index.ts:1803

Implication for chat:
* Add chat payload guards in server index alongside existing validators for consistent security posture and behavior

### 7) Client networking wiring is hook-driven and chat can slot in cleanly

* Central socket hook is useSocketConnection in apps/client/src/network/useSocketConnection.ts:23
* Core listeners are attached in one place in apps/client/src/network/useSocketConnection.ts:68-96 equivalent lines from search hits:
  * session_snapshot apps/client/src/network/useSocketConnection.ts:68
  * tile_placed apps/client/src/network/useSocketConnection.ts:69
  * tile_removed apps/client/src/network/useSocketConnection.ts:70
  * pointer_update apps/client/src/network/useSocketConnection.ts:72
  * client_joined apps/client/src/network/useSocketConnection.ts:75
  * client_left apps/client/src/network/useSocketConnection.ts:78
  * selection_update apps/client/src/network/useSocketConnection.ts:81
* App-level emit points already use socketActionRef for outgoing events in apps/client/src/App.tsx:286, apps/client/src/App.tsx:484, apps/client/src/App.tsx:530, apps/client/src/App.tsx:664

Implication for chat:
* Add chat callbacks and emits through the same hook interface and socketActionRef usage pattern

### 8) Multi-replica and presence caveats affect chat semantics

* Startup sequence intentionally verifies DB and runs migrations before adapter setup and listen in apps/server/src/index.ts:1958, apps/server/src/index.ts:1961, apps/server/src/index.ts:1967
* Presence leave-gating is process-local and explicitly logged as a caveat in multi-replica scenarios in apps/server/src/index.ts:1883
* sessionClientSockets membership cache is in-memory per process in apps/server/src/index.ts:73 and manipulated in apps/server/src/index.ts:910 and apps/server/src/index.ts:931

Implication for chat:
* Read-receipt, typing, and online indicators should not assume globally authoritative process-local membership unless multi-replica behavior is hardened

## Existing Event Contract and Validation Patterns Summary

* Contract location: apps/server/src/contracts.ts
* Typed socket generics are enforced in server setup: apps/server/src/index.ts:1254
* Runtime validation location: apps/server/src/index.ts guard functions around lines 262-310 and 681-768
* Membership invariants for canvas-scoped events: payload canvasId must match connected sessionId in handlers at apps/server/src/index.ts:1612, apps/server/src/index.ts:1720, apps/server/src/index.ts:1744, apps/server/src/index.ts:1808

## Suggested Minimal Event Contract for Per-Canvas Chat

Design goal:
* Keep first implementation transient and room-scoped, matching existing realtime architecture

Proposed types to add in apps/server/src/contracts.ts:

```ts
export type ChatMessage = {
  id: string
  canvasId: string
  senderClientId: string
  text: string
  sentAt: number
}

export type SendChatMessagePayload = {
  canvasId: string
  text: string
  clientMessageId?: string
}

export type SendChatMessageAck =
  | { accepted: true; message: ChatMessage }
  | { accepted: false; reason: 'INVALID_PAYLOAD' | 'FORBIDDEN_CANVAS' | 'MESSAGE_TOO_LONG' }

export type RequestChatHistoryPayload = {
  canvasId: string
  limit?: number
  before?: number
}
```

Proposed event map additions:

```ts
// ClientToServerEvents
send_chat_message: (payload: SendChatMessagePayload, ack: (response: SendChatMessageAck) => void) => void
request_chat_history: (payload: RequestChatHistoryPayload) => void

// ServerToClientEvents
chat_message: (payload: { message: ChatMessage }) => void
chat_history: (payload: { canvasId: string; messages: ChatMessage[]; hasMore: boolean }) => void
```

Server behavior sketch:
* Validate payload shape and text length
* Enforce payload.canvasId === socket.data.sessionId
* On success, emit io.to(sessionId).emit('chat_message', { message })
* For history, emit only to requester socket.emit('chat_history', ...)

Client wiring sketch:
* Add onChatMessage/onChatHistory handlers to useSocketConnection signature
* Register listeners in useSocketConnection
* Emit send_chat_message and request_chat_history from App state/UI layer via socketActionRef

## Risks and Pitfalls

* Identity mismatch risk: current system uses sessionId in auth and canvasId in some payloads; inconsistent use could allow cross-canvas leakage if server checks are missed
  * Evidence: apps/server/src/index.ts:1612 and apps/server/src/index.ts:1808
* Multi-replica presence uncertainty: process-local membership map can make presence-adjacent chat features inconsistent across replicas
  * Evidence: apps/server/src/index.ts:73 and apps/server/src/index.ts:1883
* No existing chat persistence table: current DB schema is tiles/participants/operations/snapshots focused
  * Evidence: apps/server/src/db/schema.ts:65, apps/server/src/db/schema.ts:101, apps/server/src/db/schema.ts:142
* Reconnection/history gap risk: current reconnect flow gives session_snapshot (tiles/presence) but no chat backlog mechanism
  * Evidence: apps/server/src/index.ts:1378 and apps/server/src/index.ts:1831
* Payload abuse risk: chat text length and rate limiting are not present today for message events
  * Evidence: socket auth rate limiting exists in apps/server/src/index.ts:109 and apps/server/src/index.ts:1287, but no chat-specific controls yet

## Recommended Code-Touch List

Start with these files first:

1. apps/server/src/contracts.ts
2. apps/server/src/index.ts
3. apps/client/src/network/useSocketConnection.ts
4. apps/client/src/App.tsx

Likely follow-up files:

1. apps/client/src/ui/ControlsPanel.tsx or a dedicated chat UI component under apps/client/src/ui/
2. apps/client/src/App.test.tsx
3. apps/client/src/network/useSocketConnection.test.ts
4. apps/server/src/index.integration.test.ts
