---
title: Phase 3 Validation - Revisioning and Idempotency
description: Validation of phase 3 implementation against plan, changes log, research requirements, and code evidence.
author: GitHub Copilot
ms.date: 2026-07-16
ms.topic: how-to
---

## Validation Scope

* Plan: [.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md](.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md)
* Changes log: [.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md)
* Research: [.copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md](.copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md)
* Phase validated: 3
* Output target: [.copilot-tracking/reviews/rpi/2026-07-16/revisioning-idempotency-plan-003-validation.md](.copilot-tracking/reviews/rpi/2026-07-16/revisioning-idempotency-plan-003-validation.md)

## Overall Status

* Status: Partial
* Coverage assessment: 3 of 4 phase 3 checklist steps are fully evidenced. 1 step has a design-location deviation from the phase detail specification.

## Phase 3 Checklist Validation

### Step 3.1 Align socket handlers to idempotent repository return shapes and deterministic ack/broadcast behavior

* Plan requirement: [revisioning-idempotency-plan.instructions.md](.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md#L82)
* Detail requirement and success criteria: [revisioning-idempotency-details.md](.copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md#L153)
* Changes log claim: [revisioning-idempotency-changes.md](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L24)

Evidence:
* Replay-safe broadcast suppression for place operations in socket handler: [apps/server/src/index.ts](apps/server/src/index.ts#L548)
* Guard to avoid duplicate place broadcast on idempotent ack: [apps/server/src/index.ts](apps/server/src/index.ts#L550)
* Replay-safe broadcast suppression for remove operations: [apps/server/src/index.ts](apps/server/src/index.ts#L581)
* Guard to avoid duplicate remove broadcast on idempotent ack: [apps/server/src/index.ts](apps/server/src/index.ts#L583)
* Idempotent replay ack shape surfaced from repository for placement: [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L413)
* Idempotent replay ack shape surfaced from repository for removal: [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L607)

Result: Pass

### Step 3.2 Enforce stale/out-of-order conflict checks using explicit revision inputs and typed reject outcomes

* Plan requirement: [revisioning-idempotency-plan.instructions.md](.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md#L84)
* Detail requirement and file expectations: [revisioning-idempotency-details.md](.copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md#L166)
* Changes log claim: [revisioning-idempotency-changes.md](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L22)

Evidence (implemented):
* Revision field included in payload contracts: [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L218), [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L250)
* Typed conflict outcomes are present in contract reject reason unions: [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L232), [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L233), [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L242), [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L243)
* Stale revision rejection in repository pre-write path for place: [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L349), [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L360)
* Out-of-order rejection in repository pre-write path for place: [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L364), [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L374)
* Stale and out-of-order rejection in repository pre-write path for remove: [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L553), [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L564), [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L578)

Deviation:
* Phase detail explicitly calls for validating revision preconditions in the socket handler before invoking repository mutations: [revisioning-idempotency-details.md](.copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md#L170)
* Current handler validates shape/type/range only, then calls repository without handler-level revision comparison: [apps/server/src/index.ts](apps/server/src/index.ts#L81), [apps/server/src/index.ts](apps/server/src/index.ts#L129), [apps/server/src/index.ts](apps/server/src/index.ts#L540), [apps/server/src/index.ts](apps/server/src/index.ts#L573)

Result: Partial

### Step 3.3 Add replay and recovery behavior notes in contracts/comments

* Plan requirement: [revisioning-idempotency-plan.instructions.md](.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md#L86)
* Detail requirement and success criteria: [revisioning-idempotency-details.md](.copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md#L187)
* Changes log claim: [revisioning-idempotency-changes.md](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L25)

Evidence:
* Contract comment documents revision semantics and retry behavior: [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L210)
* Contract comment documents replay semantics for remove path: [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L247)
* Handler comment documents no-rebroadcast behavior for replayed place operations: [apps/server/src/index.ts](apps/server/src/index.ts#L548)
* Handler comment documents no-rebroadcast behavior for replayed remove operations: [apps/server/src/index.ts](apps/server/src/index.ts#L581)
* Retention comment documents idempotency-key TTL cleanup expectations: [apps/server/src/jobs/retention.ts](apps/server/src/jobs/retention.ts#L9)

Result: Pass

### Step 3.4 Validate phase changes (lint/build)

* Plan requirement: [revisioning-idempotency-plan.instructions.md](.copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md#L88)
* Detail commands: [revisioning-idempotency-details.md](.copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md#L214)
* Changes log validation evidence: [revisioning-idempotency-changes.md](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L69), [revisioning-idempotency-changes.md](.copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md#L70)

Result: Pass

## Severity-Graded Findings

### Critical

* None.

### Major

1. Handler-level revision precondition checks were not implemented where phase 3 detail requested them.
* Impact: This is a deviation from the specified architectural boundary for step 3.2. Functional conflict behavior exists, but enforcement is centralized in repository paths rather than split across handler and repository as specified.
* Evidence:
  * Required handler-level check location: [revisioning-idempotency-details.md](.copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md#L170)
  * Current handler invokes repository directly after payload validation: [apps/server/src/index.ts](apps/server/src/index.ts#L540), [apps/server/src/index.ts](apps/server/src/index.ts#L573)
  * Conflict checks currently implemented in repository: [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L349), [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L553)

### Minor

* None.

## Unlogged Changes Review

* No additional phase-3-relevant source-file modifications were detected beyond the files described in the changes log.
* Existing untracked artifact observed outside this phase validation scope: [.copilot-tracking/reviews/2026-07-16/revisioning-idempotency-plan-review.md](.copilot-tracking/reviews/2026-07-16/revisioning-idempotency-plan-review.md)

## Coverage Summary

* Step 3.1: Pass
* Step 3.2: Partial
* Step 3.3: Pass
* Step 3.4: Pass

Phase 3 verdict: Partial

## Clarifying Questions

1. Should step 3.2 be considered acceptable when stale/out-of-order enforcement is repository-only, or do you want explicit handler-level revision checks added to match the detail spec literally?

## Recommended Next Validations

1. Validate phase 4 checklist completion with direct mapping to [apps/server/src/index.test.ts](apps/server/src/index.test.ts) and [apps/server/src/index.integration.test.ts](apps/server/src/index.integration.test.ts).
2. Confirm whether phase 5 validation artifacts include command transcripts or CI links for auditable evidence.
3. Review whether the phase detail spec should be updated to reflect repository-centric conflict enforcement if that is the intended architecture.
