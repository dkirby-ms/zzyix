<!-- markdownlint-disable-file -->
# Task Research: Canvas Chat Feature

Research to design and implement dedicated per-canvas chat channels in the mosaic application, with emphasis on reusing the existing WebSocket and Socket.IO stack.

## Task Implementation Requests

* Build out a chat feature for the mosaic app
* Ensure each canvas has its own chat channel
* Reuse the existing WSS and Socket.IO approach where practical
* Research and compare implementation options before coding

## Scope and Success Criteria

* Scope: Analyze current client/server real-time architecture, evaluate at least three viable chat designs, and recommend one implementation approach tailored to this repository
* Assumptions: Canvas identity already exists in session/game state and can be mapped to a socket room key
* Assumptions: Chat persistence is optional for initial rollout and can be phased
* Success Criteria:
  * Identify how to model per-canvas chat channel membership
  * Define event contracts for send, receive, and history/replay behavior
  * Recommend one implementation approach with clear tradeoffs and rollout guidance

## Outline

1. Analyze current server Socket.IO architecture and session/canvas model
2. Analyze current client networking hooks and state integration points
3. Research external Socket.IO chat/channel patterns and scaling options
4. Evaluate alternatives and pick one recommended approach
5. Document implementation impact and next steps

## Potential Next Research

* Confirm product retention policy for chat history
  * Reasoning: Determines TTL, archival, and moderation burden
  * Reference: https://socket.io/docs/v4/delivery-guarantees/
* Define v1 reliability requirements (ack only vs read receipts)
  * Reasoning: Changes event shape and server-side state complexity
  * Reference: https://socket.io/docs/v4/tutorial/step-7
* Set chat throughput and reconnect burst targets
  * Reasoning: Needed to size Postgres indexes and replay pagination
  * Reference: https://socket.io/docs/v4/postgres-adapter/
* Run a UI-kit spike against existing events
  * Reasoning: Fastest way to confirm UX velocity without backend replacement
  * Reference: https://github.com/chatscope/chat-ui-kit-react

## Research Executed

### File Analysis

* apps/server/src/index.ts
  * Socket.IO server setup, auth middleware, and session room join are centralized at apps/server/src/index.ts:1254-1389
  * Existing room fanout patterns for state events are in apps/server/src/index.ts:1489-1605
  * Canvas/session invariant checks for scoped payloads are in apps/server/src/index.ts:1612-1808
  * Reconnect snapshot flow has no chat replay path in apps/server/src/index.ts:1378-1831
* apps/server/src/contracts.ts
  * Typed event contracts and schema versioning are defined in apps/server/src/contracts.ts:28-512
  * Existing ack-based write event patterns are in apps/server/src/contracts.ts:453-468
* apps/client/src/network/useSocketConnection.ts
  * Single hook surface for Socket.IO listeners and callbacks in apps/client/src/network/useSocketConnection.ts:23-123
* apps/client/src/App.tsx
  * Session/client identity lifecycle and outbound emit patterns in apps/client/src/App.tsx:203-242 and apps/client/src/App.tsx:286-664
* apps/server/src/db/schema.ts
  * Current persistence model has no chat table in apps/server/src/db/schema.ts:65-186

### Code Search Results

* Search term: sessionId
  * Auth and room membership coupling: apps/server/src/index.ts:1335-1364
  * Client connect auth usage: apps/client/src/network/useSocketConnection.ts:48-52
* Search term: canvasId
  * Server-side guardrails already enforce canvas/session match: apps/server/src/index.ts:1612-1808
* Search term: io.to(
  * Existing room-broadcast convention for shared state: apps/server/src/index.ts:1489-1569

### External Research

* Official docs: Socket.IO rooms
  * Finding: Room-based fanout fits per-canvas channels and avoids dynamic namespace churn
  * Source: [Socket.IO Rooms](https://socket.io/docs/v4/rooms/)
* Official docs: Socket.IO namespaces
  * Finding: Namespace-per-canvas increases lifecycle and authorization complexity for high channel cardinality
  * Source: [Socket.IO Namespaces](https://socket.io/docs/v4/namespaces/)
* Official docs: delivery semantics
  * Finding: Ordering is guaranteed for delivered packets, but default arrival is at-most-once
  * Source: [Socket.IO Delivery Guarantees](https://socket.io/docs/v4/delivery-guarantees/)
* Official docs: delivery with replay pattern
  * Finding: Durable server-side IDs plus client offsets are the practical replay model
  * Source: [Socket.IO Tutorial Step 7](https://socket.io/docs/v4/tutorial/step-7)
* Official docs: scaling adapters
  * Finding: Redis adapter helps cross-instance fanout scale but does not replace persistence strategy
  * Source: [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)
* Official docs: Postgres adapter
  * Finding: Current repo adapter choice is valid for moderate scale and architectural consistency
  * Source: [Socket.IO Postgres Adapter](https://socket.io/docs/v4/postgres-adapter/)
* Library landscape: chat frameworks and SDKs
  * Finding: No true drop-in backend chat library exists that layers on an existing custom Socket.IO contract without meaningful architecture changes
  * Source: [.copilot-tracking/research/subagents/2026-07-23/chat-library-options-research.md](.copilot-tracking/research/subagents/2026-07-23/chat-library-options-research.md)

### Project Conventions

* Standards referenced: markdown.instructions.md, writing-style.instructions.md
* Standards referenced: /memories/repo/startup-db-ordering.md
* Instructions followed: Task Researcher mode requirements for .copilot-tracking/research artifacts

## Key Discoveries

### Project Structure

* Real-time behavior is concentrated in one server entrypoint and one client socket hook, which is favorable for incremental chat integration.
* Channel identity effectively maps to sessionId today; existing payloads sometimes call this canvasId but server checks already bind both.
* Socket.IO Postgres adapter is already active and startup sequencing defers adapter init until DB checks/migrations complete, reducing startup race failures.

### Implementation Patterns

* Typed contracts first, then runtime guard functions in handlers, then room fanout.
* Use ack-based writes for state-changing operations and direct socket replies for request/response flows.
* Enforce room-scoped authorization inside each event handler rather than trusting client payload scope.

### Complete Examples

```ts
export type ChatMessage = {
  id: string
  canvasId: string
  senderClientId: string
  text: string
  serverSeq: number
  clientMessageId?: string
  clientTs?: number
  serverTs: number
}

export type SendChatMessagePayload = {
  canvasId: string
  text: string
  clientMessageId: string
  clientTs: number
}

export type SendChatMessageAck =
  | { accepted: true; serverSeq: number; idempotent?: boolean }
  | {
      accepted: false
      reason: 'INVALID_PAYLOAD' | 'FORBIDDEN_CANVAS' | 'MESSAGE_TOO_LONG' | 'RATE_LIMITED'
    }

export type RequestChatReplayPayload = {
  canvasId: string
  afterSeq: number
  limit?: number
}
```

### API and Schema Documentation

* Rooms are the primary channel primitive for per-canvas chat fanout.
* Namespaces are better suited for coarse protocol segmentation than high-cardinality channel partitioning.
* Delivery/replay should be implemented at the application layer using IDs and offsets.

### Chat Library Fit Assessment

* Best fit if keeping existing Socket.IO backend unchanged:
  * @chatscope/chat-ui-kit-react (UI-only acceleration)
  * react-chat-elements (UI-only acceleration)
* Partial fit with backend refactor:
  * Feathers with @feathersjs/socketio (keeps Socket.IO transport, introduces service architecture)
  * NestJS gateways (keeps Socket.IO transport, larger framework migration)
* Poor fit if architecture continuity is required:
  * Stream, Sendbird, PubNub, Ably, Rocket.Chat, Mattermost, Matrix SDK
  * These are strong products, but they replace backend protocol/data assumptions instead of plugging into your current contract

Direct answer to library question:

* There is no broadly adopted, true drop-in backend chat library that sits directly on top of an existing custom Socket.IO contract and removes most backend chat work without architectural change.
* The practical acceleration path is UI-kit adoption plus your own backend events/persistence.

### Configuration Examples

```json
{
  "chat": {
    "maxMessageLength": 1000,
    "replayPageSize": 100,
    "maxReplayPageSize": 500,
    "ackTimeoutMs": 5000,
    "retentionDays": 30
  }
}
```

## Technical Scenarios

### Scenario 1: Socket.IO Rooms Per Canvas

Use a single Socket.IO namespace and route chat by canvas room key, where canvasId resolves to the connected sessionId for v1.

Requirements:

* Each canvas must be isolated to its own chat channel.
* Server must reject cross-canvas emits.
* Client reconnect should support history replay.

Preferred approach:

* Join chat-capable sockets to their canvas room at connect/join time.
* On send_chat_message, validate payload, persist, assign serverSeq, then emit chat_message to io.to(canvasRoom).
* On request_chat_replay, return serverSeq-ordered pages newer than afterSeq.

```text
apps/server/src/contracts.ts
apps/server/src/index.ts
apps/server/src/db/schema.ts
apps/server/migrations/<new>_chat_messages.sql
apps/client/src/network/useSocketConnection.ts
apps/client/src/App.tsx
apps/client/src/ui/<new>-chat-panel.tsx
```

Implementation details:

* Reuse existing server auth/session context from socket.data.
* Keep event contract additions in contracts.ts and wire both client and server types from there.
* Use a composite index on (canvas_id, server_seq) for replay.
* Bound replay limit server-side to prevent abuse.

#### Considered Alternatives

* Namespace-per-canvas
  * Rejected for v1 due to higher lifecycle/auth complexity and weaker alignment with current single-namespace architecture.
* Ephemeral in-memory chat only
  * Rejected as primary path because reconnect gaps and restarts would drop history.
* Redis Streams + Redis adapter as first step
  * Rejected for v1 because it introduces new infra/ops overhead before proven scale need.

### Scenario 2: Persistence Strategy for Chat

Durable message history for reconnect and audit can be implemented in Postgres or Redis Streams.

Requirements:

* Deterministic ordering for replay.
* Idempotent send behavior across retries.
* Practical fit with existing infra and developer workflow.

Preferred approach:

* Postgres-backed chat table with per-canvas serverSeq and clientMessageId dedupe.

Implementation details:

* Add server_seq BIGINT not null and unique by canvas_id.
* Add unique(canvas_id, sender_client_id, client_message_id) for idempotency.
* Emit ack only after successful insert/sequence assignment.

#### Considered Alternatives

* Postgres + ephemeral cache hybrid
  * Useful optimization later, not required for correctness in v1.
* Redis Streams as source of truth
  * Strong for high throughput, but less aligned with current persistence strategy and migrations.

### Scenario 3: Multi-Instance Scale Path

Current adapter is Postgres; Redis adapter can be introduced when room count and fanout pressure increase.

Requirements:

* Preserve client/server event contracts.
* Avoid reworking persistence semantics during scale transition.

Preferred approach:

* Keep Postgres persistence semantics unchanged.
* Introduce Redis adapter only for cross-instance fanout scaling when needed.

Implementation details:

* Maintain sticky sessions at ingress.
* Keep replay source in Postgres regardless of adapter choice.

#### Considered Alternatives

* Immediate Redis adapter adoption
  * Not selected due to premature operational complexity.

### Scenario 4: Buy vs Build with Existing Socket.IO

Assess whether third-party chat libraries can reduce engineering effort while preserving your existing realtime architecture.

Requirements:

* Keep existing Socket.IO server/client contract where possible.
* Reduce implementation time without introducing heavy migration risk.
* Preserve optionality for future scale features.

Preferred approach:

* Build backend chat domain on current Socket.IO stack.
* Optionally use a UI kit for faster frontend delivery.

Implementation details:

* Keep contracts, persistence, and replay in-repo.
* Evaluate @chatscope/chat-ui-kit-react first for UI acceleration.
* Avoid managed backend platforms unless product priorities shift to full buy-over-build.

#### Considered Alternatives

* Managed chat backends (Stream/Sendbird/PubNub/Ably)
  * Fast feature depth but replace backend architecture and data flow.
* Self-hosted chat platforms (Rocket.Chat/Mattermost/Matrix)
  * Mature but heavyweight and misaligned with embedded canvas chat scope.
* Socket.IO-adjacent frameworks (Feathers/NestJS)
  * Viable only if you also want a broader backend framework refactor.

## Selected Approach

Implement room-per-canvas chat on the current Socket.IO namespace with Postgres persistence, ack-based sends, idempotency via clientMessageId, and replay via per-canvas serverSeq.

Rationale:

* Best architecture fit with existing room model and typed event contracts.
* Meets reliability expectations for reconnect while staying operationally simple.
* Preserves a clean migration path to Redis adapter for fanout scale without rewriting chat semantics.

## Implementation Impact

* Server contracts: add send/receive/replay chat events and payload types.
* Server handlers: add validation, auth scope checks, persistence writes, and room broadcast.
* Data model: add chat_messages table and indexes for replay and dedupe.
* Client networking: add chat listeners and emit helpers in existing socket hook.
* Client UI/state: add per-canvas chat panel and local message state keyed by canvas.
* Tests: add contract-level, server integration, and reconnect replay behavior tests.
* Optional UI acceleration: integrate a chat UI kit while preserving custom backend contracts.

## Actionable Next Steps

1. Finalize v1 product constraints: retention days, max message length, and replay page size.
2. Implement contracts and server validators first to establish protocol.
3. Add Postgres schema + migration for chat_messages with replay indexes.
4. Add send + replay handlers in server, then wire client hook and UI.
5. Add integration tests for cross-canvas isolation, idempotent retries, and reconnect replay.
6. Add observability counters: send failures, ack latency, replay lag, and messages per canvas.
