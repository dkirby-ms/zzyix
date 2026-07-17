---
applyTo: 'apps/server/src/contracts.ts,apps/server/src/index.ts,apps/server/src/db/repository.ts,apps/server/src/**/*.test.ts,apps/server/src/jobs/retention.ts,apps/server/migrations/**/*.sql'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Revisioning and Idempotency

## Overview

Implement deterministic revision sequencing and idempotent mutation handling for Socket.IO tile operations so retries are safely absorbed and operation ordering remains stable.

## Objectives

### User Requirements

* Add operation revision metadata and sequence rules. - Source: .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md
* Implement idempotency keys and duplicate detection. - Source: .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md
* Define conflict behavior for stale or out-of-order operations. - Source: .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md
* Document replay and recovery behavior. - Source: .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md

### Derived Objectives

* Preserve existing advisory-lock per-canvas sequencing and avoid introducing alternate write paths that can bypass lock-protected op_seq assignment. - Derived from: Research finding that deterministic ordering is already structurally guaranteed
* Use tile UUID-based deduplication for Socket.IO while adding persisted idempotency key records so duplicate detection survives process restarts and can be reused by future REST writes. - Derived from: Research implementation requests plus selected Socket.IO-first path
* Add focused unit and integration tests that validate duplicate place/remove behavior and opSeq reuse without requiring client behavior changes beyond required tileId contract alignment. - Derived from: Existing Vitest testing conventions and success criteria

## Context Summary

### Project Files

* apps/server/src/contracts.ts - Event payload and ack contracts requiring idempotency/conflict shape updates
* apps/server/src/index.ts - Socket.IO mutation handlers for place_tile and remove_tile
* apps/server/src/db/repository.ts - Advisory-locked transactional persistence and op_seq allocator
* apps/server/src/db/schema.ts - Existing table model; confirms client-assigned tile UUIDs
* apps/server/src/jobs/retention.ts - Existing retention sweep extension point for idempotency-key TTL cleanup
* apps/server/src/index.test.ts - Unit test surface for server-side mutation behavior
* apps/server/src/index.integration.test.ts - Integration test surface with mocked repository patterns
* apps/server/migrations - Drizzle migrations to evolve schema for idempotency metadata

### References

* .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md - Primary research and selected implementation approach
* .copilot-tracking/research/subagents/2026-07-16/codebase-analysis.md - Existing schema and repository behavior inventory
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Prompt requirements for planning flow

### Standards References

* Task Planner mode instructions - Required planning artifacts and validation workflow
* .github/copilot-instructions.md - Repository implementation conventions

## Implementation Checklist

### [x] Implementation Phase 1: Schema and Migration Foundation for Idempotency Metadata

<!-- parallelizable: false -->

* [x] Step 1.1: Add schema support for persisted idempotency keys and optional canvas revision/version tracking
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 11-33)
* [x] Step 1.2: Generate and commit Drizzle migration artifacts for schema additions
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 34-55)
* [x] Step 1.3: Validate phase changes
  * Run lint and build commands for modified files
  * Skip if validation conflicts with parallel phases

### [x] Implementation Phase 2: Contract and Repository Idempotency Foundation

<!-- parallelizable: false -->

* [x] Step 2.1: Update transport contract reject/ack shapes for idempotency and revision outcomes
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 61-84)
* [x] Step 2.2: Add place_tile duplicate detection path in advisory-locked transaction and return existing opSeq without new writes
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 85-113)
* [x] Step 2.3: Add remove_tile idempotent replay path that reuses prior tile_removed opSeq when applicable
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 114-142)
* [x] Step 2.4: Validate phase changes
  * Run lint and build commands for modified files
  * Skip if validation conflicts with parallel phases

### [x] Implementation Phase 3: Socket Handler Semantics and Replay Documentation

<!-- parallelizable: false -->

* [x] Step 3.1: Align socket handlers to updated idempotent repository return shapes and deterministic ack/broadcast behavior
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 148-174)
* [x] Step 3.2: Enforce stale/out-of-order operation conflict checks using explicit revision inputs and typed reject outcomes
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 175-201)
* [x] Step 3.3: Add replay and recovery behavior notes in server contracts/comments to document duplicate and stale handling
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 202-223)
* [x] Step 3.4: Validate phase changes
  * Run lint and build commands for modified files
  * Skip if validation conflicts with parallel phases

### [x] Implementation Phase 4: Tests for Retry Safety and Deterministic Ordering

<!-- parallelizable: true -->

* [x] Step 4.1: Add unit tests for duplicate place_tile/remove_tile replay paths and opSeq reuse behavior
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 229-256)
* [x] Step 4.2: Add integration tests for duplicate socket events, stale revision rejects, and no-double-write semantics
  * Details: .copilot-tracking/details/2026-07-16/revisioning-idempotency-details.md (Lines 257-286)
* [x] Step 4.3: Validate phase changes
  * Run tests scoped to index and integration suites
  * Skip if validation conflicts with parallel phases

### [x] Implementation Phase 5: Validation

<!-- parallelizable: false -->

* [x] Step 5.1: Run full project validation
  * Execute all lint commands (npm run lint, package-scoped linters)
  * Execute build scripts for modified components
  * Run test suites covering modified code
* [x] Step 5.2: Fix minor validation issues
  * Iterate on lint errors and build warnings
  * Apply fixes directly when corrections are straightforward
* [x] Step 5.3: Report blocking issues
  * Document issues requiring additional research
  * Provide user with next steps and recommended planning
  * Avoid large-scale fixes within this phase

### [x] Implementation Phase 6: Review-Driven Rework Closure

<!-- parallelizable: false -->

* [x] Step 6.1: Enforce deterministic place identity at contract boundary
  * Made `PlaceTilePayload.tileId` required and aligned payload guards/tests accordingly.
* [x] Step 6.2: Enforce idempotency request-hash mismatch outcomes
  * Added typed `REQUEST_HASH_MISMATCH` reject outcomes for place/remove idempotency-key reuse conflicts.
* [x] Step 6.3: Add handler-level stale/out-of-order precondition checks
  * Applied explicit `expectedRevision` checks in socket handlers before repository mutation calls.
* [x] Step 6.4: Extend retention to prune expired idempotency keys
  * Added expired key cleanup in retention prune flow and returned cleanup counts.
* [x] Step 6.5: Validate rework phase
  * `npm --prefix apps/server run lint`
  * `npm --prefix apps/server run build`
  * `npm --prefix apps/server run test -- index`
  * `npm --prefix apps/server run test -- index.integration`
  * `npm --prefix apps/server run test -- retention`

## Planning Log

See .copilot-tracking/plans/logs/2026-07-16/revisioning-idempotency-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node.js npm workspace scripts for lint/build/test
* Existing Postgres and Drizzle runtime in apps/server
* Existing advisory lock and operation_log schema model
* Drizzle migration tooling and migration application workflow

## Success Criteria

* Duplicate place_tile operations for the same tile UUID are absorbed without creating a second tile row or additional op_log row. - Traces to: Research success criteria for duplicate placement handling
* Duplicate remove_tile operations for an already removed tile reuse existing removal semantics without breaking op ordering. - Traces to: Research success criteria for safe duplicate removal handling
* op_seq remains monotonic and deterministic per canvas with no regression to lock-protected sequencing behavior. - Traces to: Research findings on existing advisory-lock sequencing
* Contracts and handler logic enforce explicit stale/out-of-order conflict outcomes using revision metadata. - Traces to: Research stale/out-of-order requirement
* Migration artifacts are added for idempotency metadata and revision support with tested apply path. - Traces to: Research scope calling for a new migration
* Contracts and tests document and validate conflict/idempotency outcomes for retry and replay scenarios. - Traces to: Research contract gap and testing strategy