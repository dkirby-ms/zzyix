---
applyTo: '.copilot-tracking/changes/2026-07-17/multi-client-session-management-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Multi-Client Session Management

## Overview

Incrementally harden the existing server-authoritative session protocol so multiple clients can collaborate on the same canvas with predictable consistency, using `revision` tracking, `expectedRevision` in outbound mutations, deterministic ack propagation, and an explicit resync event.

## Objectives

### User Requirements

* Multiple clients can edit the same canvas simultaneously with consistent authoritative state. — Source: conversation context
* Optimistic local UX is preserved (tile appears immediately, reconciles on ack). — Source: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (Scope and Success Criteria)
* Gap and conflict recovery is predictable and does not require full page reload. — Source: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (Recommended Multi-Client Session Model)

### Derived Objectives

* Client must track authoritative `revision` alongside `lastOpSeq` so stale mutations can be detected. — Derived from: `SequencedTilesState` missing `revision` field (controller.ts:25-29).
* `expectedRevision` must be sent on every outbound `place_tile` and `remove_tile`. — Derived from: App.tsx mutation payloads omit the field despite contract support (contracts.ts:205-215, App.tsx:238-249).
* Acks must carry `newRevision` so the client can advance its revision deterministically without a round-trip snapshot. — Derived from: current `PlaceTileAck`/`RemoveTileAck` return only `opSeq` (contracts.ts:229-231, 253-254).
* Gap recovery must use an explicit server event rather than a disconnect/reconnect side effect. — Derived from: reconnect-as-resync has no guarantee of state ordering for concurrent clients (App.tsx:77-83).
* Per-author undo must be gated by a product decision before implementation. — Derived from: `handleUndo` targets the globally latest settled tile, problematic for concurrent users (App.tsx:257-275).

## Context Summary

### Project Files

* apps/client/src/interaction/controller.ts — Sequenced state type, reconcile helpers, gap detection (requiresSnapshot)
* apps/client/src/App.tsx — Session bootstrap, optimistic placement/remove flows, undo, snapshot recovery
* apps/client/src/network/useSocketConnection.ts — Socket lifecycle, event subscriptions, reconnect policy
* apps/server/src/contracts.ts — Shared protocol types: PlaceTilePayload/Ack, RemoveTilePayload/Ack, snapshot, delta events
* apps/server/src/index.ts — Socket auth, mutation handlers, ack emission, room broadcast
* apps/server/src/db/repository.ts — Transactional opSeq allocation, snapshot replay, idempotency
* apps/server/src/index.integration.test.ts — Real socket integration tests for mutation and broadcast ordering
* apps/client/src/interaction/controller.test.ts — Unit tests for reconcile/gap/optimistic helpers

### References

* .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md — Full research baseline with file-level evidence, gap analysis, and selected approach rationale

### Standards References

* apps/server/src/contracts.ts — Canonical source of truth for all client/server event payload types; any new fields must originate here

## Implementation Checklist

### [x] Implementation Phase 1: Client revision tracking and expectedRevision wiring

<!-- parallelizable: false -->

* [x] Step 1.1: Add `revision` to `SequencedTilesState` and update all constructors and reconcile helpers in controller.ts
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 14-75)
* [x] Step 1.2: Extend `PlaceTileAck`, `RemoveTileAck`, and `SessionSnapshotPayload` contracts with `revision`/`newRevision`; update `onSnapshot` in App.tsx to pass `revision` (DR-03)
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 76-115)
* [x] Step 1.3: Update `apps/server/src/db/repository.ts` persistence functions to return `newRevision`; update `apps/server/src/index.ts` mutation handlers and snapshot emission to include revision (DR-04)
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 116-160)
* [x] Step 1.4: Wire `expectedRevision` from `sequencedState.revision` into `place_tile` and `remove_tile` emissions in App.tsx
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 146-185)
* [x] Step 1.5: Update `reconcileOptimisticPlacementAck` to advance `revision` from ack `newRevision`
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 186-215)
* [x] Step 1.6: Add and update unit tests in controller.test.ts for revision progression
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 216-245)
* [x] Step 1.7: Validate Phase 1
  * Run `npm run type-check` (or `tsc --noEmit`) in both apps/client and apps/server
  * Run `npm test` in apps/client
  * Run `npm test` in apps/server

### [x] Implementation Phase 2: Explicit resync protocol

<!-- parallelizable: false -->

* [x] Step 2.1: Add `resync_required` to `ServerToClientEvents` in contracts.ts and define its payload type
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 246-275)
* [x] Step 2.2: Emit `resync_required` from server when a gap is detected or revision enforcement fails (apps/server/src/index.ts)
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 276-310)
* [x] Step 2.3: Subscribe to `resync_required` in `useSocketConnection.ts` and replace disconnect/reconnect in `requestSnapshot` (App.tsx)
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 311-355)
* [x] Step 2.4: Add two-client integration tests in apps/server/src/index.integration.test.ts
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 356-400)
* [x] Step 2.5: Validate Phase 2
  * Run full test suite in apps/server (`npm test`)
  * Run full test suite in apps/client (`npm test`)

### [x] Implementation Phase 3: Per-author undo

<!-- parallelizable: false -->

> **Decision confirmed (PD-01 Option A):** Undo removes the calling client's most recent tile, filtered by `clientId` using `placedBy` already present in `TilePlacedPayload` (contracts.ts:273-277).

* [x] Step 3.1: Store `placedBy` on tiles in client state derived from `TilePlacedPayload.placedBy` field
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 401-435)
* [x] Step 3.2: Update `handleUndo` in App.tsx to filter by `clientId` for per-author undo
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 436-460)
* [x] Step 3.3: Update controller.test.ts for per-author undo behavior
  * Details: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Lines 461-480)
* [x] Step 3.4: Validate Phase 3
  * Run `npm test` in apps/client

### [x] Implementation Phase 4: Final validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation
  * `npm run test` in apps/client (unit + integration)
  * `npm run test` in apps/server (unit + integration)
  * `npm run build` in apps/client (TypeScript compilation check)
* [x] Step 4.2: Fix minor validation issues
  * Iterate on type errors, lint warnings, and test failures with straightforward fixes
* [x] Step 4.3: Report blocking issues
  * Document issues requiring additional research and provide next steps; avoid large-scale inline refactoring

## Planning Log

See .copilot-tracking/plans/logs/2026-07-17/multi-client-session-management-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* TypeScript (shared across apps/client and apps/server)
* Socket.IO (server and client)
* Drizzle ORM + PostgreSQL (server persistence)
* Vitest (test runner for both apps)

## Success Criteria

* `SequencedTilesState.revision` is set after every ack and snapshot. — Traces to: DR-01 in research (controller.ts revision gap)
* `place_tile` and `remove_tile` emissions include `expectedRevision` from current client revision. — Traces to: Key Discoveries → Critical gaps
* `PlaceTileAck` and `RemoveTileAck` include `newRevision` and client advances revision on ack. — Traces to: Actionable Next Steps → Immediate
* A second socket client joining the same session receives the same canonical state as the first. — Traces to: User Requirements (multi-client collaboration)
* Gap recovery does not require socket disconnect; `resync_required` triggers a targeted snapshot request. — Traces to: DD-01 deviation rationale
* All existing unit and integration tests continue to pass. — Traces to: project quality baseline

## Product Decision Required

### PD-01: Per-author undo semantics

Multiple active clients will each have their own edit history on a shared canvas. The current `handleUndo` removes the globally most-recent settled tile across all authors.

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A | Per-author undo: remove the calling client's most recent tile, regardless of global order | Intuitive for individual authors; may feel inconsistent for observers watching the canvas |
| B | Global undo (current): remove the most recent tile placed by anyone | Predictable global ordering; can feel destructive when another user's tile is removed |
| C | Undo disabled in multi-client sessions | Safest; eliminates conflict; poor UX when collaborating |

**Recommendation:** Option A (per-author undo) because `placedBy` is already present in broadcast events (`TilePlacedPayload.placedBy`, contracts.ts:274), making implementation low-cost. It matches user mental models in collaborative tools.

**Decision:** Option A confirmed.
