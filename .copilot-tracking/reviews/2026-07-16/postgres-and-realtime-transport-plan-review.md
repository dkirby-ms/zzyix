<!-- markdownlint-disable-file -->
# Review Log: Postgres Data Model and Realtime Transport Layer

## Review Metadata

- Date: 2026-07-16
- Related Plan: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md
- Changes Log: .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md
- Research Document: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md
- Reviewer Mode: Task Reviewer

## Validation Progress

- Phase 1 Artifact Discovery: Complete
- Phase 2 RPI Validation: Complete
- Phase 3 Quality Validation: Complete
- Phase 4 Review Completion: Complete

## Findings Summary

- Critical: 2
- Major: 10
- Minor: 7

Severity roll-up notes:

- RPI validation findings total: Critical 1, Major 7, Minor 5
- Implementation quality findings total: Critical 1, Major 3, Minor 2
- Combined totals above are non-deduplicated across sources

## RPI Validation Results by Plan Phase

### Phase 1: Establish Postgres Foundation and Migration Workflow

- Status: Partial
- Validation file: .copilot-tracking/reviews/rpi/2026-07-16/postgres-and-realtime-transport-plan-001-validation.md
- Findings:
	- Major: Rollback workflow is not executable (`db:rollback` is echo-only) in apps/server/package.json:13.
	- Minor: Phase-scoped validation evidence (server-specific lint/build transcript) is not recorded in changes artifacts.
- Evidence highlights:
	- Dependencies and scripts in apps/server/package.json:11-37.
	- Schema entities and indexes in apps/server/src/db/schema.ts:23-130.
	- Baseline migration in apps/server/migrations/0000_overjoyed_lila_cheney.sql:1-69.

### Phase 2: Replace In-Memory Session Store with Postgres Persistence

- Status: Partial
- Validation file: .copilot-tracking/reviews/rpi/2026-07-16/postgres-and-realtime-transport-plan-002-validation.md
- Findings:
	- Major: In-memory lifecycle remains in runtime (`sessions` map and cleanup flow), so replacement is incomplete.
	- Major: Real Postgres-backed integration validation remains deferred.
	- Minor: Snapshot cadence rationale (`SNAPSHOT_INTERVAL_OPS = 25`) is not explicitly documented.
- Evidence highlights:
	- Remaining in-memory paths in apps/server/src/index.ts:49, apps/server/src/index.ts:170, apps/server/src/index.ts:201.
	- Persistence-backed handlers in apps/server/src/index.ts:460-544.
	- Transactional op sequence allocation in apps/server/src/db/repository.ts:245-310.

### Phase 3: Complete Realtime Sequencing, Acknowledgment, and Reconnect Guarantees

- Status: Failed
- Validation file: .copilot-tracking/reviews/rpi/2026-07-16/postgres-and-realtime-transport-plan-003-validation.md
- Findings:
	- Critical: Reconnect replay can assemble baseline and tail from different snapshot reads, risking dropped operations.
	- Major: Required phase-specific command evidence for `index.integration` and `index.concurrency` tests is not explicitly captured.
	- Minor: Replay coverage is partly mock-backed and does not fully stress snapshot-tail consistency races.
- Evidence highlights:
	- Dual snapshot read pattern in apps/server/src/db/repository.ts:398-402.
	- Replay reduction path in apps/server/src/db/repository.ts:404-415.
	- Contract sequence fields in apps/server/src/contracts.ts:221-254.

### Phase 4: Multi-Instance Transport and Presence Hardening

- Status: Partial
- Validation file: .copilot-tracking/reviews/rpi/2026-07-16/postgres-and-realtime-transport-plan-004-validation.md
- Findings:
	- Major: No adapter fan-out verification under real multi-instance Postgres transport.
	- Minor: Inter-server contract comment still references Redis while implementation uses Postgres adapter.
- Evidence highlights:
	- Adapter setup in apps/server/src/index.ts:419-428.
	- Presence persistence in apps/server/src/db/repository.ts:197-224.
	- Assumptions in docs/decisions/2026-07-15-deployment-architecture-v01.md:92-95.

### Phase 5: Validation

- Status: Partial
- Validation file: .copilot-tracking/reviews/rpi/2026-07-16/postgres-and-realtime-transport-plan-005-validation.md
- Findings:
	- Major: No explicit Step 5.2 remediation trail mapping minor findings to direct fixes.
	- Major: Real Postgres adapter validation remains an unresolved confidence gap.
	- Minor: Lint/build/test pass claims were not accompanied by run artifacts in phase logs.
- Evidence highlights:
	- Aggregate pass claims in .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:64-67.
	- Outstanding limitations in .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:69-71.

## Implementation Quality Findings

Implementation quality was executed via `Implementation Validator` (`full-quality` scope). No persisted implementation validator markdown file was created by the subagent in this session, so findings are recorded here from returned evidence.

### Critical

- Non-atomic first-session bootstrap can fail under concurrent first joins for the same session ID.
	- Evidence: apps/server/src/db/repository.ts:171-174, apps/server/src/index.ts:472-473.

### Major

- Replay loader consistency issue duplicates the RPI critical replay risk (two independent snapshot reads).
	- Evidence: apps/server/src/db/repository.ts:398-401.
- Missing runtime validation for pointer payload finite numeric values before rebroadcast.
	- Evidence: apps/server/src/index.ts:552-557.
- No real Postgres transport integration coverage for LISTEN/NOTIFY adapter behavior.
	- Evidence: .copilot-tracking/changes/2026-07-16/postgres-and-realtime-transport-changes.md:47-52.

### Minor

- Local fallback DSN in Drizzle config includes embedded development credentials.
	- Evidence: apps/server/drizzle.config.ts:3.
- Repository-local `.github/instructions` directory absent; applyTo pattern validation could not be performed locally.
	- Evidence: `.github/instructions` not present (verified during review).

## Validation Commands

### Executed During Review

1. `npm run lint`
	- Status: Pass
	- Output summary: root and server lint commands completed without reported errors.
2. `npm run build`
	- Status: Pass
	- Output summary: client Vite build and server TypeScript compile completed successfully; one client chunk-size warning observed (non-blocking).
3. `npm run test`
	- Status: Pass
	- Output summary:
	  - Client: 3 files, 8 tests passed.
	  - Server: 4 files, 22 tests passed.

### Diagnostics

1. `get_errors` on impacted files
	- Paths checked:
	  - apps/server/src/index.ts
	  - apps/server/src/db/repository.ts
	  - apps/server/src/contracts.ts
	  - apps/client/src/interaction/controller.ts
	- Status: Pass (no diagnostics reported)

## Missing Work and Deviations

1. Rollback migration path remains placeholder-only and is not executable.
2. In-memory session lifecycle is still present in runtime despite replacement objective.
3. Reconnect replay assembly has a consistency risk due to dual latest-snapshot reads.
4. Multi-instance Postgres adapter fan-out behavior is not validated in real Postgres integration.
5. Phase-specific validation evidence is incomplete in artifacts (aggregate pass claims without command-scoped proof for some phase gates).
6. Step 5.2 explicit remediation mapping is absent.

## Follow-Up Recommendations

### Deferred from Scope

1. Add testcontainers-based multi-instance Postgres adapter fan-out tests to verify cross-replica propagation and ordering.
2. Add reconnect replay guardrails for large operation tails and stale snapshot scenarios.
3. Provide operational rollback workflow (reverse migration artifacts and executable runbook/script).

### Discovered During Review

1. Make session bootstrap idempotent/atomic under concurrent first joins (upsert or retry-on-conflict strategy).
2. Refactor replay loader to read snapshot once and derive operation tail from that exact snapshot boundary.
3. Validate and sanitize pointer payload values before rebroadcast.
4. Correct inter-server transport contract comments to match Postgres adapter usage.

## Overall Status

- Status: Needs Rework
- Reviewer Notes:
	- Completion gate not met due to critical reconnect replay consistency risk and critical session-bootstrap concurrency risk.
	- RPI Phase 3 marked Failed; multiple major findings remain open across Phases 1, 2, 4, and 5.
	- Validation commands pass in current workspace state, but plan-acceptance evidence and adapter-reality coverage are still incomplete.
