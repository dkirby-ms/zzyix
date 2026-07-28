---
applyTo: '.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Infinite Quilt Canvas

## Overview

Replace bounded canvases with a finite rectangular toroidal quilt whose first-class patches own authorization and consistency while patch-local chunks provide bounded query, cache, and real-time delivery.

## Objectives

### User Requirements

* Replace discrete bounded canvases with an extremely large finite canvas whose opposite edges wrap — Source: GitHub issue 53 and attached research
* Treat the world as adjacent patch-sized work areas that may have different owners — Source: attached product concept and `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* Preserve existing content through a staged migration — Source: attached research assumptions and migration guidance
* Cover topology, rendering, interaction, ownership, persistence, synchronization, recovery, migration, tests, and deployment — Source: attached research scope

### Derived Objectives

* Keep patches separate from chunks so ownership and transaction boundaries do not depend on cache partitioning — Derived from: patch ACL and chunk-delivery responsibilities differ
* Use one canonical tile identity plus camera-relative periodic display aliases — Derived from: seam rendering must not duplicate persistence, selection, undo, or events
* Move reads and placement validation inside sorted patch-scoped transactions — Derived from: current pre-lock validation race and need for distant-write concurrency
* Introduce authenticated protocol-v2 area-of-interest delivery before client eviction — Derived from: bounded client state requires scoped reconstructable recovery
* Preserve legacy bounded semantics until explicit opt-in or deterministic packing — Derived from: silently making former edges adjacent changes existing content behavior

## Context Summary

### Project Files

* `apps/server/src/contracts.ts` - Existing client/server domain and protocol boundary
* `apps/server/src/db/schema.ts` - Current canvas-wide persistence model
* `apps/server/src/db/repository.ts` - Current mutation, lock, snapshot, and replay boundary
* `apps/server/src/index.ts` - Current authentication, validation, subscriptions, and event fanout
* `apps/client/src/domain/math2d.ts` - Current viewport and chunk enumeration
* `apps/client/src/App.tsx` - Current flat retained state, cursors, and subscription orchestration
* `apps/client/src/render/MosaicScene.tsx` - Existing single R3F scene and world-space interactions
* `playwright.config.ts` - Existing single-server E2E harness

### References

* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` - Primary architecture, alternatives, migration, risks, and acceptance tests
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` - Current-main file anchors, validation commands, and sequencing constraints
* `https://github.com/dkirby-ms/zzyix/issues/53` - Original wraparound request

### Standards References

* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md` - Markdown structure and frontmatter conventions
* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md` - Documentation voice and clarity conventions

## Architecture Overview

```text
Unwrapped camera -> topology resolver -> canonical patch/chunk subscriptions
                 -> bounded canonical cache -> periodic display aliases -> one R3F scene

Authenticated mutation -> canonical footprint -> sorted patch locks
                       -> in-transaction ACL/geometry validation
                       -> one tile + spatial refs + linked patch histories
                       -> scoped protocol-v2 publication
```

## Affected Files Tree

```text
apps/
  client/src/
    App.tsx
    domain/{math2d,quiltCache,placementSolver,gridPatterns,gridPlacement}.*
    interaction/controller.*
    network/useSocketConnection.*
    render/{periodicImages,MosaicScene,GridOverlay}.*
  server/
    migrations/0005_*.sql
    src/
      contracts.ts
      index.ts
      domain/{quiltTopology,placementSolver}.*
      db/{schema,types,repository,quiltBackfill,quiltParity,snapshots}.*
      jobs/retention.*
      realtime/quiltRooms.*
docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md
e2e/{quilt-seams,quilt-reconnect,multi-user-fixtures}.spec.ts
playwright.multi-replica.config.ts
scripts/verify-quilt-migration.sh
```

## Design Patterns

* Canonical resolver: one shared owner for modulo, seam, alias, viewport, and subscription arithmetic
* Canonical identity with display aliases: one authoritative tile can render in multiple periodic images
* Additive expand/backfill/contract migration: legacy reads remain available through canary and rollback
* Sorted multi-resource locking: affected patch IDs are locked in deterministic order
* Area-of-interest protocol: authorized scoped snapshots and cursors replace whole-quilt retained state
* Bounded cache with pins: optimistic, undo, and selected entities survive eviction without retaining the world

## Implementation Checklist

### [x] Implementation Phase 1: Product and Security Contract

<!-- parallelizable: false -->

* [x] Step 1.1: Record immutable topology and migration decisions
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 12-35)
* [x] Step 1.2: Define principal, patch, and boundary authorization policy
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 36-58)

### [x] Implementation Phase 2: Shared Topology Domain

<!-- parallelizable: false -->

* [x] Step 2.1: Implement canonical topology primitives
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 63-86)
* [x] Step 2.2: Route client viewport math through the resolver
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 87-105)
* [x] Step 2.3: Validate topology phase
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 106-115)

### [x] Implementation Phase 3: Additive Persistence and Identity Expansion

<!-- parallelizable: false -->

* [x] Step 3.1: Add quilt, patch, membership, history, and spatial schema
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 120-147)
* [x] Step 3.2: Implement idempotent backfill and parity verification
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 148-171)
* [x] Step 3.3: Separate production migration execution from server startup
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 172-194)
* [x] Step 3.4: Validate persistence phase
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 195-201)

### [x] Implementation Phase 4: Patch-Scoped Correctness and Recovery

<!-- parallelizable: false -->

* [x] Step 4.1: Move placement correctness inside one patch-scoped transaction
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 206-229)
* [x] Step 4.2: Add real PostgreSQL concurrency coverage
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 230-248)
* [x] Step 4.3: Establish reconstructable recovery and retention
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 249-269)
* [x] Step 4.4: Validate correctness phase
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 270-277)

### [x] Implementation Phase 5: Protocol V2 Area-of-Interest Delivery

<!-- parallelizable: false -->

* [x] Step 5.1: Define authenticated quilt protocol and bounded room resolution
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 282-304)
* [x] Step 5.2: Integrate patch cursors and reconnect recovery on the client
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 305-325)
* [x] Step 5.3: Add two-replica recovery harness
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 326-347)
* [x] Step 5.4: Validate protocol phase
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 348-354)

### [x] Implementation Phase 6: Client Virtualization and Seam Rendering

<!-- parallelizable: false -->

* [x] Step 6.1: Replace flat retained state with a bounded quilt cache
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 359-378)
* [x] Step 6.2: Render camera-relative periodic images with canonical identity
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 379-400)
* [x] Step 6.3: Make interactions and geometry seam-equivalent
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 401-425)
* [x] Step 6.4: Add seam and long-traversal E2E coverage
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 426-443)
* [x] Step 6.5: Validate client phase
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 444-452)

### [ ] Implementation Phase 7: Migration Canary and Legacy Retirement

<!-- parallelizable: false -->

* [x] Step 7.1: Add dual-read parity and canary telemetry
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 457-479)
* [x] Step 7.2: Rehearse migration and document operations
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 480-496)
* [ ] Step 7.3: Retire legacy protocol and storage after exit gates
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 497-515)

### [x] Implementation Phase 8: Final Validation

<!-- parallelizable: false -->

* [x] Step 8.1: Run full project validation
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 520-531)
* [x] Step 8.2: Fix minor validation issues
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 532-535)
* [x] Step 8.3: Report blocking issues
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Lines 536-538)

### [x] Implementation Phase 9: Review-Critical Canonical Invariants

<!-- parallelizable: false -->

* [x] Step 9.1: Make exact-lap chunk subscriptions periodic
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Review Remediation Phase 9)
* [x] Step 9.2: Enforce canonical patch addresses in PostgreSQL
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Review Remediation Phase 9)
* [x] Step 9.3: Validate canonical invariant remediation
  * Details: `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md` (Review Remediation Phase 9)

### [x] Implementation Phase 10: Authorization and Consistent Recovery

<!-- parallelizable: false -->

* [x] Step 10.1: Enforce role and delegated mutation capabilities
* [x] Step 10.2: Reconstruct patches from one consistent transaction
* [x] Step 10.3: Add focused authorization and reconstruction tests

### [x] Implementation Phase 11: Complete Area-of-Interest Delivery

<!-- parallelizable: false -->

* [x] Step 11.1: Scope rooms, snapshots, and events by accepted chunks
* [x] Step 11.2: Recover stale event cursors without data loss
* [x] Step 11.3: Complete aggregate payloads and pre-join budget enforcement
* [x] Step 11.4: Validate stale-cursor and scoped-delivery behavior

### [x] Implementation Phase 12: Complete Client Virtualization and Rendering

<!-- parallelizable: false -->

* [x] Step 12.1: Persist accepted chunk scope and wire cache pins
* [x] Step 12.2: Derive periodic images from actual camera bounds
* [x] Step 12.3: Enforce deterministic traversal and runtime budgets in E2E
* [x] Step 12.4: Validate bounded client behavior

### [x] Implementation Phase 13: Canary and Migration Proof

<!-- parallelizable: false -->

* [x] Step 13.1: Gate runtime behavior by canary cohort and expose telemetry
* [x] Step 13.2: Verify full-field parity across representative canvas sizes
* [x] Step 13.3: Advance the shared contract schema version and correct runbook claims
* [x] Step 13.4: Validate migration and canary remediation

### [x] Implementation Phase 14: Remediation Final Validation

<!-- parallelizable: false -->

* [x] Step 14.1: Run focused and full repository validation
* [x] Step 14.2: Reconcile completion claims and release summary

## Planning Log

See `.copilot-tracking/plans/logs/2026-07-27/infinite-quilt-canvas-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Approved complete Stage 0 product contract, including tenancy, dimensions, visibility, far zoom, seam presentation, links, grid, presence, undo, and legacy migration policy
* Stable authenticated principal provider and patch ACL matrix before persistence enforcement
* PostgreSQL through Docker Compose for migration, concurrency, recovery, and E2E validation
* Reviewed Drizzle migration output because metadata snapshots currently stop before the latest journal entries
* Dedicated two-replica test harness for Socket.IO adapter recovery
* Production-like measurements before final room, payload, cache, scene, and frame-time thresholds

## Success Criteria

* Both edges wrap continuously and canonical coordinates remain deterministic across negative positions, exact seams, corners, and multiple laps — Traces to: user wraparound requirement and topology research
* Patches own authorization and consistency while chunks remain internal query and delivery units — Traces to: user patch concept and selected architecture
* Every cross-patch mutation is authenticated, authorized, validated, and persisted atomically under sorted locks — Traces to: derived correctness objective
* Scoped protocol-v2 recovery converges across replicas without whole-quilt snapshots or duplicate durable events — Traces to: realtime research
* Long traversal keeps client state and R3F scene counts within measured budgets — Traces to: bounded-client objective
* Migration preserves existing tile IDs, transforms, layout, and authorship without inventing owners or changing legacy edge semantics — Traces to: migration requirement
* `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e:ci`, and the multi-replica suite pass — Traces to: repository validation contract
