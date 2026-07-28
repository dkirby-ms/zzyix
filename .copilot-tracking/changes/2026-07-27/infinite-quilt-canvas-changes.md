<!-- markdownlint-disable-file -->
# Release Changes: Infinite Quilt Canvas

**Related Plan**: infinite-quilt-canvas-plan.instructions.md
**Implementation Date**: 2026-07-27

## Summary

Implemented the finite toroidal quilt architecture through validated canary readiness:
canonical topology, additive persistence, patch-scoped transactions, protocol-v2 area-of-interest delivery, bounded client state, seam rendering, and migration rehearsal.
Legacy retirement remains gated and was not performed.

## Changes

### Added

* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Defines immutable topology, canonical identity, legacy migration, principal and patch authorization, visibility, atomic boundary mutations, and measured rollout gates
* `apps/server/src/domain/quiltTopology.ts` - Provides positive modulo, canonical point and grid resolution, wrapped viewport decomposition, periodic images, and canonical subscription deduplication
* `apps/server/src/domain/quiltTopology.test.ts` - Covers seams, negative and multi-period inputs, viewport decomposition, aliases, deduplication, and invalid inputs
* `apps/client/src/domain/math2d.test.ts` - Covers unbounded, bounded, and toroidal chunk enumeration and canonical deduplication
* `apps/server/migrations/0005_finite_toroidal_quilt.sql` - Adds quilt persistence, principal mappings, patch ACL data, patch histories and snapshots, spatial references, and Socket.IO attachments
* `apps/server/src/db/migrate.test.ts` - Covers migration status compatibility enforcement
* `apps/server/src/db/quiltBackfill.ts` - Provides resumable compatibility-quilt backfill and parity verification without inferring ownership
* `apps/server/src/db/quiltBackfill.test.ts` - Covers compatibility geometry and derived spatial references
* `apps/server/src/db/repository.postgres.integration.test.ts` - Proves seam serialization, deterministic lock order, idempotency, distant-write concurrency, and atomic rejection
* `apps/server/src/db/recovery.postgres.integration.test.ts` - Proves authoritative patch reconstruction across operation and snapshot retention ages
* `apps/server/src/test/postgresTestDatabase.ts` - Provides isolated disposable PostgreSQL databases for integration suites
* `apps/server/src/realtime/quiltRooms.ts` - Resolves canonical authorized rooms with explicit outcomes and configurable canary limits
* `apps/server/src/realtime/quiltRooms.test.ts` - Covers canonicalization, privacy, deduplication, and budgets
* `playwright.multi-replica.config.ts` - Runs deterministic two-replica PostgreSQL-backed recovery tests
* `e2e/quilt-reconnect.spec.ts` - Covers cross-replica cursor recovery, authorization, deduplication, and adapter attachments
* `e2e/support/multiReplicaDatabase.ts` - Creates the disposable multi-replica database
* `e2e/support/multiReplicaGlobalTeardown.ts` - Removes multi-replica test resources
* `e2e/support/startMultiReplicaServer.ts` - Starts isolated test replicas
* `apps/client/src/domain/quiltCache.ts` - Stores bounded canonical patch state with pins for optimistic, undo, and selection metadata
* `apps/client/src/domain/quiltCache.test.ts` - Covers stable-ID deduplication, pinning, and long-traversal eviction
* `apps/client/src/render/periodicImages.ts` - Resolves camera-relative periodic aliases and canonical hit identity
* `apps/client/src/render/periodicImages.test.ts` - Covers edge, corner, and multi-lap aliases
* `e2e/quilt-seams.spec.ts` - Covers seam aliases, corners, traversal, reconnect, bounded state, and performance measurements
* `apps/server/src/db/quiltParity.ts` - Compares complete legacy and patch tile identity, appearance, transform, authorship, and timestamps
* `apps/server/src/db/quiltParity.test.ts` - Covers parity and mismatch reporting
* `apps/server/src/db/quiltParityCli.ts` - Exposes operator parity verification
* `apps/server/src/migration/quiltRollout.ts` - Selects canary cohorts and enforces fail-closed legacy retirement gates
* `apps/server/src/migration/quiltRollout.test.ts` - Covers deterministic cohorts and retirement decisions
* `apps/server/src/migration/quiltTelemetry.ts` - Captures threshold-neutral server and client canary measurements
* `apps/server/src/migration/quiltTelemetry.test.ts` - Covers telemetry aggregation
* `scripts/verify-quilt-migration.sh` - Rehearses migration, repeated backfill, parity, rollback, and recovery with production safeguards

### Modified

* `apps/client/src/domain/math2d.ts` - Adds explicit topology modes and delegates toroidal subscription identity to the shared resolver while preserving unbounded defaults
* `apps/server/migrations/meta/_journal.json` - Registers the reviewed additive migration
* `apps/server/package.json` - Adds the explicit quilt backfill command
* `apps/server/src/db/migrate.ts` - Makes production startup verification-only while preserving one-shot and local migration commands
* `apps/server/src/db/repository.ts` - Adds additive spatial parity support
* `apps/server/src/db/repository.test.ts` - Covers spatial parity helpers
* `apps/server/src/db/schema.ts` - Models quilts, patches, principals, memberships, histories, snapshots, and spatial references
* `apps/server/src/db/types.ts` - Exports the additive persistence types
* `apps/server/src/index.ts` - Uses environment-aware schema preparation before listening
* `package.json` - Exposes the quilt backfill command from the workspace root
* `apps/server/src/db/repository.ts` - Adds principal-only patch-scoped placement transactions, sorted locks, in-transaction validation, authoritative reconstruction, snapshots, and safe retention
* `apps/server/src/db/repository.test.ts` - Covers deterministic patch-lock and spatial helpers
* `apps/server/src/db/snapshots.ts` - Creates patch snapshots from authoritative state
* `apps/server/src/domain/placementSolver.ts` - Supports nearest periodic neighbor geometry for server-side validation
* `apps/server/src/domain/placementSolver.port.test.ts` - Covers periodic geometry parity
* `apps/server/src/index.ts` - Keeps legacy mutation behind an explicit compatibility gate and publication after commit
* `apps/server/src/jobs/retention.ts` - Prunes audit history without making it the source of current state
* `apps/server/src/jobs/retention.test.ts` - Covers safe retention delegation and invariants
* `apps/server/src/contracts.ts` - Defines protocol-v2 negotiation, topology, room outcomes, cursors, scoped snapshots, and events
* `apps/server/src/db/repository.ts` - Supports patch cursor recovery and scoped snapshots
* `apps/server/src/index.ts` - Negotiates v2, enforces AOI authorization and limits, and scopes publication
* `apps/server/src/index.integration.test.ts` - Covers protocol-v2 integration and duplicate suppression
* `apps/client/src/network/useSocketConnection.ts` - Negotiates v2 and registers scoped recovery events
* `apps/client/src/network/useSocketConnection.test.ts` - Covers v2 registration, cleanup, and recovery wiring
* `apps/client/src/App.tsx` - Reconciles patch cursors, scoped snapshots, canonical subscriptions, and negotiated toroidal mode
* `apps/client/src/App.test.tsx` - Covers scoped reconciliation, resync, and duplicate suppression
* `apps/server/README.md` - Documents protocol flags, canary limits, and recovery operations
* `apps/client/src/App.tsx` - Uses bounded quilt cache orchestration for protocol v2 and exposes traversal measurements
* `apps/client/src/test/canvasTestApi.ts` - Exposes canonical cache and scene measurements for E2E
* `apps/client/src/interaction/controller.ts` - Converts display hits to canonical quilt interactions once
* `apps/client/src/interaction/controller.test.ts` - Covers alias identity and all-patch permission routing
* `apps/client/src/domain/placementSolver.ts` - Uses nearest periodic neighbors for seam collision and adjacency
* `apps/client/src/domain/placementSolver.test.ts` - Covers seam-equivalent geometry
* `apps/client/src/domain/gridPlacement.ts` - Canonicalizes toroidal snapping
* `apps/client/src/domain/gridPlacement.test.ts` - Covers seam snapping parity
* `apps/client/src/render/MosaicScene.tsx` - Renders periodic aliases in one camera-relative scene with a local interaction plane
* `apps/client/src/render/MosaicScene.test.tsx` - Covers pointer routing, selection, and alias identity
* `apps/client/src/render/GridOverlay.tsx` - Keeps the quilt-global grid continuous through seams
* `apps/client/src/render/gridOverlayGeometry.ts` - Generates camera-local seam-continuous grid geometry
* `apps/server/src/db/client.ts` - Measures database pool wait
* `apps/server/src/db/index.ts` - Exposes parity-aware quilt reads
* `apps/server/src/db/repository.ts` - Adds dual-read fallback and canary metrics hooks
* `apps/server/src/index.ts` - Applies canary selection, telemetry, and retirement gates
* `apps/server/src/contracts.ts` - Carries client canary measurements
* `apps/server/src/db/recovery.postgres.integration.test.ts` - Extends recovery validation through rollback rehearsal
* `apps/client/src/App.tsx` - Reports bounded cache, scene, draw-call, snapshot-byte, and frame-time measurements
* `apps/server/package.json` - Adds parity and migration operation commands
* `package.json` - Exposes migration verification commands
* `apps/server/README.md` - Documents canary, rollback, and recovery operations
* `README.md` - Describes quilt topology and legacy compatibility behavior
* `playwright.config.ts` - Isolates the dedicated multi-replica suite, enables protocol-v2 readiness, and serializes destructive shared-state E2E tests

### Removed

## Additional or Deviating Changes

* No Phase 1 deviations from the implementation details
* Phase 2 did not export topology types from protocol contracts because they do not yet cross the wire
	* Production chunk subscriptions remain unbounded until protocol-v2 topology configuration is integrated in Phase 5
* Phase 3 intentionally omits `apps/server/migrations/meta/0005_snapshot.json`
	* Snapshot metadata stops at 0002; creating only a 0005 snapshot would misrepresent migrations 0003 and 0004
* Phase 3 exposes the one-shot migration command but cannot wire an absent production deployment job
	* Production replicas now verify schema compatibility and never race DDL
* Phase 4 leaves toroidal socket mutation disabled until an authenticated external identity maps to an internal principal
	* Legacy caller-provided identity remains available only through the explicit compatibility flag
* Phase 5 uses conservative visibility behavior because patches do not yet persist an explicit visibility policy
	* Anonymous access is aggregate-only; fine data, presence, and events require a resolved principal
* Phase 6 seam E2E records collaborative alias mutation as blocked rather than bypassing the identity gate
	* Read, alias, reconnect, cache, scene, snapshot-byte, and frame-time scenarios are covered
* Phase 7 does not retire protocol v1 or legacy storage because authenticated identity, measured canary-window, client-budget, and rollback-policy gates remain unmet
	* Explicit retirement configuration fails closed and legacy rollback remains available
* Phase 8 extended migration rehearsal to execute retention-age reconstruction and corrected the standard Playwright harness after focused validation exposed configuration overlap
	* All full validation gates passed after the isolated fixes

## Release Summary

The implementation affects 69 product files: 32 added, 37 modified, and none removed. It adds the accepted quilt ADR, shared topology resolver, additive migration and backfill, patch-scoped PostgreSQL correctness and recovery, protocol-v2 scoped delivery, bounded client virtualization, periodic seam rendering, canary telemetry, and guarded migration operations.

No dependency packages were added. Migration 0005 is additive, production replicas are schema-verification-only, and one-shot migration remains an explicit release operation. The complete lint, build, 245-test unit and integration, seven-test standard E2E, one-test multi-replica, and disposable migration, rollback, parity, and recovery gates pass.

Protocol v1 and legacy storage remain deployable rollback paths. Their removal is blocked until authenticated principal integration, persisted visibility policy, production measurements, authenticated alias mutation coverage, and the approved canary and rollback gates are complete.