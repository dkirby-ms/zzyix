---
title: RPI Validation - Revisioning Idempotency Plan Phase 002
description: Validation of implementation coverage for phase 2 (contract and repository idempotency foundation) against plan, changes log, and research artifacts.
ms.date: 2026-07-16
ms.topic: how-to
---

## Validation Scope

* Plan: [ .copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md ](.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md#L64)
* Changes log: [ .copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md ](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L1)
* Research: [ .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md ](.copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md#L1)
* Target phase: 2

## Phase Status

* Status: Partial
* Overall assessment: Phase 2 implementation is mostly complete for repository idempotency and conflict handling, but one required contract alignment item is not fully implemented.

## Phase 2 Checklist Validation

### Step 2.1 - Update transport contract reject/ack shapes for idempotency and revision outcomes

* Result: Partial
* Evidence implemented:
  * Reject reasons include duplicate/stale/out-of-order variants in [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L226).
  * Ack types include idempotent replay indicator in [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L235).
* Gap:
  * `PlaceTilePayload.tileId` remains optional in [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L219), while selected implementation guidance expected deterministic tile UUID input for idempotent retry handling in [ .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md ](.copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md#L119).

### Step 2.2 - Add place_tile duplicate detection path with existing opSeq reuse and no new writes

* Result: Pass
* Evidence:
  * Advisory lock still wraps mutation path in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L343).
  * Existing idempotency replay lookup and deterministic ack reuse in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L379).
  * Duplicate tile detection via tile id and prior op lookup in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L423).
  * Replay returns prior `opSeq` and marks `idempotent: true` in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L470).
  * New-write path still emits exactly one `tile_placed` operation with fresh `opSeq` in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L495).

### Step 2.3 - Add remove_tile idempotent replay path with prior tile_removed opSeq reuse

* Result: Pass
* Evidence:
  * Existing idempotency replay lookup for remove in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L583).
  * Missing-tile fallback finds prior `tile_removed` op and reuses `opSeq` in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L614).
  * Replay ack marks `idempotent: true` and avoids new write allocation in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L646).
  * Never-seen tile path returns typed not-found outcome without synthetic operation write in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L664).

### Step 2.4 - Validate phase changes (lint/build)

* Result: Pass (based on provided evidence)
* Evidence:
  * Server lint/build validation documented as passed in [ .copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md ](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L68).

## Severity-Graded Findings

### Critical

* None.

### Major

1. Contract does not require client-supplied tile identifier for place operation
* Severity: Major
* Why it matters: The selected idempotency model is tile-UUID based; leaving `tileId` optional weakens deterministic retry identity at the transport boundary and allows server-generated IDs when client omits the field.
* Plan/Research expectation:
  * Phase 2 contract intent in [ .copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md ](.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md#L68)
  * Selected implementation guidance requiring tile ID in [ .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md ](.copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md#L119)
* Actual implementation evidence:
  * Optional field in [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L219)
  * Fallback random UUID generation in repository in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L345)

### Minor

* None.

## Coverage Assessment

* Phase 2 checklist items fully implemented: 3 of 4
* Phase 2 checklist items partially implemented: 1 of 4
* Phase 2 checklist items not implemented: 0 of 4
* Estimated coverage: 85%

## Deviations and Notes

* Changes log claims all phases complete in [ .copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md ](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L44), but phase 2 contains one material contract gap.
* No additional unlogged phase-2 implementation files were discovered in workspace status during this validation pass.

## Clarifying Questions

1. Should phase 2 require `PlaceTilePayload.tileId` to be mandatory at the transport contract level, matching the selected tile-UUID idempotency strategy?
2. If optional `tileId` is intentional, should the phase plan/research be updated to explicitly accept server-generated IDs for first-write requests?

## Recommended Next Validations

1. Validate phase 3 socket handler behavior for duplicate replay broadcast suppression against actual `idempotent` flags.
2. Validate phase 4 tests explicitly cover the optional `tileId` path to detect retry-identity regressions.
3. Reconcile plan and research language with final contract decision (`tileId` required vs optional).
