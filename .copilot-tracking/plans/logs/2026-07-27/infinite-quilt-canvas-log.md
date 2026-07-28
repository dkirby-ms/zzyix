<!-- markdownlint-disable-file -->
# Planning Log: Infinite Quilt Canvas

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

No unaddressed research items remain in the implementation plan. Production thresholds, identity-provider selection, migration metadata repair, and deployment ownership are represented as explicit phase gates or follow-on work rather than assumed values.

### Resolved Validation Findings

* DR-01: Resolved by expanding Phase 1 to cover tenancy, patch visibility, far zoom, seam cues, minimap, canonical links, grid scope, presence and roster scope, undo, and copy/paste behavior
* DR-02: Resolved by regenerating every plan-to-details range from the final detail headings
* DR-03: Resolved by correcting research citation labels and ranges in the implementation details
* DR-04: Resolved by adding the disposable-database migration, repeated backfill, parity, rollback, and retention reconstruction rehearsal to final validation

### Plan Deviations from Research

### Implementation Deviations

* DD-01: Migration 0005 has no generated Drizzle snapshot
  * Plan specifies: Add a reviewed schema snapshot if generated consistently
  * Implementation differs: The SQL migration and journal entry are present without a 0005 snapshot
  * Rationale: Snapshot metadata stops at 0002, so a standalone 0005 snapshot would encode a false history
* DD-02: Production migration ownership is exposed but not wired into a deployment job
  * Plan specifies: Configure one deployment migration job or release step
  * Implementation differs: Production replicas are verification-only and the runtime exposes `db:apply`, but no external job was added
  * Rationale: This repository has no application deployment workflow or Container Apps job owner
* DD-03: Protocol-v2 visibility uses a conservative derived policy
  * Plan specifies: Apply the complete persisted visibility matrix
  * Implementation differs: Anonymous users receive publishable aggregates only; fine data, presence, and events require a stable principal
  * Rationale: Phase 3 schema has no explicit patch visibility-policy field, so broader access cannot be represented safely
* DD-04: Legacy retirement remains unexecuted
  * Plan specifies: Remove v1 fanout and legacy storage after all exit gates pass
  * Implementation differs: Retirement gates are implemented, but v1 and legacy data remain intact
  * Rationale: Authenticated principal integration, measured canary-window evidence, client-budget approval, and rollback-policy approval are not complete

### Final Validation

All executable repository gates pass after isolating the dedicated multi-replica test from the standard Playwright configuration, enabling protocol-v2 readiness for seam E2E, serializing destructive reset scenarios, and adding retention-age reconstruction to the migration rehearsal. These fixes do not satisfy or bypass the Phase 7.3 product and release gates.

### Post-Implementation Review Findings

* DD-05: Passing baseline gates did not establish canonical exact-lap subscriptions, bounded patch persistence, or stale-cursor recovery
  * Plan specifies: Canonical subscriptions, bounded patch addresses, and reconstructable scoped recovery
  * Implementation differs: The review demonstrated three critical untested correctness defects
  * Rationale: Existing tests did not exercise production non-chunk-aligned periods, direct invalid patch inserts, or deliberately stale event-only cursors
* DD-06: Completed phase markers overstated AOI scoping, client pin wiring, canary control, and migration parity
  * Plan specifies: Scoped data delivery, bounded active state, cohort-gated rollout, and full-field migration proof
  * Implementation differs: The foundations exist, but the runtime paths and focused evidence are incomplete
  * Rationale: Source review traced the missing behavior through the controlling call sites

Remediation Phases 9 through 14 were added to preserve the historical implementation record while making every critical and major review finding explicit work.

Phase 9 is complete. Toroidal subscription enumeration now canonicalizes the viewport before chunk derivation, and PostgreSQL enforces patch addresses against parent quilt dimensions. Focused tests, client and server lint, client and server builds, diagnostics, and whitespace validation passed.

Phase 10 is complete. The existing schema can represent owner and member roles but not delegated mutation grants or audited moderator assignments, so authorization now allows owners and denies ordinary members. Patch reconstruction reads revision, authoritative tiles, compatibility data, and event cursor from one repeatable-read transaction. Focused repository and PostgreSQL recovery suites passed.

Phase 11 is complete. Accepted chunk IDs now determine fine snapshots, aggregate content, durable replay, cursors, and adapter rooms. Deliberately stale cursors replay contiguous applicable events or receive a scoped snapshot when operation scope is incomplete. Budget failures occur before room joins. Focused server, client, PostgreSQL, and multi-replica tests passed.

Phase 12 is complete. Accepted snapshot chunk scope now protects active cache data, protocol-v2 placement and undo workflows manage optimistic and undo pins, and periodic rendering uses live orthographic camera bounds. Seam E2E performs deterministic seam, corner, and multi-lap traversal with finite test-only budgets. Focused client tests and Playwright passed.

Phase 13 is complete. Quilt and principal cohorts now gate actual protocol-v2 and dual-read execution, rollback disables canary behavior immediately, and normal successful sessions report client telemetry. Contract schema version 2.0.0 is pinned. Database-backed tests and migration rehearsal prove complete field preservation across classic, expanded, and vast canvases, boundary data, repeated backfill, spatial parity, rollback, and zero inferred owners.

Phase 14 is complete. Full lint, build, 265-test unit and integration, seven-scenario standard E2E, one-scenario multi-replica E2E, migration rehearsal, diagnostics, and whitespace gates passed. No final-validation repairs were required. Phase 7.3 remains blocked by its documented external release gates.

## Implementation Paths Considered

### Selected: Finite Toroidal Quilt with First-Class Patches

* Approach: Define immutable finite quilt dimensions, regular canonical patches, patch-local chunks, one canonical tile identity, sorted patch-scoped transactions, scoped protocol-v2 recovery, and camera-relative periodic aliases
* Rationale: It satisfies literal opposite-edge wrapping while bounding persistence, locking, authorization, recovery, network delivery, client state, and rendering work
* Evidence: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 76-218)

### IP-01: Wrap-Only Huge Global Torus

* Approach: Retain one canvas-wide revision, lock, snapshot, and participant model while wrapping global coordinates and rendering aliases
* Trade-offs: Smaller initial schema change, but unrelated regions remain serialized and ownership becomes implicit coordinate-range policy; recovery and retained state still scale with total content
* Rejection rationale: Correcting its locking, authorization, and recovery limits recreates first-class patches without naming them

### IP-02: Unbounded Sparse Plane

* Approach: Keep signed chunks and remove hard bounds without periodic aliases
* Trade-offs: Fits current chunk coordinates and avoids seam complexity, but traveling east never returns to western content
* Rejection rationale: It does not satisfy issue 53's literal opposite-edge wrapping

### IP-03: Independent Patch Scenes or Adjacency Graph

* Approach: Treat each patch as a separate scene or persist explicit neighbor edges
* Trade-offs: Supports portals, holes, rotations, and manual restitching, but duplicates rendering and interaction infrastructure or adds graph consistency semantics
* Rejection rationale: A complete rectangular torus derives neighbors with modulo and needs neither multiple scenes nor adjacency rows

### IP-04: Larger Bounded Canvas Preset

* Approach: Add a larger size option and preserve current bounded behavior
* Trade-offs: Lowest short-term implementation cost, but only postpones the edge and does not add wraparound, ownership, scoped consistency, or bounded state
* Rejection rationale: It does not implement the requested topology

## Suggested Follow-On Work

Items identified during planning that fall outside current implementation scope.

* WI-01: Production workload benchmark — Measure tile density, subscription churn, payload size, cache size, scene count, lock wait, and frame time before finalizing limits (high priority, medium effort)
  * Source: Primary research potential next research
  * Dependency: Topology prototype and representative data
* WI-02: Identity and threat-model workshop — Select principal provider and finalize claims, roles, moderation, transfer, deletion, and visibility policy (high priority, medium effort)
  * Source: Primary research product decisions
  * Dependency: Product and security stakeholders
* WI-03: Drizzle metadata repair — Reconcile migration snapshots 0003 and 0004 before generating or accepting migration 0005 (high priority, small effort)
  * Source: Supporting plan-anchor research migration metadata finding
  * Dependency: Clean branch and disposable database
* WI-04: Deployment migration-job design — Locate or create the application deployment owner for one-shot schema migration execution (high priority, medium effort)
  * Source: Supporting plan-anchor research deployment finding
  * Dependency: Deployment repository or workflow ownership
* WI-05: Shared domain package evaluation — Extract cross-workspace contracts and topology into a dedicated package if direct server-source imports impede ownership or builds (low priority, medium effort)
  * Source: Selected shared-module implementation path
  * Dependency: Phase 2 implementation feedback
* WI-06: Production topology-mode wiring — Pass negotiated quilt topology into client chunk enumeration when protocol v2 is enabled (high priority, small effort)
  * Source: Phase 2, Step 2.2
  * Dependency: Phase 5 protocol topology negotiation
* WI-07: Runtime ESM metadata cleanup — Declare runtime module semantics in the server image package metadata to remove the existing Node warning (low priority, small effort)
  * Source: Phase 3, Step 3.4
  * Dependency: None
* WI-08: Authenticated principal integration — Connect the selected external identity provider to internal principals before enabling quilt mutation over protocol v2 (release blocker, medium effort)
  * Source: Phase 4, Step 4.1
  * Dependency: WI-02 identity and threat-model workshop
* WI-09: Persist patch visibility policy — Add explicit public existence, fine, aggregate, presence, search, and event policy fields before enabling broader public delivery (high priority, medium effort)
  * Source: Phase 5, Step 5.1
  * Dependency: Approved visibility product policy
* WI-10: Authenticated alias mutation E2E — Add collaborative placement and removal through periodic aliases after protocol-v2 mutation is enabled (release blocker, small effort)
  * Source: Phase 6, Step 6.4
  * Dependency: WI-08 authenticated principal integration
* WI-11: Legacy contract retirement — Remove protocol v1 and obsolete storage in a separately reviewed contract migration after all fail-closed gates pass (high priority, large effort)
  * Source: Phase 7, Step 7.3
  * Dependency: WI-01, WI-08, WI-10, approved rollback policy, and measured canary window
* WI-12: Delegated patch mutation grants — Persist scoped delegated capabilities and audited moderator assignments before enabling non-owner mutation (high priority, medium effort)
  * Source: Phase 10, Step 10.1
  * Dependency: Approved identity and authorization policy
* WI-13: Persist removal-event chunk scope — Store affected chunk IDs with protocol-v2 removals so retained removals can always replay without snapshot fallback (medium priority, small effort)
  * Source: Phase 11, Step 11.2
  * Dependency: Protocol-v2 mutation enablement
