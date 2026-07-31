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
* `apps/server/src/db/schema.postgres.integration.test.ts` - Proves PostgreSQL accepts valid patch boundaries and rejects negative or out-of-range canonical addresses
* `apps/server/src/contracts.test.ts` - Pins the protocol-v2 shared contract schema version
* `apps/server/src/db/quiltBackfill.postgres.integration.test.ts` - Proves database-backed restart idempotency, complete field preservation, spatial parity, and no inferred owners

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
* `apps/client/src/domain/math2d.ts` - Canonicalizes toroidal viewports before chunk enumeration so exact quilt laps preserve canonical subscriptions for non-aligned periods
* `apps/client/src/domain/math2d.test.ts` - Covers zero, positive, negative, seam, and corner exact-lap subscriptions with production quilt dimensions
* `apps/client/src/App.tsx` - Supplies canonical quilt bounds to periodic chunk enumeration
* `apps/server/src/db/schema.ts` - Defines the canonical parent-quilt patch-bound constraint contract
* `apps/server/migrations/0005_finite_toroidal_quilt.sql` - Enforces patch rows and columns against parent quilt dimensions with a PostgreSQL constraint trigger
* `apps/server/src/db/repository.ts` - Fails closed for ordinary patch membership, authorizes persisted owner capability, and reconstructs patch state inside one read-only repeatable-read transaction
* `apps/server/src/db/repository.postgres.integration.test.ts` - Covers member denial and owner mutation capability under real PostgreSQL transactions
* `apps/server/src/db/recovery.postgres.integration.test.ts` - Detects mixed-commit reconstruction and proves consistent revision, tiles, and cursor reads
* `apps/server/src/contracts.ts` - Carries accepted chunk scope and useful per-chunk aggregate snapshot content
* `apps/server/src/db/repository.ts` - Queries scoped fine and aggregate snapshots and replays retained operations only when their chunk scope is provable
* `apps/server/src/realtime/quiltRooms.ts` - Merges canonical chunk scope and creates internal chunk-qualified delivery rooms
* `apps/server/src/index.ts` - Applies snapshot and payload budgets before room joins and falls back to scoped snapshots for unsafe stale-cursor replay
* `apps/server/src/index.integration.test.ts` - Covers deliberately stale cursors, aggregate content, scoped delivery, and rejected-room non-membership
* `apps/server/src/realtime/quiltRooms.test.ts` - Covers canonical scope merging and chunk-qualified room identity
* `e2e/quilt-reconnect.spec.ts` - Proves stale cross-replica recovery and scoped adapter delivery
* `e2e/quilt-seams.spec.ts` - Uses the accepted scoped snapshot contract
* `apps/client/src/App.tsx` - Retains accepted snapshot chunk scope and manages optimistic and undo pins through real protocol-v2 workflows
* `apps/client/src/domain/quiltCache.ts` - Protects active scoped patch data during eviction and exposes workflow pin lifecycle operations
* `apps/client/src/domain/quiltCache.test.ts` - Covers accepted scope and optimistic and undo pin retention
* `apps/client/src/render/MosaicScene.tsx` - Enumerates periodic images from live orthographic camera bounds, zoom, and renderer aspect
* `apps/client/src/render/MosaicScene.test.tsx` - Covers camera-bound periodic rendering behavior
* `apps/client/src/render/periodicImages.ts` - Supports live viewport bounds used by the scene
* `apps/client/src/test/canvasTestApi.ts` - Exposes traversal, grid, and bounded-runtime measurements for deterministic E2E
* `e2e/quilt-seams.spec.ts` - Performs seam, corner, positive-lap, and negative-lap traversal and enforces test-specific finite budgets
* `apps/server/src/migration/quiltRollout.ts` - Makes deterministic quilt and principal cohorts gate actual protocol-v2 and dual-read execution with immediate rollback
* `apps/server/src/migration/quiltRollout.test.ts` - Covers cohort inclusion, exclusion, global overrides, and rollback
* `apps/server/src/index.ts` - Applies runtime cohort gates and accepts normal successful client telemetry
* `apps/server/src/index.integration.test.ts` - Covers cohort-controlled execution, rollback, and normal telemetry delivery
* `apps/server/src/db/repository.ts` - Executes dual-read parity only for enabled canary paths
* `apps/server/src/db/quiltBackfill.ts` - Verifies complete persisted field and canvas geometry parity
* `apps/server/src/contracts.ts` - Advances the shared schema version to 2.0.0
* `apps/client/src/App.test.tsx` - Proves successful protocol-v2 sessions report runtime measurements
* `scripts/verify-quilt-migration.sh` - Rehearses classic, expanded, and vast canvases with boundary data and full-field fingerprints
* `apps/server/README.md` - Describes field-level parity evidence precisely
* `playwright.config.ts` - Supplies deterministic canary configuration to standard E2E
* `playwright.multi-replica.config.ts` - Supplies deterministic canary configuration to replica E2E

### Removed

## Additional or Deviating Changes

* Post-implementation review changed the release status to Needs Rework
	* Remediation Phases 9 through 14 now track three critical and fourteen major findings before protocol-v2 or quilt canary enablement
* Phase 9 corrected the two canonical invariant defects identified by review
	* Focused client tests passed with production dimensions, and five PostgreSQL integration cases proved database-enforced patch bounds
* Phase 10 enforced the exact persisted capability model without inventing unavailable delegated grants
	* Ordinary members fail closed, owners may mutate active patches, and stable external identity remains a release gate
* Phase 11 made accepted chunks authoritative for snapshot, aggregate, replay, cursor, and adapter scope
	* Older removal events without chunk metadata use a scoped snapshot fallback instead of risking loss or leakage
* Phase 12 uses conservative test-specific runtime thresholds only
	* Production cache, scene, draw-call, snapshot-byte, and frame-time gates still require measured canary evidence
* Phase 13 operationalized canary cohorts without retiring compatibility paths
	* Stable external identity, production measurements, retirement approval, protocol v1, and legacy storage remain unchanged release gates

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

Review remediation affects 32 implementation files: 3 added, 29 modified, and none removed. Phases 9 through 13 correct periodic subscriptions for non-chunk-aligned quilt periods, database-enforced patch bounds, capability-based authorization, transactionally consistent reconstruction, stale-cursor convergence, chunk-scoped delivery, useful aggregates, pre-join budgets, client cache pinning, camera-derived periodic images, deterministic traversal gates, operational canary cohorts, normal telemetry, and full-field migration proof.

No dependency packages were added. Migration 0005 remains additive, protocol v1 and legacy storage remain deployable rollback paths, and production replicas remain schema-verification-only. The complete lint and build gates pass. Unit and integration validation passes 265 tests across 42 files, standard Playwright passes 7 scenarios, multi-replica Playwright passes 1 scenario, and migration rehearsal proves three canvas sizes, four representative tiles, matching full-field fingerprints, zero inferred owners, zero geometry mismatches, and six recovery checks.

The three critical and fourteen major review findings have implementation remediation and passing focused evidence. Release enablement remains blocked by stable external identity, persisted visibility policy, production-measured thresholds, authenticated alias-mutation E2E, migration metadata repair, production migration-job ownership, and approved rollback and retirement gates. Attachment telemetry still requires production adapter instrumentation. Protocol v1 and legacy storage must not be retired before those gates pass.