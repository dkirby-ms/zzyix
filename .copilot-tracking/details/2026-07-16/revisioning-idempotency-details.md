<!-- markdownlint-disable-file -->
# Implementation Details: Revisioning and Idempotency

## Context Reference

Sources: .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md, .copilot-tracking/research/subagents/2026-07-16/codebase-analysis.md.

## Implementation Phase 1: Schema and Migration Foundation for Idempotency Metadata

<!-- parallelizable: false -->

### Step 1.1: Add schema support for persisted idempotency keys and revision metadata

Extend DB schema to persist idempotency keys and support explicit revision conflict checks.

Files:
* apps/server/src/db/schema.ts - Add idempotency_keys table and optional canvases.version revision column for conflict checks

Discrepancy references:
* Addresses DR-08 and DR-09 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Schema includes persisted idempotency key records with uniqueness and TTL index support.
* Revision metadata field exists for stale/out-of-order conflict evaluation.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 118-141) - idempotency key table model
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 165-169) - version column guidance

Dependencies:
* Existing Drizzle schema and migration conventions

### Step 1.2: Generate and commit migration artifacts for idempotency schema additions

Generate migration SQL and meta snapshots for idempotency key and revision schema changes.

Files:
* apps/server/migrations/* - New migration SQL file for idempotency/revision schema
* apps/server/migrations/meta/* - Updated Drizzle metadata snapshots

Discrepancy references:
* Addresses DR-09 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Migration files are present and aligned with updated Drizzle schema definitions.
* Migration plan covers apply path for development and CI validation.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 14-16) - migration scope expectation
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 183-186) - optional migration notes now promoted in-scope

Dependencies:
* Step 1.1 completion

### Step 1.3: Validate phase changes

Run lint/build validation for schema and migration updates.

Validation commands:
* npm --prefix apps/server run lint - server lint validation
* npm --prefix apps/server run build - compile-time validation

## Implementation Phase 2: Contract and Repository Idempotency Foundation

<!-- parallelizable: false -->

### Step 2.1: Update transport contract reject and ack shapes for idempotency outcomes

Extend server contracts to represent duplicate-operation handling and clarify revision-oriented replay semantics.

Files:
* apps/server/src/contracts.ts - Add duplicate operation and stale/out-of-order reject shapes plus explicit idempotent ack semantics

Discrepancy references:
* Addresses DR-01 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Contract types include explicit idempotency/conflict outcomes used by place_tile and remove_tile handlers.
* Updated types preserve backward-compatible successful ack shape with opSeq for replay-safe retries.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 27-37) - Existing contract shape and missing error types
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 118-141) - Recommended conflict error additions

Dependencies:
* Existing server contract typing and event guards

### Step 2.2: Implement place_tile duplicate detection in repository transaction path

Inside advisory-locked persistTilePlacement flow, detect existing tile UUID placements and return cached opSeq without adding new tile or operation_log rows.

Files:
* apps/server/src/db/repository.ts - Add duplicate lookup, persisted idempotency key write/check, and idempotent early-return path in persistTilePlacement

Discrepancy references:
* Addresses DR-02 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Replayed place_tile with same tileId returns original opSeq and does not create duplicate writes.
* New place_tile still allocates next opSeq via advisory-locked transaction and writes exactly one operation_log row.
* Idempotency key persistence can return prior outcome for retry paths after process restart.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 70-83) - Current write path behavior
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 99-107) - Selected tile-idempotency implementation guidance

Dependencies:
* Implementation Phase 1 completion

### Step 2.3: Implement remove_tile idempotent replay behavior

When tile deletion affects zero rows, detect whether prior tile_removed op exists and reuse its opSeq as idempotent replay outcome; treat never-seen tiles as non-removal.

Files:
* apps/server/src/db/repository.ts - Extend persistTileRemoval with idempotency key checks, op_log fallback lookup, and deterministic return shape

Discrepancy references:
* Addresses DR-03 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Duplicate remove_tile requests for already removed tiles are safely absorbed with deterministic response semantics.
* Removes for non-existent tiles do not create synthetic operation rows or consume new opSeq.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 47-54) - remove_tile gap summary
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 108-117) - selected remove replay handling

Dependencies:
* Step 2.2 completion

### Step 2.4: Validate phase changes

Run lint and build commands for files modified in this phase.

Validation commands:
* npm --prefix apps/server run lint - server source lint validation
* npm --prefix apps/server run build - server type/build validation

## Implementation Phase 3: Socket Handler Semantics and Replay Documentation

<!-- parallelizable: false -->

### Step 3.1: Align socket handlers with idempotent repository return behavior

Update place_tile and remove_tile handler branches to preserve deterministic acknowledgements and avoid duplicate broadcast emissions on replayed operations.

Files:
* apps/server/src/index.ts - place_tile and remove_tile mutation handler updates

Discrepancy references:
* Addresses DR-04 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* place_tile replay path returns stable opSeq and does not emit duplicate tile_placed event.
* remove_tile replay path follows documented non-duplicate semantics while preserving client-visible determinism.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 70-96) - current socket mutation sequence
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 170-178) - actionable handler-level steps

Dependencies:
* Implementation Phase 2 completion

### Step 3.2: Enforce stale and out-of-order conflict checks with explicit revision inputs

Implement concrete stale/out-of-order checks by comparing client-provided revision metadata with current canvas revision before mutation writes.

Files:
* apps/server/src/contracts.ts - Add revision input field(s) and stale/out-of-order reject reason types
* apps/server/src/index.ts - Validate revision preconditions before invoking repository mutation paths
* apps/server/src/db/repository.ts - Surface current revision in mutation helpers for deterministic conflict checks

Discrepancy references:
* Addresses DR-10 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Mutation handlers reject stale/out-of-order operations with typed conflict outcomes.
* Accepted mutations continue to use advisory-lock sequencing and revision increments.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Task Implementation Requests section) - stale/out-of-order requirement
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 142-161) - stale/state conflict options

Dependencies:
* Step 3.1 completion

### Step 3.3: Document replay and recovery behavior in contracts and inline server notes

Document how retries are absorbed, how stale/out-of-order states are handled for current Socket.IO scope, and which behaviors are deferred to future REST idempotency keys.

Files:
* apps/server/src/contracts.ts - Replay/recovery notes in type comments
* apps/server/src/index.ts - Inline behavior notes near mutation handling paths
* apps/server/src/jobs/retention.ts - Add idempotency key TTL cleanup behavior notes and task hooks

Discrepancy references:
* Addresses DR-05 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Replay and recovery expectations are clearly documented at contract and handler boundaries.
* Persisted idempotency-key cleanup expectations are documented for retention integration.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 22-26) - scope and assumptions
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 124-141) - idempotency key retention direction

Dependencies:
* Step 3.2 completion

### Step 3.4: Validate phase changes

Run lint/build validation for contract and handler updates.

Validation commands:
* npm --prefix apps/server run lint - server lint validation
* npm --prefix apps/server run build - compile-time validation

## Implementation Phase 4: Tests for Retry Safety and Deterministic Ordering

<!-- parallelizable: true -->

### Step 4.1: Add unit tests for duplicate place and remove idempotency

Cover repository/handler logic where duplicate tileId placement and repeated remove requests return deterministic outcomes without double writes.

Files:
* apps/server/src/index.test.ts - unit tests for duplicate place_tile/remove_tile behavior and opSeq reuse

Discrepancy references:
* Addresses DR-06 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Unit tests assert duplicate place returns original opSeq and no second broadcast side effect.
* Unit tests assert repeated remove behavior is idempotent and does not regress ordering guarantees.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 61-67) - unit/integration expectation
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 175-178) - test additions requested

Dependencies:
* Implementation Phase 3 completion

### Step 4.2: Add integration tests for duplicate socket retries and opSeq consistency

Extend integration tests with mocked repository behavior to verify duplicate event retries resolve to stable opSeq and no duplicate mutation persistence contract violations.

Files:
* apps/server/src/index.integration.test.ts - integration tests for duplicate place_tile ack and replay behavior

Discrepancy references:
* Addresses DR-07 from .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md.

Success criteria:
* Integration tests confirm duplicate place_tile ack matches original opSeq.
* Integration tests confirm retry scenarios preserve deterministic event ordering assumptions.
* Integration tests confirm stale/out-of-order revision conflicts return typed rejects.

Context references:
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 57-60) - integration test pattern context
* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 178-180) - integration test implementation next steps

Dependencies:
* Step 4.1 completion

### Step 4.3: Validate phase changes

Validation commands:
* npm --prefix apps/server run test -- index - unit test verification
* npm --prefix apps/server run test -- index.integration - integration test verification

## Implementation Phase 5: Validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all relevant validation commands for the workspace and impacted server package:
* npm run lint
* npm run build
* npm run test

### Step 4.2: Fix minor validation issues

Iterate on straightforward lint errors, build warnings, and test failures tied to this implementation scope.

### Step 4.3: Report blocking issues

When validation failures require broader re-architecture or additional research, document blockers and provide concrete follow-on planning guidance.

## Dependencies

* Existing server persistence layer and advisory lock sequencing logic
* Existing Vitest infrastructure for unit and integration coverage
* Drizzle migration generation/apply workflow

## Success Criteria

* Idempotent handling for duplicate place_tile and remove_tile retries is implemented and validated.
* Contract surface clearly communicates retry/conflict outcomes and replay behavior.
* Persisted idempotency key records and migration artifacts are in place for retry durability.
* Deterministic op_seq semantics remain intact under all updated mutation paths.