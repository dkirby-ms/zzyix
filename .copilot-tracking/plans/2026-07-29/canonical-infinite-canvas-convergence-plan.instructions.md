---
applyTo: '.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md'
---
<!-- markdownlint-disable-file -->

# Implementation Plan: Canonical Infinite Canvas Convergence

## Overview

Replace user-created canvas selection with automatic entry into one canonical protocol-V2
toroidal quilt, patch discovery and claiming, replica-correct runtime behavior, and eventual
retirement of session compatibility.

## Objectives

### User Requirements

* Move from user-created canvases to one infinite canvas where users claim patches - Source: initial planning request
* Treat the infinite canvas as the only important product experience - Source: 2026-07-29 user clarification
* Do not spend implementation scope on legacy content access, migration, archive, or import - Source: 2026-07-29 user clarification

### Derived Objectives

* Use a database-backed canonical pointer rather than a client-baked UUID - Derived from: environment-specific database identities and restore behavior
* Require protocol V2 and reject silent canvas-wide fallback - Derived from: canonical patch and chunk delivery boundaries
* Keep temporary application-routing rollback during canary without treating the lobby as a supported end state - Derived from: forward-only database migration and rollout safety
* Retire old session APIs and clients with deterministic unsupported responses - Derived from: the canonical experience is the sole supported product contract

## Context Summary

### Project Files

* `apps/client/src/App.tsx` - Owns lobby versus canvas mode, protected world state, subscriptions, and root entry
* `apps/client/src/network/session.ts` - Owns session REST calls, selected-session storage, and patch claim HTTP calls
* `apps/client/src/network/useSocketConnection.ts` - Owns compatibility handshake, protocol negotiation, and reconnect behavior
* `apps/server/src/contracts.ts` - Owns REST and Socket.IO contracts
* `apps/server/src/index.ts` - Owns HTTP routes, socket routing, and presence lifecycle
* `apps/server/src/db/schema.ts` - Owns quilt, patch, policy, claim, and future canonical-pointer schema
* `apps/server/src/db/repository.ts` - Owns delivery lookup, patch claims, authorization, and recovery reads
* `.github/workflows/cd.yml` - Owns production environment-variable propagation

### References

* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md` - Primary product and rollout decision
* `.copilot-tracking/research/subagents/2026-07-29/canonical-infinite-canvas-convergence-planning-research.md` - Verified owners, tests, deployment gaps, and phase actionability
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Current controlling ADR that must be amended

### Standards References

* `.github/copilot-instructions.md` - No repository-local file exists; follow package scripts and established source patterns
* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md` - Markdown structure conventions
* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md` - Technical writing conventions

## Implementation Checklist

### [x] Implementation Phase 0: Fix the Canonical Product Contract

<!-- parallelizable: false -->

* [x] Step 0.1: Amend the tenancy ADR for one supported canonical quilt and no legacy-content product work
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 18-45)
* [x] Step 0.2: Fix topology, target, root entry, deep-link, patch discovery, claim, quota, and presence decisions
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 46-67)

### [x] Implementation Phase 1: Build the Canonical Control Plane

<!-- parallelizable: false -->

* [x] Step 1.1: Add the singleton pointer migration, Drizzle schema, metadata, and migration rehearsal
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 72-107)
* [x] Step 1.2: Add validated operator selection and authenticated side-effect-free discovery
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 108-215)
* [x] Step 1.3: Run focused control-plane tests, lint, build, and migration rehearsal
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 216-225)

### [x] Implementation Phase 2: Make Canonical Entry the Product Entry

<!-- parallelizable: false -->

* [x] Step 2.1: Add independent runtime client and server gates plus CD propagation
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 230-260)
* [x] Step 2.2: Replace lobby startup with discovery, automatic entry, V2 enforcement, and protected-state clearing
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 261-289)
* [x] Step 2.3: Run focused client, rollout-gate, release-contract, lint, and build checks
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 290-299)

### [x] Implementation Phase 3: Harden Runtime and Complete Canonical UX

<!-- parallelizable: false -->

* [x] Step 3.1: Implement bounded reconnect, cursor resubscription, and replica-wide presence
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 304-330)
* [x] Step 3.2: Add eligible-patch discovery, durable navigation, claim UX, and canonical fixtures
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 331-361)
* [x] Step 3.3: Run runtime and canonical UX acceptance suites
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 362-370)

Steps 3.1 and 3.2 execute sequentially because both integrate through `App.tsx` and
`index.ts`; Phase 3 validation runs only after both shared owners are coherent.

### [x] Implementation Phase 4: Retire Session Compatibility

<!-- parallelizable: false -->

* [x] Step 4.1: Apply measured promotion gates, make canonical entry unconditional, and return HTTP 426 for old clients
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 375-477)
* [x] Step 4.2: Move the socket handshake to quilt identity and remove canvas-wide runtime paths
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 478-512)

### [x] Implementation Phase 5: Final Validation

<!-- parallelizable: false -->

* [x] Step 5.1: Run full lint, build, test, E2E, and migration rehearsal
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 517-527)
* [x] Step 5.2: Fix isolated validation failures and rerun narrow checks
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 528-532)
* [x] Step 5.3: Report issues requiring new product or architecture planning
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Lines 533-538)

### [x] Implementation Phase 6: Remediate Implementation Review Findings

<!-- parallelizable: false -->

* [x] Step 6.1: Enforce trustworthy retirement evidence and final-state deployment
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 6, Step 6.1)
* [x] Step 6.2: Bind telemetry identity and make every terminal outcome observable
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 6, Step 6.2)
* [x] Step 6.3: Enforce canonical provenance, presence lease loss, and runtime retirement
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 6, Step 6.3)
* [x] Step 6.4: Add composed boundary coverage and rerun release validation
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 6, Step 6.4)

### [x] Implementation Phase 7: Close Resumed Review Findings

<!-- parallelizable: false -->

* [x] Step 7.1: Install retirement evidence on every deployment path
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 7, Step 7.1)
* [x] Step 7.2: Issue server-owned entry and reconnect attempt lineage
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 7, Step 7.2)
* [x] Step 7.3: Remove residual contracts and compose live product boundaries
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 7, Step 7.3)
* [x] Step 7.4: Repair placement acceptance and rerun release validation
  * Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md` (Implementation Phase 7, Step 7.4)

## Planning Log

See `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md`
for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Product acceptance of one finite toroidal canonical world
* Production topology, target, navigation, claim, quota, and presence decisions
* Disposable loopback PostgreSQL for migration and integration tests
* Existing protocol-V2, patch authorization, recovery, and telemetry mechanisms
* Runtime client configuration and Azure Container Apps deployment propagation
* Phase 6 implementation review findings IV-001 through IV-012
* Phase 7 resumed review findings IV-003, IV-004, IV-007, and IV-010 through IV-014

## Success Criteria

* Every supported user enters the same validated protocol-V2 quilt without selecting or creating a canvas - Traces to: user requirement for one infinite canvas
* Unowned principals discover and claim eligible patches by stable patch ID - Traces to: user requirement to preserve patch claiming
* Canonical entry fails closed when the pointer, topology, policies, compatibility alias, or protocol is invalid - Traces to: canonical control-plane research
* Reconnect, visible-room resubscription, and presence remain correct across replicas - Traces to: runtime-gate research
* No supported product workflow lists, creates, joins, archives, imports, or restores legacy canvases - Traces to: 2026-07-29 user clarification
* Session APIs and compatibility identity are retired only after canonical acceptance gates pass - Traces to: forward-only rollout requirement
