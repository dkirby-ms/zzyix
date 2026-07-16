---
applyTo: 'apps/server/src/index.ts,apps/server/src/contracts.ts,apps/server/src/db/**/*.ts,apps/server/migrations/**/*.sql,apps/server/src/**/*.test.ts,apps/client/src/interaction/controller.ts'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Postgres Data Model and Realtime Transport Layer

## Overview

Implement durable Postgres-backed authoritative state and sequence-safe Socket.IO transport behavior for collaborative canvas operations covering GitHub issues #10 and #11.

## Objectives

### User Requirements

* Define Postgres tables for users, canvases, participants, tiles, operation_log, and snapshots with indexes and constraints. - Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md
* Define migration strategy including versioning and rollback direction. - Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md
* Implement realtime collaborative transport with presence events and operation acknowledgements. - Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md
* Provide reconnect behavior and sequencing guarantees for missed operations. - Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md
* Document retention and archival implications for operation history and snapshots. - Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md

### Derived Objectives

* Reuse a single pg.Pool across Drizzle and Socket.IO adapter wiring to reduce runtime connection complexity. - Derived from: Research recommendation on shared pool usage
* Add integration coverage that exercises reconnect replay and concurrent operation sequencing against real Postgres. - Derived from: testcontainers recommendation and LISTEN/NOTIFY limitations in pg-mem
* Sequence implementation so persistence baseline lands before transport hardening to avoid transient contract/state mismatch. - Derived from: Research implementation order recommendation

## Context Summary

### Project Files

* apps/server/src/index.ts - Current Socket.IO runtime and in-memory session lifecycle
* apps/server/src/contracts.ts - Typed transport contracts and ack payloads
* apps/server/package.json - Existing dependency and script surface
* docs/decisions/2026-07-15-deployment-architecture-v01.md - ACA architecture constraints and sticky-session context

### References

* .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md - Primary research for issues #10 and #11
* .copilot-tracking/research/subagents/2026-07-16/postgres-schema-tooling-research.md - Tooling and adapter trade-offs
* .copilot-tracking/research/subagents/2026-07-16/socketio-realtime-patterns-research.md - Realtime protocol gap findings
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Prompt requirements for planning flow

### Standards References

* Task Planner mode instructions - Required planning artifacts and validation workflow
* docs/decisions/2026-07-15-deployment-architecture-v01.md - Deployment and runtime architecture constraints

## Implementation Checklist

### [x] Implementation Phase 1: Establish Postgres Foundation and Migration Workflow

<!-- parallelizable: false -->

* [x] Step 1.1: Add dependencies for Postgres, migration tooling, retention scheduling, and integration testing
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 11-30)
* [x] Step 1.2: Define Drizzle schema for required tables, constraints, and indexes
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 31-51)
* [x] Step 1.3: Generate migration artifacts and wire migration scripts
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 52-72)
* [x] Step 1.4: Validate phase changes
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 80-84)

### [x] Implementation Phase 2: Replace In-Memory Session Store with Postgres Persistence

<!-- parallelizable: false -->

* [x] Step 2.1: Implement shared Postgres client and repository layer
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 85-104)
* [x] Step 2.2: Integrate persistence-backed state hydration and operation writes in socket handlers
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 105-125)
* [x] Step 2.3: Add explicit transactional op_seq allocator strategy for concurrent writes
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 113-134)
* [x] Step 2.4: Add snapshot trigger logic and retention cleanup job wiring
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 135-156)
* [x] Step 2.5: Validate phase changes
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 158-162)

### [x] Implementation Phase 3: Complete Realtime Sequencing, Acknowledgment, and Reconnect Guarantees

<!-- parallelizable: false -->

* [x] Step 3.1: Add opSeq and snapshot sequence fields to transport contracts
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 159-178)
* [x] Step 3.2: Implement reconnect replay flow from snapshot plus operation tail
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 179-200)
* [x] Step 3.3: Validate phase changes
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 214-218)

### [x] Implementation Phase 4: Multi-Instance Transport and Presence Hardening

<!-- parallelizable: false -->

* [x] Step 4.1: Wire Socket.IO Postgres adapter from shared pool and document affinity assumptions
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 223-243)
* [x] Step 4.2: Persist participant presence transitions on connect and disconnect
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 245-266)
* [x] Step 4.3: Validate phase changes
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 269-273)

### [x] Implementation Phase 5: Validation

<!-- parallelizable: false -->

* [x] Step 5.1: Run full project validation
  * Execute all lint commands, workspace builds, and tests for impacted packages
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 279-285)
* [x] Step 5.2: Fix minor validation issues
  * Apply direct corrections for straightforward findings
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 286-288)
* [x] Step 5.3: Report blocking issues
  * Document blockers requiring additional research/planning
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Lines 290-292)

### [x] Implementation Phase 6: Post-Review Remediation

<!-- parallelizable: false -->

* [x] Step 6.1: Make initial session bootstrap idempotent under concurrent first joins
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Post-Review Remediation section)
* [x] Step 6.2: Fix reconnect replay consistency by reading snapshot once and deriving tail from that boundary
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Post-Review Remediation section)
* [x] Step 6.3: Add runtime pointer payload finite-number validation before rebroadcast
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Post-Review Remediation section)
* [x] Step 6.4: Remove in-memory cleanup gating from disconnect lifecycle for persisted presence
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Post-Review Remediation section)
* [x] Step 6.5: Correct inter-server transport comment terminology to Postgres adapter
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Post-Review Remediation section)
* [x] Step 6.6: Validate remediation changes
  * Details: .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Post-Review Remediation section)

## Planning Log

See .copilot-tracking/plans/logs/2026-07-16/postgres-and-realtime-transport-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node.js and npm workspaces
* Docker runtime availability for testcontainers integration tests
* Postgres instance configuration for local and CI execution

## Success Criteria

* Required Postgres schema entities and indexes are implemented through versioned migrations. - Traces to: Issue #10 requirements and research schema model
* Server runtime persists authoritative state and operation history with monotonic op sequencing. - Traces to: Research reconnect and sequencing guarantees
* Realtime payloads and reconnect flow include sequence metadata for deterministic client reconciliation. - Traces to: Research identified opSeq wiring gap and reconnect flow
* Multi-instance transport synchronization is wired through Postgres adapter with documented operational constraints. - Traces to: ACA scaling and adapter analysis
* Validation coverage includes lint/build/tests and integration scenarios for reconnect plus concurrent operations. - Traces to: Research test strategy recommendations
