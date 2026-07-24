---
title: Socket.IO Per-Canvas Chat Options Research
description: Comparison of implementation options for dedicated per-canvas chat channels over WSS with Socket.IO, including delivery, replay, and scaling tradeoffs for this repository.
author: Researcher Subagent
ms.date: 2026-07-23
ms.topic: reference
---

## Research Scope

Requested topic: options for implementing dedicated per-canvas chat channels using Socket.IO over WSS.

Questions investigated:

* Which channeling model is best for per-canvas chat in this repo: room-per-canvas or namespace-per-canvas?
* What are tradeoffs between ephemeral in-memory chat and persisted chat?
* Which acknowledgement, ordering, and replay patterns are appropriate?
* What changes are required for multi-instance scaling, especially with Redis adapter?

## Current Repo Baseline

The current codebase already aligns to a room-per-session pattern where session ID is the canvas identity:

* apps/server/src/index.ts creates a single Socket.IO server, joins each socket to sessionId, and broadcasts via io.to(sessionId).
* apps/server/src/index.ts configures @socket.io/postgres-adapter today.
* apps/server/src/contracts.ts already defines ack-based mutation events and revision/opSeq semantics (useful for chat delivery design).
* apps/server/src/db/schema.ts already has canvases, participants, operation_log, and snapshots, which can be extended for chat persistence/replay.

Direct applicability: this means per-canvas chat can reuse existing socket auth, session membership, and adapter topology without introducing a second real-time stack.

## Option Comparison

### Option 1: Room-Per-Canvas, Ephemeral In-Memory Chat

Summary:

* Keep a single namespace (/)
* Use room key chat:canvas:{canvasId} (or reuse sessionId room directly)
* Broadcast chat events only to room members
* Keep recent messages only in process memory, no DB persistence

Practical event schema example:

```ts
type SendChatMessage = {
  canvasId: string
  messageId: string // client-generated UUID for dedupe
  text: string
  sentAt: number
}

type ChatMessageEvent = {
  canvasId: string
  messageId: string
  senderClientId: string
  text: string
  sentAt: number
  serverSeq: number
}

type SendChatAck = {
  accepted: boolean
  serverSeq?: number
  reason?: 'INVALID' | 'TOO_LARGE' | 'RATE_LIMITED'
}

// flow
// client -> send_chat_message(payload, ack)
// server -> io.to(`chat:canvas:${canvasId}`).emit('chat_message', event)
```

Pros:

* Lowest implementation complexity
* Minimal write latency
* Reuses current room model and auth/session checks
* No schema migration required

Cons:

* Message loss on server restart
* No history for reconnecting users except whatever remains in process memory
* In multi-instance mode, partial history per node unless a shared store is added

Complexity: Low

Performance implications:

* Best p50 latency under normal conditions
* Memory grows with active canvases and recent message buffers
* Cross-node fanout depends on adapter; without shared adapter, room scope is local only

Failure modes:

* Process crash loses chat history
* Adapter/backplane outage causes split-brain visibility across instances
* Reconnect after disconnect misses messages sent during offline window

### Option 2: Room-Per-Canvas, Persisted Chat in Postgres (Recommended)

Summary:

* Keep current namespace and room model
* Persist each accepted message to Postgres
* Include monotonic per-canvas serverSeq
* On reconnect/join, replay messages newer than clientLastSeq

Practical event schema example:

```ts
type SendChatMessage = {
  canvasId: string
  clientMessageId: string
  text: string
  clientTs: number
  expectedSeq?: number
}

type SendChatAck = {
  accepted: boolean
  serverSeq?: number
  persistedAt?: number
  idempotent?: boolean
  reason?: 'INVALID' | 'DUPLICATE' | 'STALE_CURSOR' | 'RATE_LIMITED'
}

type ChatMessageEvent = {
  canvasId: string
  serverSeq: number
  clientMessageId: string
  senderClientId: string
  text: string
  clientTs: number
  serverTs: number
}

type ChatReplayRequest = {
  canvasId: string
  afterSeq: number
  limit?: number
}

type ChatReplayChunk = {
  canvasId: string
  fromSeqExclusive: number
  toSeqInclusive: number
  messages: ChatMessageEvent[]
  hasMore: boolean
}
```

Pros:

* Durable history and deterministic replay
* Fits existing Postgres-first architecture and adapter already in use
* Enables moderation/audit and future search features
* Straightforward ordering via per-canvas sequence

Cons:

* More write load on Postgres
* Requires schema migration and retention policy
* Slightly higher end-to-end latency than purely in-memory

Complexity: Medium

Performance implications:

* Write amplification: insert + broadcast per message
* Indexed queries on (canvasId, serverSeq) are efficient for replay windows
* Can cap replay and paginate for large channels

Failure modes:

* DB outage blocks persistence and may require fail-open (ephemeral) or fail-closed policy
* Hot canvases can cause contention if sequence allocation is not efficient
* Unbounded retention increases storage and vacuum pressure

### Option 3: Namespace-Per-Canvas (Dynamic Namespaces)

Summary:

* Create namespace per canvas: /canvas-{id}
* Chat events are scoped by namespace rather than room
* Each namespace may still use rooms internally if needed

Practical event schema example:

```ts
// client connects to io("/canvas-<id>", { auth })

type SendChatMessage = {
  clientMessageId: string
  text: string
}

type ChatMessageEvent = {
  serverSeq: number
  senderClientId: string
  text: string
  serverTs: number
}
```

Pros:

* Hard logical isolation of handlers/middleware per canvas
* Clear multitenant boundary semantics

Cons:

* Higher operational and memory overhead at high canvas cardinality
* Requires strict namespace authorization and cleanup settings
* More moving parts for client connection lifecycle
* Less aligned with current architecture (single namespace + rooms)

Complexity: Medium-High

Performance implications:

* More namespace objects and middleware paths
* Potentially more connection management overhead
* Multiplexing can help, but dynamic namespace churn still adds cost

Failure modes:

* Namespace explosion from untrusted names if validation is weak
* Stale empty namespaces if cleanup is misconfigured
* Difficult observability when namespace count is large

### Option 4: Room-Per-Canvas + Redis Streams Persistence + Redis Adapter Fanout

Summary:

* Use Socket.IO rooms for channeling
* Use Redis adapter for multi-instance broadcast
* Store durable chat log in Redis Streams for replay
* Optionally flush older messages to Postgres for long-term retention

Practical event schema example:

```ts
type SendChatMessage = {
  canvasId: string
  clientMessageId: string
  text: string
}

type SendChatAck = {
  accepted: boolean
  streamId?: string // Redis stream ID
  reason?: 'INVALID' | 'RATE_LIMITED'
}

type ChatMessageEvent = {
  canvasId: string
  streamId: string
  senderClientId: string
  text: string
  serverTs: number
}

type ChatReplayRequest = {
  canvasId: string
  afterStreamId: string
  limit?: number
}
```

Pros:

* Strong fit for high-throughput fanout and short-term replay
* Natural multi-instance scaling pattern with Redis backplane
* Can reduce load on Postgres for real-time hot path

Cons:

* Adds Redis operational dependency and security hardening burden
* More complex failure handling than Postgres-only approach
* Additional infra not currently required by baseline app

Complexity: High

Performance implications:

* Very good fanout performance for many instances/rooms
* Stream trim strategy needed to control memory cost
* Two data systems if long-term retention still lands in Postgres

Failure modes:

* Redis outage can partition broadcasts by node
* Pub/Sub does not persist by itself; Streams needed for replay durability
* Misconfigured ACL/TLS/networking can expose injection or snooping risk

## Namespace-Per-Canvas vs Room-Per-Canvas

Decision signals for this repo:

* Room-per-canvas matches the current architecture today and has lower incremental complexity
* Namespace-per-canvas is usually best when each tenant/channel needs different middleware stacks or strict API separation
* For this app, per-canvas chat does not require separate transport or protocol; rooms are enough and already used per session

Practical recommendation: keep one namespace, add dedicated chat rooms keyed by canvas ID, and enforce membership checks server-side.

## Ephemeral vs Persisted Chat

Ephemeral in-memory:

* Good for MVP demos and lowest latency
* Not acceptable if product requires reconnect history, moderation trail, or auditability

Persisted (Postgres or Redis Streams):

* Required for deterministic replay and history
* Better user experience under mobile/network churn

Repo-fit conclusion: persisted chat in Postgres is the best first durable step because Postgres is already the system of record in this codebase.

## Acknowledgement, Ordering, and Replay Patterns

Recommended baseline pattern:

* Client to server:
  * Use send_chat_message with ack timeout + retries
  * Include clientMessageId for idempotency
* Server ordering:
  * Assign monotonic serverSeq per canvas upon accepted persistence
  * Broadcast only after durable write succeeds (or document fail-open mode)
* Replay:
  * Client stores lastSeenSeq per canvas
  * On connect/reconnect, client sends lastSeenSeq
  * Server replays messages where serverSeq > lastSeenSeq in bounded pages

Why this is needed:

* Socket.IO guarantees ordering for delivered events, but default arrival is at-most-once
* Therefore app-level durability and offset replay are required for missed-message recovery

## Multi-Instance Scaling with Redis Adapter

When to add Redis adapter:

* Add when horizontal scale requires low-latency cross-node fanout and/or Pub/Sub pressure exceeds Postgres NOTIFY comfort

Operational notes:

* Sticky sessions are still required with Redis adapter
* If Redis is down, packets are only delivered to clients on the local node
* Prefer sharded Pub/Sub adapter mode for new large-scale deployments

Repo-specific strategy:

* Keep current @socket.io/postgres-adapter while chat throughput is moderate
* Introduce Redis adapter when room and instance counts grow enough to justify dedicated backplane
* Keep persistence source of truth in Postgres initially to avoid dual-write complexity

## Comparative Summary

| Option | Complexity | Latency | Durability | Replay Quality | Scale Readiness | Main Risk |
|---|---|---|---|---|---|---|
| Room + In-Memory | Low | Best | None | Weak | Medium | Message loss on restart/disconnect |
| Room + Postgres Persistence | Medium | Good | Strong | Strong | Medium-High | DB load under chat spikes |
| Namespace per Canvas | Medium-High | Good | Depends on store | Depends on store | Medium | Namespace churn and auth complexity |
| Room + Redis Streams + Redis Adapter | High | Best-Good | Strong | Strong | High | Extra infra and ops/security burden |

## Preferred Option for This Repo

Preferred option: Room-per-canvas with Postgres persistence and sequence-based replay.

Why:

* Aligns directly with existing design in apps/server/src/index.ts and apps/server/src/contracts.ts
* Reuses current @socket.io/postgres-adapter footprint without introducing immediate Redis dependency
* Delivers durable history, reconnect replay, and deterministic ordering with moderate implementation cost
* Preserves a migration path to Redis adapter later if fanout scale requires it

Suggested phased rollout:

1. Add chat events/contracts and room membership checks.
2. Add Postgres table for chat messages keyed by (canvas_id, server_seq).
3. Implement ack + idempotency on clientMessageId.
4. Implement replay endpoint/event on reconnect with paging.
5. Add retention policy and observability (message throughput, replay lag, ack failures).

## Key References

Socket.IO rooms:

* [Socket.IO Rooms](https://socket.io/docs/v4/rooms/)

Socket.IO namespaces:

* [Socket.IO Namespaces](https://socket.io/docs/v4/namespaces/)

Delivery semantics and replay patterns:

* [Socket.IO Delivery Guarantees](https://socket.io/docs/v4/delivery-guarantees/)
* [Socket.IO Tutorial Step 7: Server Delivery](https://socket.io/docs/v4/tutorial/step-7)

Multi-instance adapters:

* [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)
* [Socket.IO Postgres Adapter](https://socket.io/docs/v4/postgres-adapter/)

## Directly Applicable Takeaways for This Repository

* Use room keys based on existing session/canvas identity, not dynamic namespaces.
* Continue with @socket.io/postgres-adapter for current scale and architecture coherence.
* Implement app-level at-least-once behavior with clientMessageId idempotency and serverSeq replay.
* Defer Redis adapter introduction until measured scale requires it, then keep persistence semantics stable.
