---
applyTo: 'apps/server/src/index.ts,apps/server/src/contracts.ts,apps/server/src/domain/**/*.ts,apps/server/src/**/*.test.ts'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Authoritative Backend Domain Port

## Overview

Implement authoritative server-side domain validation and deterministic operation handling for tile placement and removal so the backend becomes the canonical source of truth for issue #9.

## Objectives

### User Requirements

* Port placement domain modules from apps/client/src/domain into apps/server/src/domain. - Source: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md
* Wire place_tile to validatePlacement() and reject invalid requests. - Source: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md
* Enforce tile ID validation for authoritative operations. - Source: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md
* Broadcast tile_placed only after successful validation and state mutation. - Source: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md
* Ensure concurrent operations converge through deterministic server ordering. - Source: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md
* Implement backend service as source of truth with deterministic conflict handling and client reconciliation. - Source: GitHub issue #9 attachment

### Derived Objectives

* Add parity tests in apps/server/src/domain to reduce risk of domain drift after server-local port. - Derived from: Research risk and mitigation for direct copy approach
* Add explicit per-session operation sequencing implementation and tests for deterministic first-write-wins. - Derived from: Contract intent in apps/server/src/contracts.ts and research concurrency matrix
* Define and enforce a closed reject-reason contract and deterministic reason mapping tests for invalid operations. - Derived from: Deterministic reject requirement in research success criteria
* Keep persistence and operation history as a follow-on item when architectural scope exceeds this work item implementation budget. - Derived from: Issue #9 scope breadth and selected incremental delivery path

## Context Summary

### Project Files

* apps/server/src/index.ts - Socket handlers currently contain placeholder authoritative logic and TODO broadcast behavior.
* apps/server/src/contracts.ts - Contract definitions already encode authoritative ownership and reject/remove semantics.
* apps/client/src/domain/placementSolver.ts - Current validatePlacement() behavior to port.
* apps/client/src/domain/tileGeometry.ts - Canonical shape transformation behavior to port.
* apps/client/src/domain/math2d.ts - Portable geometry primitives to port.
* docs/decisions/2026-07-15-deployment-architecture-v01.md - Single-process initial deployment and deferred multi-replica sync.

### References

* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md - Primary research findings and selected approach.
* #9 [Work Item] Build authoritative backend service attachment - Scope and acceptance criteria.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Planning prompt requirements used for this task.

### Standards References

* Task Planner mode instructions - Required planning structure, discrepancy tracking, and validation flow.
* .github/copilot-instructions.md (not found in repository) - No repository-specific override was discovered during planning.

## Implementation Checklist

### [x] Implementation Phase 1: Port Domain Engine and Establish Parity Tests

<!-- parallelizable: false -->

* [x] Step 1.1: Copy and adapt domain modules into server domain folder
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 12-35)
* [x] Step 1.2: Add server parity tests for placement validation behavior
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 36-55)
* [x] Step 1.3: Validate phase changes
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 56-63)
  * Run lint and targeted server tests for this phase scope

### [x] Implementation Phase 2: Enforce Authoritative Mutation Semantics

<!-- parallelizable: false -->

* [x] Step 2.1: Introduce authoritative per-session state and sequencing
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 69-90)
* [x] Step 2.2: Wire place_tile validation, closed reject reasons, and post-mutation broadcast ordering
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 92-117)
* [x] Step 2.3: Enforce tile ID validation and remove_tile idempotency
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 118-140)
* [x] Step 2.4: Validate phase changes
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 142-149)

### [x] Implementation Phase 3: Validate Reconciliation and Concurrency Convergence

<!-- parallelizable: false -->

* [x] Step 3.1: Ensure authoritative snapshot/reconnect behavior from server state
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 154-175)
* [x] Step 3.2: Add deterministic concurrency matrix tests
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 176-195)
* [x] Step 3.3: Validate phase changes
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 196-203)

### [x] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation
  * Execute all lint commands, server build, and complete server tests
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 208-215)
* [x] Step 4.2: Fix minor validation issues
  * Apply straightforward corrections discovered in lint/build/test output
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 216-219)
* [x] Step 4.3: Report blocking issues
  * Document out-of-scope blockers and recommend follow-on planning when needed
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 220-223)

### [x] Implementation Phase 5: Runtime Hardening Rework from Review

<!-- parallelizable: false -->

* [x] Step 5.1: Add runtime payload validation and ack callback safety
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 224-247)
* [x] Step 5.2: Harden CORS credentialed origin handling and add session cleanup strategy
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 248-267)
* [x] Step 5.3: Align contract documentation and extend tests for malformed payload/missing callback paths
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 268-288)
* [x] Step 5.4: Validate rework changes
  * Details: .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md (Lines 289-296)

## Planning Log

See .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node.js and npm toolchain for apps/server scripts
* Existing server contract schema and socket event scaffolding in apps/server/src
* Vitest test harness in apps/server

## Success Criteria

* Server enforces authoritative placement validation and state ownership with deterministic rejects and remove semantics. - Traces to: Issue #9 acceptance criteria and research scope
* Conflict handling rules are implemented and tested with deterministic ordering evidence. - Traces to: Research scenario 2 and contract deterministic policy
* Clients can reconcile consistently from authoritative acks and snapshots. - Traces to: Issue #9 acceptance criteria and research selected approach
* Runtime handler boundaries reject malformed operation payloads and tolerate missing/non-function ack callbacks without crashing handlers. - Traces to: 2026-07-16 implementation review critical/major findings
* Credentialed CORS configuration avoids wildcard fallback and session map lifecycle includes cleanup behavior for empty/stale sessions. - Traces to: 2026-07-16 implementation review major findings
