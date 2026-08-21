---
title: Chat Feature Planning Log
description: Discrepancies, implementation paths, and follow-on work for chat planning
---
<!-- markdownlint-disable-file -->
## Planning Log: Chat Feature

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-01: Final product semantics for global, quilt-scoped, patch-scoped, direct, or multi-room chat remain unspecified.
  * Source: `.copilot-tracking/research/2026-08-21/chat-feature-research.md` Lines 70-92.
  * Reason: GitHub issue #55 requests a dedicated chat UI but does not define conversation topology.
  * Impact: high
* DR-02: Moderation, abuse reporting, unread state, and notification behavior remain unspecified.
  * Source: `.copilot-tracking/research/2026-08-21/chat-feature-research.md` Lines 70-92.
  * Reason: These policies require product and operational ownership beyond the architecture research.
  * Impact: high

### Plan Deviations from Research

* DD-01: The plan selects one authenticated shared conversation, active-principal membership, a 500-message retention bound, 2,000-character plain-text bodies, a 10-send rolling-minute limit, no edits/deletion endpoint, and nullable author references rendered as `Deleted user` after principal deletion.
  * Research recommends resolving these semantics before implementation.
  * Plan implements: concrete first-slice policies required for schema, authorization, and tests; moderation, abuse reporting, notifications, and unread state remain deferred.
  * Rationale: The task asks for planning now, and the issue does not supply the missing semantics. Explicit defaults prevent accidental policy decisions during coding.
* DD-02: The plan selects a generalized authenticated Socket.IO lifecycle that allows chat subscription independently of canonical quilt state while preserving existing quilt handshake behavior.
  * Research recommends making the socket lifecycle choice explicit because the current handshake is quilt-coupled.
  * Plan implements: one shared authenticated transport with independently authorized chat subscription.
  * Rationale: This preserves existing reconnect and PostgreSQL adapter behavior without duplicating authentication and transport infrastructure.
* DD-03: Rate limit enforcement (WI-03) was implemented as an in-memory, per-process rolling-minute counter in `chatHandlers.ts` rather than a cross-replica shared counter.
  * Review requirement: enforce the 10-send rolling-minute limit per principal.
  * Plan implements: a single-process `Map`-based sliding window, which is correct for a single server instance but does not share counts across horizontally scaled replicas behind the PostgreSQL adapter.
  * Rationale: Matches the 1-2 hour fix effort from the review and closes the release-blocking scope gap. A cross-replica limiter (for example, backed by Postgres or Redis) is tracked as follow-on work if the deployment runs multiple server replicas.
* DD-04: Discovered during manual testing (not in the original review): inserting a chat message failed with a foreign key violation on `chat_messages.conversation_id` because no code or migration ever seeds the shared `conversations` row referenced by `SHARED_CHAT_CONVERSATION_ID`.
  * Fix: added `ensureSharedConversation()` in `chatRepository.ts`, an idempotent `insert ... onConflictDoNothing()` seed of the shared conversation row, called before the message insert in `sendMessage()`.
  * Rationale: Mirrors the existing `onConflictDoNothing()` lazy-provisioning pattern already used in `repository.ts` for canvases, avoiding a hand-written Drizzle migration/snapshot edit for a single seed row.

## Implementation Paths Considered

### Selected: Shared authenticated Socket.IO with independent chat subscription

* Approach: Extend the typed existing connection, generalize its authenticated lifecycle where necessary, authorize chat conversations separately, persist messages in PostgreSQL, and mount a panel in the existing authenticated shell.
* Rationale: Reuses verified transport, auth, adapter, reconnect, and UI composition boundaries while supporting durable replay and cross-replica delivery.
* Evidence: `.copilot-tracking/research/2026-08-21/chat-feature-research.md` Lines 93-125 and planning addendum Lines 172-180.

### IP-01: Separate authenticated Socket.IO connection or namespace

* Approach: Create an independent chat connection with its own handshake, reconnect, event registration, and authorization lifecycle.
* Trade-offs: Cleaner isolation from quilt initialization, but duplicates lifecycle code and increases connection, authentication, and replica behavior to test.
* Rejection rationale: No evidence requires a second transport boundary; the existing adapter and auth path already support the feature.

### IP-02: Keep chat bound to the current quilt socket and room

* Approach: Permit chat only while canonical quilt state is active and use quilt room membership as chat membership.
* Trade-offs: Smaller initial wiring, but makes chat unavailable outside canvas readiness and risks coupling unrelated authorization policies.
* Rejection rationale: A dedicated user chat should have an explicit lifecycle and policy independent of canvas state.

### IP-03: SSE or plain WebSocket transport

* Approach: Introduce a second realtime transport for chat delivery and separate mutation/replay behavior.
* Trade-offs: Potentially specialized transport control, but duplicates Socket.IO lifecycle, auth, replay, and cross-replica fanout infrastructure.
* Rejection rationale: Existing Socket.IO already provides the required bidirectional behavior and PostgreSQL adapter.

## Suggested Follow-On Work

* WI-01: Define moderation and abuse response, including moderation hooks, reporting, structured events, and retention/deletion runbooks after the first slice is accepted. (Medium priority)
  * Source: DR-02.
  * Dependency: Initial durable message schema and first-slice policy implementation.
* WI-02: Evaluate richer conversation topology — assess direct conversations, multiple rooms, unread state, and notifications after shared chat usage is understood. (Medium priority)
  * Source: DR-01 and deferred product scope.
  * Dependency: First-slice shared conversation is shipped.
* WI-03: ✅ Resolved — 10-send rolling-minute chat limit is now enforced per principal in `chatHandlers.ts` with a focused boundary test. The current limiter is per-process; if the server is scaled to multiple replicas, replace it with a shared counter (for example, backed by Postgres or Redis) so the limit holds across instances. (Medium priority, non-blocking for single-replica deployments)
  * Source: `docs/chat-product-contract.md` and Phase 4 validation review.
  * Dependency: A shared rate-limit strategy that works with the PostgreSQL adapter and has focused tests, if multi-replica enforcement is required.
* WI-04: Add a proper Drizzle migration (or startup seed step) that inserts the shared `conversations` row instead of relying on lazy `onConflictDoNothing()` provisioning inside `sendMessage()`, for clearer operational visibility. (Low priority)
  * Source: Manual testing discovery, DD-04.
  * Dependency: None; current lazy-provisioning fix is functionally correct.

## Validation Status

* Initial plan review: ready for implementation planning with DR-01 and DR-02 explicitly tracked.
* Critical findings: none.
* Major findings: none after selecting and documenting the socket lifecycle path and correcting phase metadata.
* Remaining minor risk: exact migration filename, repository module split, and final component naming depend on local implementation discovery at execution time.
* Validation note: the repository does not expose a `validate:frontmatter` script; frontmatter was checked manually against the repository instruction requirements.
* Phase 4 validation note: focused client, repository, handler, lint, build, and full client commands passed. Full server tests were blocked by missing `psql` and two duplicate-key integration failures; multi-replica E2E was blocked by missing Chromium Linux libraries. Playwright listed all four new chat tests successfully.
* Release blocker: resolved. `chatHandlers.ts` now enforces the 10-send rolling-minute rate limit (DD-03) and the shared conversation FK-violation bug found in manual testing is fixed (DD-04). Unused test imports flagged by lint review were removed.

