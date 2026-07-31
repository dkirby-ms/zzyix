---
title: Infinite Quilt Canvas Phase 5 Validation
description: Validation of protocol-v2 area-of-interest delivery against the implementation plan, changes log, research, and repository evidence
author: GitHub Copilot
ms.date: 2026-07-27
ms.topic: reference
---

## Validation Scope

Status: Failed

Phase 5 covers authenticated protocol contracts, bounded room resolution, patch cursor recovery, client reconnect behavior, and two-replica recovery validation. Validation compared the plan and planning log with the changes log and primary research, then inspected the protocol contracts, room authorization and budgets, client recovery, PostgreSQL adapter harness, and executable tests.

## Plan-to-Change Comparison

| Plan item | Changes-log claim | Verified status | Evidence |
|-----------|-------------------|-----------------|----------|
| Step 5.1: Authenticated protocol and bounded room resolution | Contracts, room resolver, repository recovery, server integration, and protocol tests are complete | Partial | Contracts define handshake, limits, outcomes, cursors, snapshots, and events in `apps/server/src/contracts.ts:464-548`. Canonical room resolution and budgets exist in `apps/server/src/realtime/quiltRooms.ts:77-155`. The production socket path never supplies an external identity and disables v2 mutation in `apps/server/src/index.ts:1669-1682`. |
| Step 5.2: Client cursors and reconnect recovery | Client negotiation, cursor reconciliation, scoped snapshots, resync, and duplicate suppression are complete | Partial | The client requests v2 and suppresses v1 durable handlers after negotiation in `apps/client/src/network/useSocketConnection.ts:51-99`. It merges scoped snapshots and events and resubscribes on a resync signal in `apps/client/src/App.tsx:581-617`. No server production path emits `quilt_patch_resync_required`, and the cross-replica test supplies an already-current cursor. |
| Step 5.3: Two-replica recovery harness | Two PostgreSQL-backed replicas prove recovery, authorization, deduplication, and attachments | Partial | The configuration starts ports 3201 and 3202 in `playwright.multi-replica.config.ts:5-34`; the server installs the PostgreSQL adapter in `apps/server/src/index.ts:1560-1577`; and the test sends a 9 KiB room event across replicas in `e2e/quilt-reconnect.spec.ts:59-82`. The reconnect assertion does not simulate a stale cursor or missed event in `e2e/quilt-reconnect.spec.ts:85-103`. |
| Step 5.4: Protocol validation | Server, client, and multi-replica suites pass | Partial | The focused server suite passed 39 tests and the client suite passed 34 tests in this session. The multi-replica suite could not start because PostgreSQL on port 5432 refused connections until Playwright's 120-second web-server timeout. |

## Verified Evidence

* Explicit `accepted`, `forbidden`, `invalid`, and `budget-exceeded` outcomes are part of the wire contract at `apps/server/src/contracts.ts:509-521`.
* Room addresses are canonicalized, aliases are deduplicated, and room, chunk, connection, and churn limits are enforced at `apps/server/src/realtime/quiltRooms.ts:77-155`.
* Snapshot tile and serialized-payload limits are checked before snapshots are emitted at `apps/server/src/index.ts:2292-2362`.
* Protocol-v2 sockets do not join the legacy session room, and legacy mutation, presence, chunk, selection, and whole-session snapshot handlers reject or ignore v2 sockets at `apps/server/src/index.ts:1690-1722`, `apps/server/src/index.ts:1739-1760`, and `apps/server/src/index.ts:1935-2208`.
* The client registers scoped snapshot, event, and resync handlers and removes them during cleanup at `apps/client/src/network/useSocketConnection.ts:91-99` and `apps/client/src/network/useSocketConnection.ts:132-140`.
* The client unit test verifies that negotiated v2 ignores legacy session snapshots and placement/removal events at `apps/client/src/network/useSocketConnection.test.ts:216-262`.
* Migration 0005 provisions the adapter attachment table with a binary payload column at `apps/server/migrations/0005_finite_toroidal_quilt.sql:99-104`.
* The replica scenario uses distinct server processes, receives a 9 KiB adapter event emitted by the other replica, checks anonymous fine-data denial, and deduplicates a toroidal room alias at `e2e/quilt-reconnect.spec.ts:43-82`.

## Findings

### Critical

1. Authenticated protocol-v2 fine delivery, presence, events, and mutation are not reachable in production. Socket middleware accepts only caller-provided `sessionId` and `clientId`, then stores that transport identity at `apps/server/src/index.ts:1611-1634`. Both delivery-context calls omit the repository's optional external identity input at `apps/server/src/index.ts:1669` and `apps/server/src/index.ts:2237`, while external-principal resolution only occurs when `identity` is supplied at `apps/server/src/db/repository.ts:1435-1454`. The handshake hard-codes `mutationEnabled: false` at `apps/server/src/index.ts:1678-1682`, and both legacy mutation handlers reject v2 at `apps/server/src/index.ts:1751-1758` and `apps/server/src/index.ts:1864-1867`. The only `quilt_patch_event` publication is the test-control endpoint at `apps/server/src/index.ts:1470-1530`. This fails Step 5.1's authenticated protocol and one-mutation/one-scoped-stream criteria and the research requirement to use a stable principal rather than `clientId`.

2. Reconnect recovery from a missed event is not demonstrated. The server compares the supplied cursor only for exact equality and otherwise emits a current scoped snapshot at `apps/server/src/index.ts:2306-2325`; no production code emits the declared `quilt_patch_resync_required` event. The multi-replica test reconnects with `opSeq`, `revision`, and `eventId` copied from the event it already received at `e2e/quilt-reconnect.spec.ts:72-103`, so the cursor matches and no missed-event recovery occurs. This does not prove Step 5.2's failed-automatic-recovery criterion or Step 5.3's cursor convergence criterion.

### Major

1. Aggregate subscriptions carry neither fine tiles nor aggregate content. The shared snapshot contract exposes only `tiles` at `apps/server/src/contracts.ts:524-530`, and the server converts aggregate snapshots to an empty tile array at `apps/server/src/index.ts:2313`. This is authorization-safe but does not implement the research requirement for authorized aggregate delivery or provide useful far-zoom recovery.

2. Requested chunk IDs affect validation and budgets but not room identity or snapshot scope. The resolver retains `chunkIds` at `apps/server/src/realtime/quiltRooms.ts:102-105` and `apps/server/src/realtime/quiltRooms.ts:144-153`, but canonical room identity contains only quilt, patch, and kind at `apps/server/src/realtime/quiltRooms.ts:43-44`, and the server loads the full patch snapshot without passing chunks at `apps/server/src/index.ts:2295-2314`. A request can therefore stay under the chunk-count budget while receiving an entire patch, contrary to area-of-interest delivery and bounded snapshot intent.

### Minor

1. The focused server command passes while executing little of the live protocol integration. Its session coverage reported `apps/server/src/index.ts` at 23.57 percent lines and `apps/server/src/db/repository.ts` at 10.72 percent lines. The protocol-v2 authorization cases in `apps/server/src/index.integration.test.ts:880-918` exercise exported helper functions rather than socket handshake, database identity mapping, subscription acknowledgement, and publication together. The changes log overstates protocol integration coverage.

## Coverage Assessment

Phase 5 coverage is approximately 55 percent by required behavior. Protocol types, explicit outcomes, canonical patch rooms, configurable limits, client handler registration, v1 suppression, scoped snapshot replacement, two-process adapter wiring, and large adapter payload transport are present. Core acceptance behavior remains absent or unproven: authenticated principal establishment, member fine/presence/event subscriptions, v2 mutations and durable publication, useful aggregate payloads, chunk-scoped AOI delivery, and stale-cursor cross-replica recovery.

The implementation fails closed where identity is unavailable, which is the correct security posture. It does not, however, satisfy a completed Phase 5 because the plan explicitly requires authenticated delivery and mutation behavior rather than only denial of unauthenticated access.

## Clarifying Questions

* Which external identity provider and trusted handshake claim should populate `loadQuiltDeliveryContext.identity`?
* Should protocol-v2 aggregate snapshots reuse the existing chunk aggregate shape or define a patch-level aggregate contract?
* Is recovery intended to replay persisted events after a cursor, or is a bounded scoped snapshot the approved fallback for every cursor mismatch?
* Are chunk IDs intended to create chunk-specific rooms, or only to filter one patch-kind room's snapshot and publications?

## Recommended Next Validations

* Add an integration test that maps a trusted external subject to a principal and proves member and non-member outcomes for fine, aggregate, presence, and event rooms.
* Add a production protocol-v2 mutation test that persists one operation and observes exactly one scoped event with no v1 session event.
* Reconnect replica B with a stale cursor after deliberately missing one or more replica-A events, then assert scoped convergence and duplicate suppression.
* Assert that aggregate subscriptions return defined aggregate data without exposing fine tile content.
* Seed multiple chunks in one patch and prove requested chunk IDs bound snapshot and publication content.
* Start the disposable PostgreSQL service and rerun `npx playwright test --config=playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts --reporter=line`.