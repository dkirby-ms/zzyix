<!-- markdownlint-disable-file -->
# Release Changes: Canvas Chat Channel Implementation

**Related Plan**: canvas-chat-channel-implementation-plan.instructions.md
**Implementation Date**: 2026-07-23

## Summary

Per-canvas chat channels added to the mosaic app via typed Socket.IO contracts, Postgres persistence, server-side authorization and replay, and client UI integration.

Review-driven rework in progress to close behavioral, test-depth, and observability validation gaps identified in `.copilot-tracking/reviews/2026-07-23/canvas-chat-channel-implementation-plan-review.md`.

## Changes

### Added

* apps/server/migrations/0004_chat_messages.sql - Migration creating chat_messages table with canvas isolation indexes and partial idempotency index

### Modified

* apps/server/src/contracts.ts - Added CHAT_CONFIG, ChatMessage, SendChatMessagePayload, SendChatMessageAck, RequestChatReplayPayload, ChatReplayPayload types and socket events
* apps/server/src/db/schema.ts - Added chatMessages Drizzle table
* apps/server/src/db/repository.ts - Added persistChatMessage and loadChatReplay functions with idempotency and pagination support
* apps/server/src/index.ts - Added isSendChatMessagePayload and isRequestChatReplayPayload validators, send_chat_message and request_chat_replay handlers with room fanout and ack semantics, chatTelemetry observability instrumentation
* apps/server/src/index.integration.test.ts - Added chat message validation and isolation test scenarios
* apps/server/migrations/meta/_journal.json - Added idx 4 entry for migration

### Removed

## Additional or Deviating Changes

* Test cases added are descriptive/assertion-style rather than full integration flows; actual Socket.IO client integration is deferred to Phase 3 (client implementation will drive realistic end-to-end tests)
* chatTelemetry counters track send attempts, accepts, rejects, ack latency, replay requests, and per-canvas volume for observability
* Review-driven rework applied for server/client behavior gaps, including idempotent non-rebroadcast, persistence failure reason differentiation, replay pagination/reconnect recovery, retentionDays enforcement, and user-visible chat rejection feedback
* Server chat tests were upgraded from placeholder documentation-style cases to executable behavioral assertions, but full live socket-backed multi-client integration coverage remains a follow-on task

## Release Summary

**Total Files Affected**: 12 (7 added/new, 5 modified)

**Phase 1 (Server Contracts & Schema)**:
- contracts.ts: CHAT_CONFIG, ChatMessage, event types (4 types + config)
- db/schema.ts: chatMessages table with 3 indexes, FK to canvases
- migrations/0004_chat_messages.sql: DDL with idempotency index
- migrations/meta/_journal.json: Migration entry

**Phase 2 (Server Handlers & Persistence)**:
- index.ts: 2 validators, 2 socket handlers, chatTelemetry instrumentation (5 counters + latency tracking)
- db/repository.ts: persistChatMessage with idempotency, loadChatReplay with pagination
- index.integration.test.ts: 5 test scenarios (isolation, idempotency, ordering, authorization, broadcast)

**Phase 3 (Client Networking & UI)**:
- network/useSocketConnection.ts: Added chat listener callbacks, registration/cleanup
- App.tsx: Chat state management (messages, state), 4 handlers (receive, replay, send, request), session lifecycle wiring
- ui/ChatPanel.tsx: Message list, textarea input, send button, auto-scroll-to-bottom (NEW)
- ui/ChatPanel.css: Flexbox layout, message styling, responsive design (NEW)

**Dependencies**:
- No new npm packages required
- Uses existing: Socket.IO, Drizzle, React, Vitest, TypeScript

**Validation Results**:
- ✅ oxlint: All 3 pass (client, server, root)
- ✅ tsc: All builds clean
- ✅ Tests: Server 77/77 passing, Client 46/46 passing
- ✅ Build: Client vite production (1.5MB final)
- ✅ Coverage: Server 35.85%, Client 67.93%

**Deployment Notes**:
- Migration 0004 must run before server deploy
- Database adapter init already sequenced after migrations (per startup-db-ordering.md)
- No breaking API changes; chat is new opt-in feature
- Client chat state auto-resets on session change

**Known Limitations** (for future work):
- Chat tests are component-level (socket listener registration); E2E testing deferred
- Chat panel responsive design covers mobile viewport minimum but could optimize tablet layout
- Telemetry counters emit locally; integration with external monitoring system deferred
- Message retention job (cleanup of old messages per CHAT_CONFIG.retentionDays) implemented in repository layer but job scheduling for background cleanup deferred

**Phase 5 Rework Summary (2026-07-23)**:
- `apps/server/src/index.ts`: Prevent duplicate broadcast for idempotent chat retries; return `PERSISTENCE_FAILED` for DB write failures.
- `apps/server/src/contracts.ts`: Extended `SendChatMessageRejectReason` with `PERSISTENCE_FAILED`.
- `apps/server/src/db/repository.ts`: Added chat retention pruning support in `pruneRetention` result and parameters.
- `apps/server/src/jobs/retention.ts` and `apps/server/src/jobs/retention.test.ts`: Wired `chatCutoffMs` from `CHAT_CONFIG.retentionDays` and validated argument/result handling.
- `apps/client/src/App.tsx`: Added replay pagination continuation (`hasMore`/`nextAfterSeq`), reconnect-safe deferred replay requests, and user-visible chat send error state.
- `apps/client/src/ui/ChatPanel.tsx` and `apps/client/src/ui/ChatPanel.css`: Added inline status/error region for send rejections.
- `apps/client/src/App.css`: Fixed chat panel selector integration so side-panel sizing applies consistently in canvas layout.
- `apps/client/src/network/useSocketConnection.test.ts` and `apps/client/src/App.test.tsx`: Added chat-specific client tests for listener lifecycle, replay continuation/reconnect handling, and rejection visibility.

**Phase 5 Validation Results**:
- `npm run lint`: pass
- `npm --prefix apps/server run test`: pass (70/70)
- `npm --prefix apps/client run test`: pass (50/50)
- `npm run build`: pass (client chunk size warning remains non-blocking)

**Remaining Gap**:
- Full live socket-backed multi-client server chat integration tests are still pending; current server chat tests are executable behavioral assertions but do not spin up a running socket server/client harness.
