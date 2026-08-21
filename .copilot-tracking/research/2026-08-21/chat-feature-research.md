---
title: Chat Feature Research
description: Architecture research and implementation constraints for authenticated user chat
---
<!-- markdownlint-disable-file -->
## Task Research: Chat Feature

Issue #55 requests a dedicated UI chat for users to talk to each other. This document researches the existing application architecture and evaluates implementation approaches for a production-compatible chat feature.

## Task Implementation Requests

* Determine how a dedicated user chat should fit the existing client and server architecture.
* Identify existing realtime, authentication, persistence, and testing patterns that constrain implementation.
* Evaluate viable chat transport and storage approaches and select one recommended path.

## Scope and Success Criteria

* Scope: Existing repository code, local conventions, current user/auth contracts, realtime synchronization, persistence, UI integration, and focused testing implications.
* Assumptions: Chat is intended for authenticated users in the existing shared application; issue text does not yet define rooms, moderation, retention, unread state, or message limits.
* Success Criteria:
  * Existing ownership boundaries and integration points are documented with exact file references.
  * Realtime delivery, durable storage, authorization, and reconnect behavior have an evidence-backed recommendation.
  * Alternatives and trade-offs are evaluated, with implementation-ready next steps.

## Outline

1. Repository and architecture evidence
2. Chat-specific requirements and risks
3. Technical scenarios and alternatives
4. Selected approach
5. Implementation handoff

## Potential Next Research

* Clarify product semantics for rooms, message retention, moderation, and unread indicators if implementation planning requires them.
  * Reasoning: Issue #55 only specifies a dedicated chat UI and peer conversation.
  * Reference: GitHub issue #55

## Research Executed

### File Analysis

* `apps/client/src/App.tsx:1-100,300-340`
  * Composition root for the authenticated application; no router is currently visible. Local reducer state is already used for active canvas controls.
* `apps/client/src/network/useSocketConnection.ts:1-180`
  * Owns the shared Socket.IO connection, token handshake, reconnect behavior, and event registration. It supports WebSocket and polling transports with bounded reconnect attempts.
* `apps/server/src/contracts.ts:1-25,100-135,150-180`
  * Shared source for Socket.IO event maps, auth metadata, reconnect/cursor semantics, and safe profile shapes.
* `apps/server/src/index.ts:1570-1815`
  * Creates the typed Socket.IO server, configures the PostgreSQL adapter, authenticates sockets, applies protocol/token/rate-limit checks, and registers handlers.
* `apps/server/src/auth/httpAuth.ts:1-75`, `apps/server/src/auth/socketAuth.ts:1-90`, `apps/server/src/auth/principalContext.ts:1-80`
  * Establish the authenticated internal principal and reject inactive or invalid identities.
* `apps/server/src/db/schema.ts:35-230`, `apps/server/src/db/repository.ts`, `apps/server/src/db/migrate.ts:35-55`
  * Show Drizzle UUID/FK/index/check conventions, repository boundaries, and migration-before-replica-start behavior.
* `apps/server/src/realtime/quiltRooms.ts:1-170`
  * Provides the nearest room normalization and authorization pattern, but chat should have explicit policy if its scope differs from the quilt.
* `e2e/quilt-reconnect.spec.ts`, `e2e/multi-user-fixtures.spec.ts`, `e2e/support/multiReplica*`
  * Provide browser reconnect, independent users, and shared-Postgres multi-replica test patterns.

### Code Search Results

* Socket.IO and PostgreSQL adapter usage: `apps/server/src/index.ts`
* Client connection lifecycle and reconnect: `apps/client/src/network/useSocketConnection.ts`, `apps/client/src/network/useConnectionStatus.ts`
* Auth boundaries: `apps/server/src/auth/httpAuth.ts`, `apps/server/src/auth/socketAuth.ts`, `apps/server/src/auth/principalContext.ts`
* Durable schema/migration patterns: `apps/server/src/db/schema.ts`, `apps/server/migrations/0006_authentication_authorization.sql`, `apps/server/src/db/migrate.ts`
* Realtime and multi-user tests: `apps/server/src/index.integration.test.ts`, `e2e/quilt-reconnect.spec.ts`, `e2e/multi-user-fixtures.spec.ts`

### External Research

_No external research executed yet._

### Project Conventions

* Standards referenced: typed shared contracts, repository-owned database access, Drizzle migrations, immutable authenticated principals, explicit room authorization, and integration/E2E coverage for reconnect and replicas.
* Instructions followed: `.github` repository guidance and the research-only constraint; only `.copilot-tracking/research/` was modified.

## Key Discoveries

### Architecture

The application already has the required realtime foundation. Socket.IO provides bidirectional typed events, reconnect hooks, rooms, and heartbeat behavior, while `@socket.io/postgres-adapter` provides cross-replica fanout. A second socket, SSE lifecycle, or plain WebSocket implementation would duplicate infrastructure without evidence that the existing path is insufficient.

### Identity and Authorization

The server resolves an external identity to an internal active principal and stores that principal on the authenticated request/socket. Chat commands must derive authorship from this context. Client payloads may identify a conversation and body, but must never control author identity, membership, ordering, or permissions.

### Persistence and Delivery

Messages should be persisted before their accepted event is broadcast. Broadcast is a notification path; durable history and cursor replay are the recovery path. Use stable server IDs and a unique ordering cursor, not array position or client timestamps. Idempotency is required because reconnects and retries can repeat sends.

### Product Gaps

Issue #55 does not define whether chat is global, quilt-scoped, direct, or multi-room; retention, moderation, deletion, membership, unread state, and UI placement are also unspecified. The smallest reasonable first slice is authenticated text chat in one product-defined scope, with durable finite history and no edits, attachments, reactions, typing indicators, or threads.

## Technical Scenarios

### Realtime Chat Integration

**Requirements:**

* Reuse authenticated connection lifecycle and multi-replica fanout.
* Support initial history, live events, reconnect replay, and duplicate suppression.
* Keep chat state separate from canvas state.

**Preferred Approach:**

* Extend the existing Socket.IO contract and shared connection with typed chat events. Mount a dedicated chat panel in the current authenticated app shell; defer router adoption until URL-level navigation is actually required.

**Implementation Details:**

* Add chat event types to `apps/server/src/contracts.ts`.
* Add server chat room resolution and explicit read/write authorization.
* Add a focused client chat cache/domain module for ordered merge, cursors, optimistic sends, and acknowledgement reconciliation.
* Use stable request/client message IDs and server-authoritative persisted messages.

#### Considered Alternatives

* SSE would require a second streaming lifecycle, separate mutation transport, and new replay/publication behavior.
* A new plain WebSocket layer would discard existing Socket.IO lifecycle and adapter behavior.
* A router-first UI would add navigation infrastructure not currently established by the app shell.

### Durable Message Storage

**Requirements:**

* Preserve messages across reconnects, restarts, and replicas.
* Query ordered history and missed messages efficiently.
* Respect principal/account lifecycle policy.

**Preferred Approach:**

* Add Drizzle tables and migration for a conversation resource plus messages, with UUID IDs, internal principal FK, bounded body, timestamps, and a unique conversation ordering cursor. Add an idempotency uniqueness constraint such as `(conversation_id, principal_id, client_message_id)`.

**Implementation Details:**

* Prefer `(conversation_id, sequence)` or `(conversation_id, created_at, id)` for cursor reads; timestamp alone is not unique.
* Keep SQL in a focused repository module.
* Decide before rollout whether account deletion anonymizes authors or deletes/blocks dependent messages; do not choose cascade accidentally.

#### Considered Alternatives

* Process memory is incompatible with durable user chat and multi-replica consistency.
* An external broker is unnecessary for the first slice because the existing PostgreSQL adapter already supplies fanout; revisit only with measured scale requirements.

### Verification Strategy

**Requirements:**

* Prove authorization, ordering, idempotency, reconnect, and cross-replica delivery.

**Preferred Approach:**

* Follow existing layered testing: pure client merge tests, server validation/auth unit tests, Postgres repository integration tests, Socket.IO integration tests, and one multi-replica browser scenario.

**Implementation Details:**

* Test unauthorized joins and sends, server-derived author identity, body/rate limits, duplicate retry, cursor replay, same-room broadcast, and exclusion of unauthorized clients.
* Test authenticated UI entry, disconnected send behavior, validation errors, accessible composer focus, and message rendering without unsafe HTML interpretation.
* Test send on replica A and observation/recovery on replica B.

#### Considered Alternatives

* A UI-only test suite would miss the primary consistency and authorization risks.
* A broad full-suite-only check would be slower and less diagnostic than focused tests plus the existing E2E patterns.

## Recommended Approach

Build chat as an authenticated, durable feature on the existing Socket.IO connection and PostgreSQL persistence layer. Define typed shared events, explicit conversation authorization, server-derived authorship, cursor-based history/replay, and idempotent sends. Add a dedicated client chat state/domain module and mount the first experience as a panel in the authenticated shell.

This approach is selected because it reuses verified connection/auth/adapter conventions, survives reconnects and replica changes, keeps the implementation localized, and avoids introducing transport or navigation infrastructure not required by the issue.

## Planning Addendum

The current client socket handshake is coupled to canonical quilt initialization. The implementation plan must therefore make chat lifecycle explicit. The selected planning default is to generalize the existing authenticated Socket.IO connection so chat can join and leave its authorized conversation independently of the active quilt room, while preserving the existing quilt handshake requirements for canvas synchronization. A separate chat socket remains an alternative, but would duplicate authentication and reconnect lifecycle.

Because issue #55 does not define product semantics, the plan uses these first-slice defaults: one authenticated shared conversation, finite ordered text history, server-enforced body and send-rate limits, no edits or attachments, no unread state, and a panel in the authenticated shell. Conversation scope, moderation, retention, and account-deletion policy remain explicit decisions before production rollout and are tracked as follow-on work rather than silently encoded.

The research path references E2E files under `apps/e2e/`; the verified repository location is the root `e2e/` directory. Validation should use the package scripts in the repository root: `npm run lint:client`, `npm run lint:server`, `npm run build`, `npm run test:client`, `npm run test:server`, and `npm run test:e2e:multi-replica`.

## Actionable Implementation Handoff

1. Resolve product scope: global versus quilt/patch-scoped versus direct conversations; membership and visibility rules.
2. Confirm retention, moderation, message length/rate limits, account deletion behavior, and whether unread state is first-slice scope.
3. Add shared chat contracts and a server repository/schema migration with ordered cursors and idempotency.
4. Add authenticated Socket.IO join/send/replay handlers that persist before broadcast and enforce authorization at command time.
5. Add client chat cache/domain logic and panel UI using the shared socket and connection status.
6. Add focused unit, integration, and multi-replica E2E tests described above.
7. Update API/product documentation and migration metadata before deployment.

### Evidence Record

* Delegated repository findings: `.copilot-tracking/research/subagents/2026-08-21/chat-architecture-research.md`
* GitHub issue: <https://github.com/dkirby-ms/zzyix/issues/55>
* Repository: <https://github.com/dkirby-ms/zzyix>
