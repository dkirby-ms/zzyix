---
title: Chat Architecture Research
description: Repository evidence and recommendation for GitHub issue #55, Feature Chat
author: GitHub Copilot
ms.date: 2026-08-21
ms.topic: research
keywords:
  - chat
  - Socket.IO
  - authentication
  - PostgreSQL
  - realtime
---

# Chat Architecture Research

## Scope and Issue

* Repository: `dkirby-ms/zzyix`
* Issue: GitHub issue #55, `[Feature] Chat`
* Status: Open; no issue comments were present at research time.
* Production code was not modified during this research.

Issue body and product requirements are sparse. The architecture recommendation below is therefore grounded in verified repository behavior and labels assumptions explicitly.

## Executive Recommendation

Build chat as a durable, authenticated feature on the existing Socket.IO transport and PostgreSQL adapter. Add typed chat events to the shared server/client contract, persist accepted messages in PostgreSQL, and deliver history plus a cursor-based replay/resubscription path. Integrate the UI as a chat panel or route-like view within the existing authenticated app shell, using a dedicated chat domain/store module rather than extending the canvas reducer.

Do not introduce SSE or a second socket connection. The existing transport already supplies heartbeat, reconnect, rooms, typed events, and cross-replica fanout. Do not make messages ephemeral: issue #55 does not state that chat is transient, and the repository consistently treats user/world mutations as durable, authorized database operations.

## 1. Client UI, Navigation, State, and Domain Patterns

### Verified evidence

* `apps/client/src/App.tsx:1-100` is the current composition root. It imports domain modules, interaction/controller logic, network hooks, auth hooks, and UI components directly. There is no router/navigation framework visible in the app shell.
* `apps/client/src/App.tsx:300-340` owns local UI state with `useReducer` for the active tile controls. This is a useful pattern for chat composer state, draft text, pending-send state, and validation feedback.
* `apps/client/src/domain/quiltCache.ts` is the dedicated server-state cache pattern for scoped quilt tiles, cursors, optimistic mutations, and reconciliation. Chat should have a parallel `domain/chatCache.ts` or feature store, not reuse tile-specific state.
* `apps/client/src/network/useSocketConnection.ts:1-180` owns socket construction, authentication, handlers, reconnect timing, and callback wiring. A chat feature should receive the shared socket reference or feature callbacks, not instantiate its own socket.
* `apps/client/src/network/useConnectionStatus.ts:1-70` exposes connection state as `connecting`, `connected`, `disconnecting`, `disconnected`, or `error`; the chat UI can reuse this status for send disablement and pending/retry presentation.
* `apps/client/src/auth/useAuthSession.ts` and `apps/client/src/auth/AuthProvider.tsx` provide the authenticated app context. Chat should render only after the existing authenticated state is established.
* `apps/client/src/App.test.tsx:1-130` mocks `useSocketConnection` and verifies callback registration. This supports testing chat at the feature boundary without requiring a browser socket.

### Recommended UI integration

Use one of these two UI placements, in order of preference:

1. An authenticated chat panel or drawer mounted beside the existing canvas shell, preserving the canvas as the primary workspace and making conversation contextual.
2. A lightweight in-app view selected by an explicit navigation control, without introducing a full router until there is a second durable view that needs URL-level navigation.

The repository does not currently establish a route convention. A chat panel is the smallest integration consistent with the current composition root. If deep links, browser history, or separate chat pages become a requirement, add a router as a deliberate follow-up rather than hiding route parsing in `App.tsx`.

### Suggested client state shape

Keep three concerns separate:

* `ChatViewState`: selected conversation, composer draft, scroll anchor, connection/send status.
* `ChatCacheState`: ordered messages, stable message IDs, `nextCursor`, `hasMore`, pending optimistic messages, and last applied server sequence.
* `ChatDomain`: pure merge/dedupe/reconcile functions for history pages, live events, reconnect replay, and send acknowledgements.

A message should be rendered from server-authoritative fields such as `id`, `conversationId`, `principalId` or safe author profile, `body`, `createdAt`, and a monotonic delivery/order cursor. Do not use array position or client timestamp as identity.

## 2. Server Transport, Realtime, Reconnect, and Replicas

### Verified evidence

* `apps/server/src/contracts.ts:1-25` declares Socket.IO as the application transport and is the shared type source for REST shapes, Socket.IO event maps, socket metadata, and connection auth.
* `apps/server/src/contracts.ts:100-135` explicitly documents Socket.IO heartbeat, automatic exponential-backoff reconnection, and resubscription with cursors to recover missed operations.
* `apps/server/src/index.ts:1570-1625` constructs a typed Socket.IO server and configures the `@socket.io/postgres-adapter` using the database pool. This is the existing cross-replica fanout path.
* `apps/server/src/index.ts:1630-1715` applies socket auth, canonical protocol compatibility, token expiry, lineage/reconnect authorization, and connection rate limiting before connection handlers run.
* `apps/server/src/index.ts:1715-1815` registers connection handlers, canonical telemetry, room state, and initialization. Existing rooms are canonical quilt/patch rooms, resolved by `apps/server/src/realtime/quiltRooms.ts:1-170` with access checks and room/churn budgets.
* `apps/server/src/realtime/quiltRooms.test.ts` tests canonical room normalization and deduplication. This is the nearest room-resolution unit-test pattern.
* `apps/client/src/network/useSocketConnection.ts:50-150` configures `transports: ['websocket', 'polling']`, `reconnection: true`, five attempts, 500 ms initial delay, 5 second max delay, token acquisition at handshake, and auth-loss/reconnect handling.
* `apps/server/src/index.integration.test.ts:300-400` exercises Socket.IO connections with `transports: ['websocket']` and `reconnection: false` for deterministic server tests, including reconnect lineage behavior.
* `apps/server/src/db/ownership.postgres.integration.test.ts:60-90` verifies transactional cross-replica presence lease decisions, demonstrating that shared Postgres state, rather than process memory, controls multi-replica ownership/presence semantics.
* `apps/e2e/quilt-reconnect.spec.ts`, `e2e/quilt-seams.spec.ts`, and `e2e/multi-user-fixtures.spec.ts` cover browser reconnect, multi-user behavior, and cross-user canvas visibility. `e2e/support/multiReplicaDatabase.ts` and `e2e/support/multiReplicaGlobalSetup.ts` provide the multi-replica test setup.

### Transport alternatives

* Existing Socket.IO path: recommended. It provides typed bidirectional commands/events, connection lifecycle, room membership, reconnect hooks, and the PostgreSQL adapter for fanout. Chat can use conversation rooms and cursor replay while sharing authentication and connection state.
* SSE: not evidenced in the repository. It would require a separate authenticated streaming lifecycle, client reconnect and replay logic, mutation transport, and a cross-replica publication design. It adds two transport models for one product.
* Plain WebSocket: also not evidenced as a separate abstraction. Replacing Socket.IO would discard existing lifecycle and adapter behavior and is not justified by issue #55.

### Reconnect and delivery rule

Persist the message before broadcasting its accepted event. On reconnect or resubscribe, the client supplies the last applied cursor/message sequence; the server loads missing durable messages and then resumes live delivery. Broadcast is a notification/delivery mechanism, not the source of truth. This prevents missed messages during disconnects and makes multi-replica behavior deterministic.

## 3. Authentication and Authorization Contracts

### Verified evidence

* `apps/server/src/auth/httpAuth.ts:1-75` extracts a Bearer token, verifies it, resolves a `PrincipalContext`, and attaches an immutable, non-enumerable `request.principal`. Authentication failures map to stable codes and HTTP status values.
* `apps/server/src/auth/socketAuth.ts:1-90` requires `socket.handshake.auth.token`, verifies it, resolves the principal, rejects expired tokens, and stores immutable `principalId` and `tokenExpiresAt` on `socket.data`.
* `apps/server/src/auth/principalContext.ts:1-80` resolves external identity to a persisted principal and enforces active status. `apps/server/src/auth/principalContext.postgres.integration.test.ts:30-70` verifies concurrent first-login convergence to one principal and one mapping.
* `apps/server/src/contracts.ts:150-180` defines safe profile and command-availability response shapes. Chat author display data should follow the safe-profile principle and never expose raw external subject or token data.
* `apps/server/src/domain/authorizationPolicy.ts` and `apps/server/src/realtime/quiltRooms.ts:20-75` show the pattern of deriving visibility from persisted policy and membership, then checking access before accepting a room subscription.
* `apps/server/src/index.integration.test.ts:220-250` verifies authentication-first behavior for missing/invalid credentials and insufficient scope. `apps/server/src/auth/httpAuth.test.ts` and `apps/server/src/auth/socketAuth.test.ts` cover the auth boundaries directly.

### Chat authorization contract

Every chat command must derive the author from the authenticated principal on the request/socket. The client-supplied payload may contain conversation and body, but never an authoritative `principalId`, author name, role, or permission flag. The server should validate:

* authenticated and active principal;
* conversation existence and membership/visibility;
* body size, encoding, and content constraints;
* mutation idempotency key or client message ID;
* rate limit appropriate to the conversation and principal.

Read access and write access should be separate policy decisions. A conversation room subscription must not itself grant mutation rights. Account deletion behavior also needs an explicit decision: existing principal deletion and foreign-key patterns imply messages should either be retained with an anonymized/deleted author or deleted by policy, but this is not specified by issue #55.

## 4. Database Schema, Migration, ORM, and Durable Messages

### Verified evidence

* `apps/server/src/db/schema.ts:35-230` uses Drizzle `pgTable`, UUID primary keys with `defaultRandom()`, timezone-aware `createdAt`/`updatedAt`, foreign keys, named indexes, unique constraints, and SQL check constraints.
* `apps/server/src/db/schema.ts:68-110` establishes `principals` and `external_principal_mappings`; chat messages should reference the immutable internal `principals.id`, not external identity values.
* `apps/server/src/db/schema.ts:165-220` shows expiring, principal-owned records and explicit indexes/checks. `apps/server/src/db/schema.ts:230+` continues the same FK/index convention for quilt and patch state.
* `apps/server/src/db/migrate.ts:35-55` requires migrations to be applied before production replicas start. `apps/server/src/db/migrate.test.ts` tests migration compatibility and failure handling.
* `apps/server/migrations/0006_authentication_authorization.sql` and later migrations show additive schema evolution for principals, policies, and canonical world state. `apps/server/migrations/meta/` is checked-in Drizzle migration metadata and must be updated with generated migrations.
* `apps/server/src/db/repository.ts` is the repository boundary for transactional reads/writes and concurrency-sensitive state. Chat persistence should use a focused repository module or clearly bounded functions rather than placing SQL in socket handlers.

### Recommended minimum schema

Use a durable `chat_conversations` table only if conversations are first-class resources. For the first feature slice, a single product conversation can avoid that table, but a conversation table is preferable if issue #55 implies more than one room.

Suggested tables:

* `chat_conversations`: `id uuid primary key`, `kind` or stable product key, optional `quilt_id`/scope FK, created/updated timestamps, and policy/membership ownership as required.
* `chat_messages`: `id uuid primary key`, `conversation_id uuid not null` with restrictive or deliberate cascade behavior, `principal_id uuid not null` or nullable only if anonymization is required, `body text not null`, `created_at timestamptz not null default now()`, and a server-generated ordering field such as `sequence bigint` scoped to conversation.
* Optional `chat_message_receipts` or edits/deletions should not be added in the first slice unless the product requirement demands them.

Indexes should support the actual reads: `(conversation_id, sequence)` or `(conversation_id, created_at, id)` for history/replay, plus `principal_id` for account lifecycle operations. Use a uniqueness constraint for an idempotency key if retries can repeat a send, for example `(conversation_id, principal_id, client_message_id)`.

Prefer a cursor based on server ordering and stable ID over offset pagination. A durable sequence or `(created_at, id)` tuple lets reconnect replay and history pagination share one contract. PostgreSQL `created_at` alone is not a unique ordering key.

### Persistence alternatives

* Durable PostgreSQL: recommended. It matches the repository's authorization, migration, repository, deletion, and multi-replica conventions and enables history/replay.
* Ephemeral process memory: not acceptable for a user-facing chat across reconnects or replicas. It loses messages on restart and cannot be consistently observed by another replica.
* External broker only: unnecessary for the first slice because the existing PostgreSQL Socket.IO adapter already provides cross-replica event fanout. A broker may become appropriate at scale, but issue #55 provides no evidence that it is needed.

## 5. Tests and Fixtures

### Realtime and reconnect

* `apps/client/src/network/useSocketConnection.test.ts` verifies socket creation, typed event handler registration, auth handshake, and collaboration subscriptions.
* `apps/client/src/network/useConnectionStatus.test.ts` verifies connection state transitions.
* `apps/server/src/index.integration.test.ts` verifies deterministic Socket.IO handshakes, auth, and reconnect/canonical lineage behavior.
* `e2e/quilt-reconnect.spec.ts` tests browser-level reconnect and recovery.
* `e2e/quilt-seams.spec.ts` tests room/scoped realtime behavior around toroidal seams.

### Auth and multi-user

* `apps/server/src/auth/httpAuth.test.ts` and `apps/server/src/auth/socketAuth.test.ts` test authentication boundaries.
* `apps/server/src/auth/principalContext.postgres.integration.test.ts` tests principal provisioning under concurrency.
* `apps/server/src/domain/authorizationPolicy.test.ts` tests policy evaluation.
* `e2e/authentication.spec.ts` tests signed-in/signed-out browser behavior.
* `e2e/multi-user-fixtures.spec.ts` and `e2e/support/multiUser.ts` provide independent identities and browser contexts.
* `e2e/support/testOidcIssuer.ts` supplies a deterministic test issuer and identity tokens.

### Persistence and multi-replica

* `apps/server/src/db/*.postgres.integration.test.ts` files exercise real Postgres constraints, transactions, ownership, recovery, retention, and repository behavior.
* `apps/server/src/test/postgresTestDatabase.ts` creates isolated Postgres test databases.
* `e2e/support/multiReplicaDatabase.ts`, `e2e/support/multiReplicaGlobalSetup.ts`, and `e2e/support/startMultiReplicaServer.ts` exercise separate server replicas against shared persistence.
* `apps/server/src/db/schema.test.ts` checks Drizzle schema/index definitions.
* `apps/server/src/db/migrate.test.ts` checks migration status compatibility.

### Focused chat tests to add

* Pure client tests for ordered merge, duplicate event suppression, cursor advancement, history pagination, optimistic send reconciliation, and reconnect replay.
* Server unit tests for body validation, conversation access, principal-derived authorship, rate limits, and idempotency.
* Postgres integration tests for message ordering, FK behavior, concurrent sends, idempotent retry, cursor replay, and deletion/anonymization policy.
* Socket integration tests for join authorization, message command acknowledgement, broadcast to same-room clients, no broadcast to unauthorized clients, and replay after a disconnect.
* Multi-replica E2E test: send on replica A, observe on replica B; disconnect/reconnect and verify persisted messages are recovered exactly once in the client view.
* Browser tests for authenticated entry, long body/error states, send disabled while signed out or disconnected, and accessible composer/focus behavior.

## 6. Product and Technical Gaps

The issue does not specify:

* whether chat is global, quilt-scoped, patch-scoped, or direct/multi-party;
* whether messages are durable, editable, deletable, moderated, or retained indefinitely;
* whether history is required and how much should load initially;
* whether unread counts, typing indicators, presence, reactions, threads, attachments, or search are in scope;
* membership and visibility rules for a conversation;
* account deletion semantics for authored messages;
* maximum message length, rate limits, abuse reporting, moderation, or content safety;
* ordering guarantees, duplicate behavior, and delivery semantics;
* whether the chat must be a panel, route, or deep-linkable page;
* localization, accessibility, mobile layout, and notification behavior.

### Minimal reasonable assumptions

* First slice is authenticated, text-only, one product-defined conversation scope, with durable messages and finite history pagination.
* Server is authoritative for identity, validation, ordering, persistence, and authorization.
* At-least-once transport delivery is acceptable because client merge is idempotent by message ID and cursor; user-visible duplicates are not acceptable.
* No edit/delete/reactions/attachments/typing indicators until explicitly required.
* Existing principal and account-deletion policy must be extended deliberately before production rollout.
* Chat is available only to active authenticated principals and is not exposed as an anonymous public channel.

## Security and Operational Pitfalls

* Never trust client-supplied author identity, display name, membership, ordering, or permission fields.
* Enforce room authorization on every join/resubscribe and verify mutation authorization inside the command handler, not only at UI level.
* Bound message length and socket payload size; rate-limit sends per principal and conversation; consider moderation and abuse controls before public exposure.
* Escape message content in the renderer and do not interpret arbitrary HTML or markdown without an explicit sanitization policy.
* Avoid leaking email, external subject, token, or private profile fields through message events and logs. Existing `apps/server/src/logging/redact.ts` shows sensitive-key redaction conventions.
* Make sends idempotent because reconnect and client retries can repeat commands. Persist first, then emit.
* Treat broadcasts as lossy notifications and durable replay as the recovery mechanism.
* Update Drizzle migration metadata and apply the migration before starting production replicas, per `apps/server/src/db/migrate.ts:41-55`.
* Decide FK behavior for principal deletion before migration. `onDelete: 'cascade'` would erase history; `restrict` may block account deletion; a nullable/anonymized author is often the least surprising chat policy but requires product approval.
* Do not overload existing canvas room authorization with chat visibility if chat scope differs. Create an explicit chat access policy.

## Suggested API and Event Shape

The exact names should follow the existing contract naming style, but the first slice could expose:

* REST `GET /chat/conversations/:conversationId/messages?after=<cursor>&limit=<n>` for initial history and catch-up, protected by `createHttpAuth` and conversation read authorization.
* Socket client command `chat_join` with `{ conversationId, cursor?, requestId }`, acknowledged with accepted/forbidden/replay metadata.
* Socket client command `chat_send_message` with `{ conversationId, clientMessageId, body }`, acknowledged with `{ accepted, message?, duplicate?, error? }`.
* Socket server event `chat_message_created` carrying the persisted message and cursor/sequence.
* Socket server event `chat_replay` or a join acknowledgement carrying ordered missed messages and the next cursor.
* Optional `chat_left` only if explicit room lifecycle is needed; disconnect cleanup should remain transport-managed.

Keep all event payloads in `apps/server/src/contracts.ts` and import the types from the client. Use request IDs and the existing `SafeApiError` style for stable error codes. The server should return the canonical persisted message from a successful send, allowing the client to reconcile its optimistic entry without trusting local timestamps.

## Decision Summary

The verified project evidence favors one authenticated Socket.IO connection, PostgreSQL durability, cursor-based replay, typed shared contracts, and a dedicated chat state/domain module mounted in the current authenticated app shell. SSE, a second socket, process-memory messages, and a router-first redesign are not supported by current repository evidence and would add lifecycle or consistency work without an issue-level requirement.

## References

* Repository: <https://github.com/dkirby-ms/zzyix>
* Issue: <https://github.com/dkirby-ms/zzyix/issues/55>
* Socket.IO adapter package already used by the repository: `@socket.io/postgres-adapter` in `apps/server/src/index.ts`
* No external documentation was required to establish the recommendation; repository evidence was sufficient.
