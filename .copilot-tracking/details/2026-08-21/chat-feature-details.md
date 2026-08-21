---
title: Chat Feature Implementation Details
description: File-level implementation steps for authenticated durable chat
---
<!-- markdownlint-disable-file -->
## Implementation Details: Chat Feature

## Context Reference

Sources: `.copilot-tracking/research/2026-08-21/chat-feature-research.md`, GitHub issue #55, repository package scripts, and verified architecture findings from the planning research review.

## Implementation Phase 1: Product Contract and Shared Protocol

<!-- parallelizable: false -->

### Step 1.1: Freeze the first-slice product contract

Treat the first release as authenticated text chat in one shared conversation available to active authenticated principals. Before coding, freeze these required policies: retain the newest 500 messages, accept plain-text bodies up to 2,000 characters, limit each principal to 10 sends per rolling minute, provide no edits or user deletion endpoint, and set deleted principal foreign keys to null while preserving a `Deleted user` author label. Defer moderation tooling, abuse reporting, notifications, and unread state until after the first slice, but do not defer the schema and authorization behavior above.

Files:
* `apps/client/src/App.tsx` - authenticated-shell integration point.
* `apps/server/src/contracts.ts` - shared protocol ownership.
* `docs/` - update the selected product/API contract if the repository has a suitable chat document.

Discrepancy references:
* DD-01 records the planning defaults necessitated by issue #55's underspecified product semantics.
* WI-01 tracks production policy decisions that must not be inferred from implementation details.

Success criteria:
* Conversation scope and authorization rules are written as testable invariants.
* Unsupported features and limits are explicit, so the first slice cannot expand accidentally.

Context references:
* `.copilot-tracking/research/2026-08-21/chat-feature-research.md` (Lines 70-92) - product gaps and first-slice boundary.
* `.copilot-tracking/research/2026-08-21/chat-feature-research.md` (Lines 143-158) - planning defaults and socket lifecycle constraint.

Dependencies:
* Product decision on the shared conversation scope.

### Step 1.2: Add typed chat contracts

Extend the existing Socket.IO event maps with join/leave or subscription, history/replay, send acknowledgement, message delivery, and stable error payloads. Include conversation identifiers, cursors, server message IDs, client idempotency IDs, and safe author profile fields. Do not accept author, sequence, timestamp, membership, or permission fields from clients.

Files:
* `apps/server/src/contracts.ts` - add the public client/server event and payload types.
* `apps/client/src/network/useSocketConnection.ts` - expose the typed chat events through the existing connection lifecycle without duplicating transport setup.

Success criteria:
* Client and server compile against one contract.
* The contract distinguishes accepted, replayed, duplicate, unauthorized, invalid, and disconnected outcomes.

Context references:
* `apps/server/src/contracts.ts` - current typed Socket.IO contract and safe profile shapes.
* `apps/client/src/network/useSocketConnection.ts` - shared connection and reconnect ownership.

Dependencies:
* Step 1.1 product contract.

## Implementation Phase 2: Durable Storage and Server Authorization

<!-- parallelizable: false -->

### Step 2.1: Add chat persistence schema and migration

Create conversation and message tables using the repository's UUID, foreign-key, index, and check-constraint conventions. Store the internal principal ID, bounded body, server timestamps, a per-conversation monotonic ordering value or equivalent unique cursor, and the client message ID. Enforce retry idempotency with a uniqueness constraint scoped to conversation, principal, and client message ID. Select and document the principal deletion behavior rather than introducing accidental cascade deletion.

Files:
* `apps/server/src/db/schema.ts` - Drizzle table definitions and indexes.
* `apps/server/migrations/0011_chat.sql` - checked-in migration generated from the schema conventions.
* `apps/server/src/db/migrate.ts` - verify no custom migration ordering change is needed.

Discrepancy references:
* DD-02 records the selected cursor/idempotency design if it differs from the research alternatives.

Success criteria:
* Ordered history can be queried by conversation and cursor without timestamp-only ambiguity.
* Duplicate client retries resolve to one persisted message.
* Migration applies before multi-replica startup and preserves existing data.

Context references:
* `apps/server/src/db/schema.ts` - existing UUID, FK, index, and check patterns.
* `apps/server/src/db/migrate.ts` - migration-before-replica-start behavior.
* `.copilot-tracking/research/2026-08-21/chat-feature-research.md` (Lines 95-112) - persistence requirements.

Dependencies:
* Step 1.1 policy decisions.

### Step 2.2: Implement repository operations

Add a focused repository module for conversation authorization, bounded history reads, cursor replay, and transactional idempotent message insertion. Return server-authoritative message records mapped to safe client profiles. Keep SQL and transaction behavior out of the Socket.IO composition root.

Files:
* `apps/server/src/db/repository.ts` or a focused `apps/server/src/db/chatRepository.ts` - repository boundary, following the local pattern.
* `apps/server/src/db/*.test.ts` - repository integration tests for ordering, retries, and lifecycle behavior.

Success criteria:
* Reads return deterministic pages and a continuation cursor.
* Inserts are atomic with idempotency reconciliation.
* Unauthorized principals cannot read or write the conversation through repository calls.

Context references:
* `apps/server/src/db/repository.ts` - existing repository ownership.
* `.copilot-tracking/research/2026-08-21/chat-feature-research.md` (Lines 103-112) - durable history and idempotency requirements.

Dependencies:
* Step 2.1 migration.

### Step 2.3: Add authenticated Socket.IO handlers

Define the socket lifecycle before adding handlers. Update the client connection hook and server handshake types so an authenticated chat-capable socket can connect when canonical quilt state is unavailable, while preserving canonical compatibility checks for quilt synchronization. Define `ConnectionAuth`, `SocketData`, `enforceCanonicalSocketCompatibility`, reconnect cleanup, and chat subscription teardown explicitly. Then add chat authorization and handlers in a focused realtime module, register them from the existing server composition root, authenticate from the immutable socket principal, validate all client input, load history before or during subscription, persist accepted sends before broadcasting, and emit replayable server records to authorized room members only. Preserve the PostgreSQL adapter for cross-replica fanout.

Files:
* `apps/server/src/realtime/chatRooms.ts` - chat scope normalization and authorization.
* `apps/server/src/realtime/chatHandlers.ts` - join/history/send/reconnect handling.
* `apps/server/src/index.ts` - typed handler registration and adapter integration only.
* `apps/server/src/auth/socketAuth.ts` and `apps/server/src/auth/principalContext.ts` - reuse existing identity boundary without trusting payload identity.
* `apps/server/src/contracts.ts` - update `ConnectionAuth` and `SocketData` only as required by the chat-capable handshake.
* `apps/server/src/index.test.ts` or focused server tests - protocol, authorization, and idempotency coverage.

Success criteria:
* Inactive or unauthorized users are rejected consistently.
* A persisted message is broadcast with a stable ID and cursor.
* Reconnect replay and duplicate sends do not create or display duplicate messages.
* Cross-replica listeners receive authorized messages.
* Chat connects, subscribes, and cleans up independently of canonical quilt readiness; quilt compatibility checks remain enforced for quilt handlers.

Context references:
* `apps/server/src/index.ts` - current Socket.IO server and PostgreSQL adapter registration.
* `apps/server/src/auth/socketAuth.ts` - authenticated socket principal.
* `apps/server/src/realtime/quiltRooms.ts` - nearest room authorization pattern, not a policy to copy blindly.

Dependencies:
* Steps 1.2, 2.1, and 2.2.

## Implementation Phase 3: Client Domain and Panel UI

<!-- parallelizable: false -->

### Step 3.1: Add chat cache and connection integration

Create a dedicated client domain module that merges history and live events by server message ID, orders by the server cursor, tracks the continuation cursor, reconciles optimistic sends by client message ID, and suppresses duplicate replay. Use the shared socket and existing connection status. Keep chat state separate from canvas state.

Files:
* `apps/client/src/domain/chatCache.ts` - pure ordered merge, cursor, and acknowledgement logic.
* `apps/client/src/domain/chatCache.test.ts` - focused duplicate, ordering, replay, and retry tests.
* `apps/client/src/network/useSocketConnection.ts` - chat event registration and lifecycle wiring.
* `apps/client/src/network/useConnectionStatus.ts` - reuse connection state in the UI.

Success criteria:
* History plus live events produce one deterministic ordered list.
* Retry acknowledgements replace pending entries instead of appending duplicates.
* The socket `connect`/reconnect callback requests the stored cursor for each active chat subscription and preserves unsent input state.

Context references:
* `apps/client/src/domain/quiltCache.ts` - nearest client state/cache pattern.
* `apps/client/src/network/useConnectionStatus.ts` - existing status vocabulary.
* `.copilot-tracking/research/2026-08-21/chat-feature-research.md` (Lines 93-102) - client integration requirements.

Dependencies:
* Steps 1.2 and 2.3.

### Step 3.2: Mount an accessible authenticated chat panel

Add a dedicated panel component and mount it in the authenticated shell. Implement loading, empty, disconnected, error, history pagination, composer validation, send acknowledgement, and safe plain-text rendering states. Do not add router infrastructure for the first slice. Preserve canvas layout and responsive behavior.

Files:
* `apps/client/src/ui/ChatPanel.tsx` - chat presentation and accessible composer.
* `apps/client/src/ui/ChatPanel.test.tsx` or existing client test location - focused UI behavior tests.
* `apps/client/src/App.tsx` - authenticated-shell placement and state wiring.
* `apps/client/src/App.css` and/or `apps/client/src/styles/` - scoped panel styling consistent with existing design tokens.

Success criteria:
* Authenticated users can open chat, view history, send valid text, and see live messages.
* Invalid, disconnected, and unauthorized states are visible without losing draft text.
* Composer and message list are keyboard accessible and message bodies are not interpreted as HTML.

Context references:
* `apps/client/src/App.tsx` - authenticated composition root.
* `apps/client/src/App.css` and `apps/client/src/styles/` - existing visual conventions.
* `.copilot-tracking/research/2026-08-21/chat-feature-research.md` (Lines 113-125) - UI and verification boundary.

Dependencies:
* Step 3.1 and the final product contract.

## Implementation Phase 4: Layered Validation and Documentation

<!-- parallelizable: false -->

### Step 4.1: Add layered tests

Cover pure client merge behavior, server payload validation and auth, repository ordering and idempotency, Socket.IO authorization and replay, and one root-level multi-replica browser path. Include an authenticated UI smoke path and reconnect behavior.

Files:
* `apps/client/src/domain/chatCache.test.ts` and `apps/client/src/ui/ChatPanel.test.tsx`.
* `apps/server/src/db/*chat*.test.ts` and focused server integration tests.
* `e2e/chat.spec.ts` - authenticated UI and reconnect coverage.
* `e2e/multi-user-fixtures.spec.ts` or a dedicated chat multi-user fixture - cross-user visibility and authorization.
* `e2e/support/multiReplica*` - reuse existing multi-replica setup when needed.

Success criteria:
* Tests prove authorization, ordering, retry idempotency, reconnect replay, safe rendering, and cross-replica delivery.

Dependencies:
* Phases 1 through 3.

### Step 4.2: Run project validation and update docs

Run focused tests first, then workspace lint, build, client/server tests, and the multi-replica E2E command. Update the selected product/API documentation and migration notes. Treat unresolved policy decisions as release blockers, not test gaps to waive silently.

Validation commands:
* `npx vitest run apps/client/src/domain/chatCache.test.ts` - client merge behavior.
* `npx vitest run apps/server/src/db apps/server/src/index.integration.test.ts` - persistence and server integration.
* `npm run lint:client` and `npm run lint:server` - modified workspaces.
* `npm run build` - all workspaces.
* `npm run test:client` and `npm run test:server` - workspace test suites.
* `npm run test:e2e:multi-replica` - cross-replica reconnect path.

Update `package.json` so `test:e2e:multi-replica` includes the chat-specific multi-replica spec, or add a dedicated `test:e2e:chat-multi-replica` script using `playwright.multi-replica.config.ts`. The command must execute the chat scenario rather than relying on the existing quilt-only spec.

Success criteria:
* Focused and full validation commands pass, or failures are documented with affected scope.
* Documentation matches the shipped scope and operational policies.

Dependencies:
* All implementation and test changes complete.

## Dependencies

* Existing Node/npm workspace dependencies and Socket.IO adapter.
* PostgreSQL test environment for repository and multi-replica coverage.
* Authenticated test issuer and existing Playwright preflight setup.
* Explicit product decisions for conversation scope, limits, retention, moderation, and account deletion.

## Success Criteria

* Chat uses the existing authenticated Socket.IO and PostgreSQL adapter path without a second transport stack.
* Messages are durable, ordered, authorized, replayable, and idempotent across retries and replicas.
* The authenticated client provides an accessible panel with explicit connection and validation states.
* Focused, workspace, and multi-replica validation covers the high-risk behavior.
