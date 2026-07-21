<!-- markdownlint-disable-file -->
# Release Changes: Canvas Scaling and Camera Controls

**Related Plan**: canvas-scaling-camera-controls-plan.instructions.md
**Implementation Date**: 2026-07-21

## Summary

Implementation in progress for canvas scaling, camera controls, chunk protocol, persistence migration, and rollout safeguards.
Phase 1 completed: configurable bounds policy parity across client and server, additive session metadata surface, and camera policy wiring with asymmetric culling removal.
Phase 2 completed: additive chunk contracts, chunk room lifecycle on server, chunk-scoped deltas/resync, and viewport-derived subscription diffing with hysteresis and budgets.
Phase 3 completed: additive chunk persistence schema and migration, chunk-aware repository query paths, and parity verification between legacy and chunked reads.
Phase 4 completed: zoom-tier aggregate mode contracts and behavior, feature-flag and canary rollout controls, telemetry instrumentation, and multi-replica readiness metadata with failure-mode tests.
Phase 6 completed: post-review correctness rework for aggregate snapshot merge semantics, App-level transition and resync tests, shared runtime chunk-size configuration, capability-gated client chunk streaming startup, and README runtime-default alignment.

## Changes

### Added

* apps/server/migrations/0003_tidy_chunk_columns.sql - Added additive chunk coordinate columns, backfill logic, and chunk query index.
* apps/server/src/db/repository.test.ts - Added chunk query and legacy parity-focused repository tests.

### Modified

* apps/client/src/domain/placementSolver.ts - Added configurable `BoundsPolicy` support and compatibility normalization for bounded and unbounded-ready modes.
* apps/client/src/domain/placementSolver.test.ts - Added coverage for policy-driven bounds validation paths.
* apps/client/src/render/MosaicScene.tsx - Added camera policy hooks and removed asymmetric X-only visibility filtering.
* apps/client/src/App.tsx - Added camera policy state and scene policy wiring.
* apps/client/src/App.test.tsx - Added tests for camera policy wiring behavior.
* apps/server/src/contracts.ts - Added additive session canvas config and bounds policy contract fields.
* apps/server/src/index.ts - Switched placement validation to per-session bounds policy and exposed additive snapshot/session policy metadata.
* apps/server/src/index.test.ts - Updated server behavior checks for session-configured bounds policy.
* apps/server/src/index.integration.test.ts - Updated integration assertions for additive session metadata shape.
* apps/server/src/domain/placementSolver.ts - Added server-side parity support for bounds policy normalization.
* apps/server/src/domain/placementSolver.port.test.ts - Added parity tests for policy object and legacy bounds inputs.
* apps/client/src/domain/math2d.ts - Added viewport-to-chunk mapping, chunk budgeting, and hysteresis helper utilities.
* apps/client/src/network/session.ts - Added chunk identifier and payload helper typing utilities.
* apps/client/src/network/useSocketConnection.ts - Added chunk event subscription handlers and additive chunk socket wiring.
* apps/server/src/db/schema.ts - Added chunk fields and index metadata to tile schema.
* apps/server/src/db/repository.ts - Added chunk-scoped read paths and dual-read parity safeguards.
* apps/server/src/index.integration.test.ts - Added migration parity and boundary behavior integration checks.
* apps/server/migrations/meta/_journal.json - Registered chunk schema migration metadata.
* apps/client/src/network/useSocketConnection.test.ts - Added chunk event and capability gating behavior coverage.
* apps/server/README.md - Documented feature flag and canary controls for chunk rollout.
* apps/client/src/App.tsx - Fixed aggregate snapshot merge semantics, gated chunk streaming until realtime capabilities are known, and consumed shared runtime chunk-size constant.
* apps/client/src/App.test.tsx - Added App-level regression tests for aggregate and fine snapshot transitions, resync snapshot requests, and capability-gated chunk streaming wiring.
* apps/server/src/contracts.ts - Added additive shared runtime chunk-size constant for cross-layer runtime parity.
* apps/server/src/index.ts - Consumed shared runtime chunk-size constant for server chunk mapping.
* apps/server/src/db/repository.ts - Consumed shared runtime chunk-size constant for repository chunk mapping parity.
* apps/server/README.md - Corrected CORS default value to match runtime behavior.

### Removed

* None yet.

## Additional or Deviating Changes

* Server-side placement solver parity enhancements were implemented in `apps/server/src/domain/placementSolver.ts` and `apps/server/src/domain/placementSolver.port.test.ts` although not explicitly listed in the phase file list.
	* Needed to resolve a failing out-of-bounds test once server validation consumed policy objects.
* Client build produced a non-blocking bundle size warning.
	* Deferred to follow-on optimization because it does not block functional Phase 1 objectives.
* Client lint raised a hook cleanup ref-access warning during Phase 2 implementation in `apps/client/src/App.tsx`.
	* Addressed immediately in-scope and revalidated with clean lint/test results.
* Server build failed once during Phase 3 on strict unknown narrowing in chunk cursor guard in `apps/server/src/index.ts`.
	* Resolved in-scope by explicit numeric type-guard checks before comparisons and revalidated with clean build.
* Optional architecture decision document update in `docs/decisions/2026-07-15-deployment-architecture-v01.md` was not applied in Phase 4.
	* Deferred because implementation details marked it optional and all acceptance criteria were met without it.
* Chunk snapshot payload mode hint on explicit `request_chunk_snapshot` remains server-selected by capability defaults.
	* Deferred as follow-on because current correctness fix and tests are complete for mode-coherent client requests while preserving additive compatibility.

## Release Summary

Completed implementation phases across client rendering/navigation, server protocol/runtime, persistence migration, and post-review corrective rework.

Total files affected in implementation scope:
* Added: 2
* Modified: 21
* Removed: 0

Created files:
* apps/server/migrations/0003_tidy_chunk_columns.sql - Additive chunk persistence migration with backfill and indexing.
* apps/server/src/db/repository.test.ts - Repository parity and chunk query test coverage.

Key modified file groups and purpose:
* Client navigation and subscription logic:
	* apps/client/src/App.tsx
	* apps/client/src/App.test.tsx
	* apps/client/src/render/MosaicScene.tsx
	* apps/client/src/domain/math2d.ts
	* apps/client/src/network/session.ts
	* apps/client/src/network/useSocketConnection.ts
	* apps/client/src/network/useSocketConnection.test.ts
	* Purpose: session-configurable camera policy, viewport-to-chunk mapping with hysteresis/budgets, chunk subscription lifecycle, zoom-tier transitions, and additive chunk event handling.
* Client placement parity:
	* apps/client/src/domain/placementSolver.ts
	* apps/client/src/domain/placementSolver.test.ts
	* Purpose: replace fixed bounds assumptions with policy-driven bounded/unbounded-ready validation.
* Server contracts, runtime, and tests:
	* apps/server/src/contracts.ts
	* apps/server/src/index.ts
	* apps/server/src/index.test.ts
	* apps/server/src/index.integration.test.ts
	* Purpose: additive chunk contracts and payload modes, feature-flag/canary controls, chunk room lifecycle, chunk snapshot and delta ordering semantics, telemetry, and multi-replica readiness metadata with failure-mode checks.
* Server placement parity and persistence:
	* apps/server/src/domain/placementSolver.ts
	* apps/server/src/domain/placementSolver.port.test.ts
	* apps/server/src/db/schema.ts
	* apps/server/src/db/repository.ts
	* apps/server/migrations/meta/_journal.json
	* apps/server/README.md
	* Purpose: server-side bounds policy parity, chunk-aware schema and indexed reads, dual-read parity safeguards, migration registration, and rollout documentation.

Validation status:
* Passed: lint and test suites for client and server.
* Passed: client and server builds.
* Advisory only: non-blocking client bundle size warning from Vite remained.

Deployment and operational notes:
* Migration is additive and rollback-safe at protocol level.
* Legacy bounded/session-wide flows remain available behind additive compatibility paths.
* Chunk and aggregate modes are rollout-gated via feature flags and canary controls.
