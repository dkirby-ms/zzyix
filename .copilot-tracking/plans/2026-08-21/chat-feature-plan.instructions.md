---
description: Implementation plan for an authenticated durable chat feature
applyTo: '**/*'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Chat Feature

## Overview

Implement an authenticated, durable first-slice chat experience on the existing Socket.IO and PostgreSQL foundations, with typed contracts, explicit authorization, cursor replay, idempotent sends, a dedicated client domain, and an authenticated-shell panel.

## Objectives

### User Requirements

* Add a dedicated UI chat for authenticated users to talk to each other — Source: GitHub issue #55 and `.copilot-tracking/research/2026-08-21/chat-feature-research.md` Lines 1-12.
* Fit the feature into the existing client/server architecture and testing conventions — Source: supplied research Lines 14-23.

### Derived Objectives

* Preserve server-derived identity, durable ordering, reconnect recovery, and cross-replica delivery — Derived from research Lines 93-112 and existing auth/realtime boundaries.
* Keep chat state and authorization separate from canvas state and quilt room policy — Derived from research Lines 93-102 and the verified socket lifecycle review.
* Make product-policy gaps explicit before production rollout — Derived from issue #55's unspecified scope, retention, moderation, limits, and deletion semantics.

## Context Summary

### Project Files

* `apps/server/src/contracts.ts` - typed Socket.IO event maps and safe profile shapes.
* `apps/client/src/network/useSocketConnection.ts` - shared authenticated transport and reconnect lifecycle.
* `apps/client/src/network/useConnectionStatus.ts` - connection state for UI behavior.
* `apps/server/src/auth/socketAuth.ts` and `apps/server/src/auth/principalContext.ts` - immutable authenticated principal boundary.
* `apps/server/src/db/schema.ts`, `apps/server/src/db/repository.ts`, and `apps/server/src/db/migrate.ts` - persistence, repository, and migration conventions.
* `apps/server/src/index.ts` - Socket.IO server and PostgreSQL adapter composition root.
* `apps/server/src/realtime/quiltRooms.ts` - nearby room normalization and authorization pattern.
* `apps/client/src/App.tsx` - authenticated application shell.
* `e2e/` - root-level authenticated, reconnect, multi-user, and multi-replica test patterns.

### References

* `.copilot-tracking/research/2026-08-21/chat-feature-research.md` - architecture research, alternatives, constraints, and planning addendum at Lines 172-180.
* `package.json` - verified lint, build, unit, integration, and E2E commands.
* GitHub issue #55 - requested dedicated user chat.

### Standards References

* `.github/instructions/hve-core/markdown.instructions.md` - Markdown frontmatter and structure rules.
* `.github/instructions/hve-core/writing-style.instructions.md` - concise, precise planning prose.
* `.github/instructions/shared/hve-core-location.instructions.md` - repository instruction fallback guidance.

## Implementation Checklist

### [ ] Implementation Phase 1: Product Contract and Shared Protocol

<!-- parallelizable: false -->

* [ ] Step 1.1: Freeze first-slice conversation scope, membership, limits, unsupported features, and account lifecycle behavior.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 10-38.
* [ ] Step 1.2: Add typed chat events, payloads, cursors, stable IDs, idempotency IDs, safe profiles, and error outcomes.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 40-61.

### [ ] Implementation Phase 2: Durable Storage and Server Authorization

<!-- parallelizable: false -->

* [ ] Step 2.1: Add Drizzle schema, migration, ordered cursor/index strategy, bounded body, principal FK policy, and retry uniqueness.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 63-94.
* [ ] Step 2.2: Add repository operations for authorization, history, cursor replay, and transactional idempotent insertion.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 96-108.
* [ ] Step 2.3: Add authenticated join/history/send/reconnect handlers and register them through the existing Socket.IO adapter composition root.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 110-148.

### [ ] Implementation Phase 3: Client Domain and Panel UI

<!-- parallelizable: false -->

* [ ] Step 3.1: Add ordered chat cache, cursor tracking, optimistic acknowledgement reconciliation, duplicate suppression, and shared connection wiring.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 150-178.
* [ ] Step 3.2: Mount an accessible responsive chat panel in the authenticated shell with explicit loading, empty, error, disconnected, and validation states.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 180-214.

### [ ] Implementation Phase 4: Layered Validation and Documentation

<!-- parallelizable: false -->

* [ ] Step 4.1: Add client, server, repository, Socket.IO, authenticated UI, reconnect, multi-user, and multi-replica tests.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 216-233.
* [ ] Step 4.2: Run focused checks, workspace lint/build/tests, multi-replica E2E, and update product/API and migration documentation.
  * Details: `.copilot-tracking/details/2026-08-21/chat-feature-details.md` Lines 235-267.

## Planning Log

See `.copilot-tracking/plans/logs/2026-08-21/chat-feature-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Existing Node/npm workspace dependencies, Socket.IO, PostgreSQL adapter, Drizzle, and authenticated test issuer.
* PostgreSQL availability for repository and multi-replica validation.
* Product decisions for conversation scope, membership, limits, retention, moderation, and account deletion.

## Success Criteria

* Authenticated users can access a dedicated panel and exchange bounded plain-text messages — Traces to: GitHub issue #55 and research Lines 113-125.
* Messages are persisted before broadcast, server-authored, ordered by a unique cursor, replayable after reconnect, and idempotent across retries — Traces to: research Lines 103-112 and details Lines 67-164.
* Unauthorized users cannot read, join, or send; authorized users receive only their conversation's messages — Traces to: research Lines 74-84 and details Lines 127-164.
* Client, server, workspace, and multi-replica validation cover the high-risk behavior — Traces to: research Lines 113-125 and details Lines 232-278.
