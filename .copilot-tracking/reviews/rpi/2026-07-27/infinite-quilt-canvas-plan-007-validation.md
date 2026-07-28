---
title: Infinite Quilt Canvas Phase 007 Validation
description: Validation of Phase 7 release gates, rollback, and retirement against the implementation plan, changes log, and research
author: GitHub Copilot
ms.date: 2026-07-27
ms.topic: reference
---

## Validation Scope

* Plan: `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md`
* Planning log: `.copilot-tracking/plans/logs/2026-07-27/infinite-quilt-canvas-log.md`
* Changes log: `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md`
* Research: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* Phase: 7
* Step 7.3 disposition: Explicitly unchecked and blocked by validation instruction

## Status

**Partial**

Steps 7.1 and 7.2 have substantial implementation evidence, and the legacy
retirement surface fails closed while Step 7.3 remains blocked. Phase 7 does
not pass because the implemented telemetry and rehearsal do not fully satisfy
their stated coverage and parity requirements.

## Phase Requirements Coverage

| Plan item | Status | Verified implementation | Gap |
|-----------|--------|-------------------------|-----|
| 7.1 dual-read parity | Partial | Full tile comparison covers identity, appearance, transform, authorship, and creation time; mismatch reads fall back to legacy data | Operator parity uses only counts and linkage, and dual reads are not limited by canary cohort |
| 7.1 canary telemetry | Partial | Typed telemetry and hooks exist for parity, lock wait, mutation latency, snapshot bytes, resync, room churn, pool wait, and client runtime | Client-runtime listener is registered only after an oversized snapshot; attachment telemetry is test-control-only; no measured thresholds exist |
| 7.1 rollout and rollback | Partial | Cohort selection is deterministic and requires a resolved principal; parity mismatches use legacy reads | Cohort selection labels telemetry but does not gate dual-read execution, and no authenticated principal can currently enroll |
| 7.2 migration rehearsal | Partial | Script applies migration, backfills twice, runs parity, rolls additive data back, compares a legacy fingerprint, recovers, and checks retention reconstruction | Only one expanded canvas size is seeded, and the parity command does not compare full tile fields |
| 7.2 operational documentation | Complete | Root and server runbooks document commands, rollback limits, production controls, telemetry, and retirement gates | Documentation overstates full parity coverage of the operator command |
| 7.2 production safeguards | Complete | Non-loopback operations require approval, change ID, and exact database confirmation | No gap found in the inspected safeguard path |
| 7.3 legacy retirement | Blocked as instructed | Protocol v1, legacy reads, and legacy storage remain; readiness gates default false and all must be explicitly true | Retirement was not executed and is not credited as complete |

Overall Phase 7 coverage is **partial**. The release remains rollback-capable
and retirement-safe, but canary evidence cannot yet support an exit decision.

## Findings

### Critical

No Critical findings. Required legacy retirement remains blocked and has not
removed a rollback path.

### Major

1. Client-budget telemetry is unreachable during normal canary operation.
   The server registers `quilt_client_runtime_metrics` only inside the branch
   where an individual snapshot already exceeds `maxPayloadBytes`. A normal
   accepted snapshot never installs the listener, so the client emissions for
   retained patches, retained tiles, scene objects, draw calls, and frame time
   are ignored. This prevents Step 7.1 from producing the evidence required by
   the client-budget and measured-window retirement gates. Evidence:
   `apps/server/src/index.ts:2327-2364` and `apps/client/src/App.tsx:918-933`.

2. The operator parity command does not verify the full migration contract.
   `db:parity:quilts` calls `verifyQuiltBackfillParity`, which compares canvas,
   quilt, linked-tile, spatial-reference, and inferred-owner counts. It does
   not compare tile IDs record-by-record or verify shape, color, material,
   position, rotation, mirroring, timestamps, or authorship. The full
   comparator exists but is not used by the CLI or rehearsal. A migration can
   therefore pass the documented parity operation despite field drift.
   Evidence: `apps/server/src/db/quiltParityCli.ts:1-13`,
   `apps/server/src/db/quiltBackfill.ts:204-227`, and
   `apps/server/src/db/quiltParity.ts:20-72`.

3. The rehearsal does not cover every current canvas size. It seeds one
   20.8-by-13.6 expanded canvas, while Step 7.1 requires every migrated canvas
   size to pass read and layout parity and Step 7.2 asks for representative
   production-like data. Classic and vast presets are absent from the script.
   Evidence: `scripts/verify-quilt-migration.sh:100-129` and
   `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:467-488`.

4. Canary cohort selection does not gate dual-read execution. The configured
   quilt/principal cohort determines the telemetry `canary` dimension, but
   compatibility reads compare both paths regardless of cohort. This weakens
   the stated ability to gate rollout by quilt and principal and adds migration
   query cost outside the selected canary. Evidence:
   `apps/server/src/index.ts:551-558`,
   `apps/server/src/db/repository.ts:604-639`, and
   `apps/server/src/db/repository.ts:1508-1553`.

### Minor

1. Attachment-use telemetry is demonstrated by the test-control publish
   endpoint rather than instrumenting the production PostgreSQL adapter or its
   attachment table. The promised operational signal is therefore not shown
   for production traffic. Evidence: `apps/server/src/index.ts:1508-1514`.

2. The server runbook states that migration dual reads compare full persisted
   fields, but its documented `parity` command invokes the count-only CLI.
   Operators could reasonably interpret the command as stronger than it is.
   Evidence: `apps/server/README.md:65-71`,
   `apps/server/README.md:103-109`, and
   `apps/server/src/db/quiltParityCli.ts:1-13`.

## Evidence Review

### Validated Controls

* Missing, malformed, or non-`true` retirement variables parse as false.
* Retirement requires explicit intent plus parity, recovery, multi-replica,
  authenticated principal, client budget, measured window, and rollback policy
  gates. The decision remains false when any gate is unmet.
* Even an all-true readiness decision only changes startup reporting. It cannot
  remove protocol v1, legacy reads, or legacy storage. This is appropriate for
  the explicitly blocked Step 7.3 and prevents configuration-only retirement.
* Dual-read mismatch handling returns legacy data and records a bounded mismatch
  report, preserving the rollback source of truth.
* The rehearsal script uses strict Bash mode, disposable database cleanup, and
  explicit non-loopback controls. A syntax check passed, and a non-loopback
  `parity` request without production controls failed before database access.
* Root and server documentation accurately state that protocol v1 and legacy
  storage remain available and that actual retirement requires later review.
* Worktree inspection found no unlisted Phase 7 implementation edits. Only
  review artifacts were untracked during validation.

### Executable Validation

* `bash -n scripts/verify-quilt-migration.sh`: passed
* Non-loopback safety probe without approval variables: passed by refusing the
  target with `Non-loopback database refused without production approval`
* Server TypeScript build: passed during the attempted focused test invocation
* Focused Vitest execution: not independently completed because the persistent
  terminal replayed an earlier command; source tests were inspected directly
* Database rehearsal: not rerun during this session

## Clarifying Questions

* Should `FEATURE_QUILT_DUAL_READ_CANARY_*` restrict execution of dual reads, or
  is it intentionally a telemetry-label-only cohort despite the plan wording?
* What approved canvas-size matrix and production-like dataset define completion
  for the Phase 7 rehearsal?
* Which metrics backend owns threshold evaluation, observation windows, alerts,
  and durable evidence for retirement gate approval?

## Recommended Next Validations

* Move client-runtime listener registration to protocol-v2 connection setup and
  add an integration test proving normal accepted snapshots produce telemetry.
* Route the operator parity CLI through full record comparison and introduce a
  negative rehearsal fixture with transform or authorship drift.
* Rehearse classic, expanded, and vast bounded canvases, including empty,
  boundary, and multi-tile datasets, then retain the command output as evidence.
* Decide and test whether canary cohorts gate dual reads or only label metrics.
* Instrument real adapter attachment usage and verify the metric through the
  two-replica PostgreSQL-backed harness.
* Run the complete disposable migration rehearsal after the parity and dataset
  changes.
* Keep Step 7.3 unchecked until authenticated principal integration, client
  budgets, measured-window approval, and rollback-policy approval are evidenced.