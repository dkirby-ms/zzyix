---
title: "RPI Validation Phase 4: Postgres and Realtime Transport"
description: "Validation of Implementation Phase 4 against plan, changes log, and research artifacts."
ms.date: 2026-07-16
ms.topic: "how-to"
---

## Validation Scope

* Phase: 4
* Plan: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md
* Changes log: .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md
* Research: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md
* Validation target: Multi-instance transport and presence hardening (Steps 4.1, 4.2, 4.3)

## Validation Status

**Status: Partial**

Phase 4 implementation is substantially present for adapter wiring and presence persistence. Coverage is partial because Phase 4 validation intent includes multi-instance behavior confidence, but current tests do not verify real Postgres adapter fan-out or LISTEN/NOTIFY cross-instance delivery.

## Phase 4 Requirement-to-Change Mapping

### Step 4.1: Wire Socket.IO Postgres adapter with shared pool and affinity assumptions

* Result: **Implemented with one validation gap**
* Evidence implemented:
  * Socket.IO Postgres adapter import and wiring exist in [apps/server/src/index.ts](apps/server/src/index.ts#L4) and [apps/server/src/index.ts](apps/server/src/index.ts#L419).
  * Adapter uses shared DB pool via [apps/server/src/index.ts](apps/server/src/index.ts#L428).
  * Dependency present in [apps/server/package.json](apps/server/package.json#L18).
  * Sticky-session/affinity assumptions and limits documented in [docs/decisions/2026-07-15-deployment-architecture-v01.md](docs/decisions/2026-07-15-deployment-architecture-v01.md#L92) and [docs/decisions/2026-07-15-deployment-architecture-v01.md](docs/decisions/2026-07-15-deployment-architecture-v01.md#L95).
* Deviation:
  * No Phase 4 evidence of real multi-instance adapter verification (cross-replica fan-out).

### Step 4.2: Persist presence transitions and finalize connection lifecycle behavior

* Result: **Implemented**
* Evidence implemented:
  * Join upsert with active semantics (`left_at = null`) in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L197).
  * Leave transition persisted via `left_at` update in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L216).
  * Active participant query uses `left_at IS NULL` semantics in [apps/server/src/db/repository.ts](apps/server/src/db/repository.ts#L224).
  * Connect flow persists presence and emits `client_joined` in [apps/server/src/index.ts](apps/server/src/index.ts#L460) and [apps/server/src/index.ts](apps/server/src/index.ts#L468).
  * Disconnect flow persists leave transition and emits `client_left` in [apps/server/src/index.ts](apps/server/src/index.ts#L567) and [apps/server/src/index.ts](apps/server/src/index.ts#L568).
  * Presence lifecycle helper coverage exists in [apps/server/src/index.integration.test.ts](apps/server/src/index.integration.test.ts#L79) and [apps/server/src/index.integration.test.ts](apps/server/src/index.integration.test.ts#L107).

### Step 4.3: Validate phase changes

* Result: **Partially implemented**
* Evidence implemented:
  * Validation commands are declared in phase details document for integration/concurrency suites.
  * Concurrency behavior is tested in [apps/server/src/index.concurrency.test.ts](apps/server/src/index.concurrency.test.ts#L1).
  * Presence helper behaviors are tested in [apps/server/src/index.integration.test.ts](apps/server/src/index.integration.test.ts#L79).
* Missing/deviating work:
  * No test evidence for adapter-specific multi-instance fan-out behavior. Existing tests focus on in-process authoritative state and mocked repository behavior, not Postgres adapter transport propagation.

## Severity-Graded Findings

### Critical

* None identified.

### Major

1. Missing verification of Postgres adapter cross-instance propagation for Phase 4 transport hardening.
   * Why this matters: Phase 4 explicitly targets multi-instance transport hardening. Without cross-instance verification, regressions in adapter configuration, channel behavior, or NOTIFY propagation can pass current tests.
   * Evidence:
     * Adapter is configured in runtime: [apps/server/src/index.ts](apps/server/src/index.ts#L419).
     * Current integration tests cover presence helper flows only: [apps/server/src/index.integration.test.ts](apps/server/src/index.integration.test.ts#L79).
     * Current concurrency tests are in-process and adapter-agnostic: [apps/server/src/index.concurrency.test.ts](apps/server/src/index.concurrency.test.ts#L1).
     * Changes log explicitly acknowledges missing adapter fan-out coverage: [.copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md](.copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md#L57).

### Minor

1. Inter-server event contract comment references Redis adapter while implementation uses Postgres adapter.
   * Why this matters: Documentation drift can mislead future maintainers during transport changes.
   * Evidence: [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L298).

## Coverage Assessment

* Step 4.1 coverage: **Partial**
  * Runtime wiring and operational documentation are complete.
  * Adapter behavior under true multi-instance conditions is not validated.
* Step 4.2 coverage: **Pass**
  * Presence transitions and room lifecycle broadcasts are implemented and test-covered at helper level.
* Step 4.3 coverage: **Partial**
  * Validation suites exist and run scope is documented.
  * Multi-instance adapter behavior is not directly exercised.

Overall Phase 4 coverage: **~75% complete (Partial)**.

## Explicit Missing or Deviating Work for Phase 4 Checklist

* Missing: adapter fan-out integration test proving cross-instance room broadcast propagation through Postgres adapter.
* Missing: evidence of LISTEN/NOTIFY path verification in test harness with real Postgres runtime.
* Deviating: test scope currently validates presence and sequencing logic but not the Phase 4 multi-instance transport behavior itself.

## Context Gaps and Assumptions

### Context gaps

* No attached CI run artifacts were provided for the specific Phase 4 command executions.
* No dedicated multi-process or multi-instance integration test file is present in the current server test suite.

### Assumptions

* Validation relies on repository state plus tracked markdown artifacts as of 2026-07-16.
* The Phase 4 target includes both implementation and confidence coverage for multi-instance transport behavior.

## Recommended Follow-on Validation

1. Add a real Postgres-backed, multi-server Socket.IO integration test that confirms cross-instance `tile_placed` and `client_left` propagation.
2. Verify sticky-session behavior plus adapter fallback behavior under reconnect in an environment that mirrors ACA ingress constraints.
3. Re-run Phase 4 validation after adding adapter-focused tests and update this report status to Pass if evidence is complete.
