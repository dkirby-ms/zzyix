---
title: Phase 3 Validation - Postgres and Realtime Transport
description: Validation of Implementation Phase 3 checklist coverage against plan, changes log, research requirements, and verified code evidence.
author: GitHub Copilot
ms.date: 2026-07-16
ms.topic: how-to
---

## Validation Scope

* Plan: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md
* Changes log: .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md
* Research: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md
* Phase validated: 3
* Validation target file: .copilot-tracking/reviews/rpi/2026-07-16/postgres-and-realtime-transport-plan-003-validation.md

## Overall Status

* Status: Failed
* Coverage assessment: 2 of 3 checklist steps have substantial implementation evidence, but Phase 3 contains one critical reconnect replay deviation and one major validation-evidence gap.

## Phase 3 Checklist Validation

### Step 3.1 Add opSeq and snapshot sequence fields to realtime contracts

* Plan requirement: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md:82-83
* Detailed requirement and success criteria: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md:169-182
* Research requirement alignment:
  * .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md:257-269
  * .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md:364-366
* Changes log claim:
  * .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:32
  * .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:36-37
* Verified implementation evidence:
  * `PlaceTileAck` includes `opSeq`: apps/server/src/contracts.ts:221-223
  * `RemoveTileAck` includes `opSeq` field: apps/server/src/contracts.ts:230-232
  * `SessionSnapshotPayload` includes `lastOpSeq`: apps/server/src/contracts.ts:238-242
  * `TilePlacedPayload` and `TileRemovedPayload` include `opSeq`: apps/server/src/contracts.ts:244-254
  * Client sequence reconciliation and gap flagging helpers exist: apps/client/src/interaction/controller.ts:65-113
  * Client sequencing tests exist: apps/client/src/interaction/controller.test.ts:75-122

Result: Pass

Notes:
* The contracts and client reconciliation helpers satisfy the declared Step 3.1 objectives.

### Step 3.2 Implement reconnect replay flow from snapshots plus operation_log tail

* Plan requirement: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md:84-85
* Detailed requirement and success criteria: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md:191-205
* Research requirement alignment:
  * .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md:283-289
  * .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md:291-293
* Changes log claim:
  * .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:31
  * .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:33
  * .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:35
* Verified implementation evidence:
  * Connection emits replay-backed snapshot during connect: apps/server/src/index.ts:453-467
  * `initializeParticipantPresence` loads replay record and returns `lastOpSeq`: apps/server/src/index.ts:214-235
  * Snapshot load query (latest by descending `op_seq`): apps/server/src/db/repository.ts:361-368
  * Tail query applies `op_seq > snapshot_op_seq` and preserves order: apps/server/src/db/repository.ts:380-386
  * Replay merge uses base snapshot tiles + ordered operation reduction: apps/server/src/db/repository.ts:404-415
  * Integration test file includes reconnect snapshot checks and replay-state wiring via repository mock: apps/server/src/index.integration.test.ts:73-77, apps/server/src/index.integration.test.ts:79-104

Result: Partial

Explicit deviation from Step 3.2 success criteria:
* `loadSessionReplayRecord` computes the snapshot baseline and replay tail from two independent `getLatestSnapshot` calls executed concurrently: apps/server/src/db/repository.ts:398-402.
* Because `snapshot` and `operations` can be derived from different snapshot versions, reconnect hydration can miss operations between those two snapshot reads, violating the requirement that replay applies exactly the operation tail beyond the emitted snapshot baseline: apps/server/src/db/repository.ts:404-415.

### Step 3.3 Validate phase changes

* Plan requirement: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md:86-87
* Required commands: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md:216-218
  * `npm --prefix apps/server run test -- index.integration`
  * `npm --prefix apps/server run test -- index.concurrency`
* Available evidence:
  * Concurrency test suite exists and asserts deterministic sequence ordering: apps/server/src/index.concurrency.test.ts:63-69, apps/server/src/index.concurrency.test.ts:125-128
  * Changes log only reports broad validation (`lint`, `build`, `test`) and does not capture command-level execution evidence for Step 3.3: .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:64-67

Result: Partial

Explicit missing work for Step 3.3:
* No phase-targeted execution transcript or CI reference proving both required Step 3.3 commands were run as specified.

## Severity-Graded Findings

### Critical

1. Reconnect replay baseline and tail can be computed from different snapshots, which can drop operations during hydration.
* Impact: Directly risks incorrect reconnect state and breaks sequencing guarantees required by Phase 3.
* Evidence:
  * Double snapshot read in one replay computation path: apps/server/src/db/repository.ts:398-402
  * Replay reduction depends on potentially mismatched baseline/tail pair: apps/server/src/db/repository.ts:404-415
  * Requirement for consistent snapshot-plus-tail replay: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md:193-205

### Major

1. Missing explicit evidence that required Step 3.3 validation commands were executed.
* Impact: Reduces phase-gate auditability and makes completion claims unverifiable at command granularity.
* Evidence:
  * Step mandates exact command set: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md:216-218
  * Changes log records only aggregate test status: .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:64-67

### Minor

1. Reconnect replay coverage in the integration test file is partly mock-backed and does not fully exercise repository snapshot-tail consistency.
* Impact: Increases risk that race conditions in replay assembly are undetected.
* Evidence:
  * Replay record test path uses mocked `loadSessionReplayRecord`: apps/server/src/index.integration.test.ts:79-97

## Unlogged and Context-Gap Review

* No additional Phase 3 functional source files were found beyond the changes-log scope for contracts, server runtime, repository replay logic, and client reconciliation helpers.
* One contextual limitation is explicitly documented by the changes log: integration coverage remains in-process and does not run against a real Postgres runtime for all replay/fan-out paths.
  * Evidence: .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:47-52

## Assumptions and Missing Context

* Assumption: The implementation intends `loadSessionReplayRecord` to provide a single coherent snapshot baseline plus ordered tail replay for reconnect clients.
* Missing context: No test transcript or CI artifact was provided to prove execution of the exact Step 3.3 command pair.
* Missing context: No explicit design note was found stating whether the dual-snapshot-read behavior in replay assembly is intentional.

## Recommended Follow-up Validation

1. Fix replay assembly so one snapshot read defines both the baseline and operation tail threshold in `loadSessionReplayRecord`, then revalidate reconnect ordering.
2. Add a focused repository test that simulates snapshot changes between reads and verifies no operation loss in reconnect hydration.
3. Capture and attach command-level evidence for Step 3.3 (`index.integration` and `index.concurrency`) in the changes log or CI links.

## Validation Verdict

* Final verdict for Phase 3: Failed
* Finding counts:
  * Critical: 1
  * Major: 1
  * Minor: 1
