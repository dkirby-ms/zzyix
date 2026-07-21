<!-- markdownlint-disable-file -->
# Implementation Details: Canvas Scaling and Camera Controls

## Context Reference

Sources: .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md, .copilot-tracking/research/subagents/2026-07-21/canvas-camera-baseline-research.md, .copilot-tracking/research/subagents/2026-07-21/chunking-architecture-options-research.md, conversation request.

## Implementation Phase 1: Finite canvas scaling and camera policy foundation

<!-- parallelizable: false -->

### Step 1.1: Introduce session-configurable bounds policy in client placement solver

Refactor client placement bounds from fixed constants into a policy object derived from session metadata. Preserve strict behavior for bounded sessions and add an unbounded-ready mode toggle for future chunk-first sessions.

Files:
* apps/client/src/domain/placementSolver.ts - Add bounds policy abstraction and remove hardcoded default bounds dependency from core validation paths.
* apps/client/src/domain/placementSolver.test.ts - Add tests for bounded policy and unbounded-ready policy behavior.

Success criteria:
* Placement solver accepts bounds configuration rather than relying on fixed defaults.
* Existing bounded placement test expectations remain intact.
* Additional tests confirm no regression in overlap and gap checks.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 48-51) - hardcoded bounds evidence.

Dependencies:
* None.

### Step 1.2: Surface configurable canvas dimensions through server session metadata and validation inputs

Promote canvas size to first-class session-level data and ensure all validation paths consume the session-specific bounds policy.

Files:
* apps/server/src/contracts.ts - Extend session metadata for configurable canvas bounds and mode.
* apps/server/src/index.ts - Replace globally-derived bounds with per-session bounds in validation and snapshot logic.
* apps/server/src/index.test.ts - Validate bounded placement consistency with session-defined dimensions.

Success criteria:
* Session creation and snapshot payloads expose canvas bounds policy.
* Placement validation on server uses session bounds inputs.
* Existing contract consumers remain backward compatible through additive fields.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 56-60) - server fixed canvas evidence.

Dependencies:
* Step 1.1 completion for parity alignment.

### Step 1.3: Expand camera pan and zoom policy hooks and remove X-only render filtering

Refactor camera navigation and tile visibility to use two-dimensional viewport-aware filtering and configurable zoom/pan policies suitable for larger canvases.

Files:
* apps/client/src/render/MosaicScene.tsx - Replace X-only culling with viewport-aware filtering and expose camera visibility metadata.
* apps/client/src/App.tsx - Move camera policy configuration into state and pass to scene.
* apps/client/src/App.test.tsx - Add behavior tests for camera pan and zoom policy wiring.

Success criteria:
* Tile visibility filtering accounts for X and Y world extents.
* Camera pan range and zoom policy can be adjusted through session or app configuration.
* Interaction model remains compatible with existing left place, right rotate, and middle pan bindings.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 52-55, 63-65) - camera baseline and X-only filtering evidence.

Dependencies:
* Step 1.1 completion.
* Step 1.2 completion.

### Step 1.4: Validate phase changes

Run validation after bounded policy and camera updates.

Validation commands:
* npm run lint:client - client camera and placement changes.
* npm run test:client - client placement and rendering tests.
* npm run build:client - client type and build validation.
* npm run lint:server - server session metadata and bounds changes.
* npm run test:server - server placement and snapshot behavior checks.

## Implementation Phase 2: Chunk protocol and realtime subscription core

<!-- parallelizable: false -->

### Step 2.1: Add additive chunk event contracts and payload typing

Define chunk subscription and delivery payloads while preserving all existing session snapshot and event contracts.

Files:
* apps/server/src/contracts.ts - Add `ChunkId`, chunk subscription payloads, chunk snapshot payloads, and chunk delta events.
* apps/client/src/network/session.ts - Add helper types and serialization support for chunk identifiers if needed.

Success criteria:
* Contracts compile with additive chunk events.
* Legacy clients can continue using existing bounded events until chunk feature flag is enabled.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 140-151) - additive chunk protocol outline.

Dependencies:
* Phase 1 completion.

### Step 2.2: Implement server chunk room subscribe, unsubscribe, and snapshot fanout flows

Add room membership lifecycle keyed by chunk IDs and serve chunk snapshots and chunk deltas using existing op sequence and revision semantics.

Files:
* apps/server/src/index.ts - Implement `subscribe_chunks`, `unsubscribe_chunks`, `chunk_snapshot`, `chunk_tile_placed`, `chunk_tile_removed`, and `chunk_resync_required` handling.
* apps/server/src/index.integration.test.ts - Add integration tests for room fanout and chunk snapshot ordering.

Success criteria:
* Clients can subscribe and unsubscribe chunk sets without dropping existing session connection.
* Chunk snapshots and deltas preserve ordering using sequence metadata.
* Server can issue resync-required when offsets diverge.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 84-88, 141-146, 219-224) - room fanout and ordering requirements.

Dependencies:
* Step 2.1 completion.

### Step 2.3: Derive visible chunk set from camera viewport with hysteresis and budget limits

Compute visible chunk set from camera viewport extents, prefetch ring, and hysteresis to avoid subscription churn during minor pan movement.

Files:
* apps/client/src/App.tsx - Track viewport state and chunk subscription diff decisions.
* apps/client/src/render/MosaicScene.tsx - Emit viewport extents and zoom-tier crossing signals.
* apps/client/src/domain/math2d.ts - Add utility functions for viewport to chunk mapping if needed.

Success criteria:
* Chunk subscriptions update only when movement or zoom thresholds are exceeded.
* Visible chunk count remains within soft and hard subscription budgets.
* Prefetch ring behavior is deterministic.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 127-138, 170-184, 229-233) - mapping and hysteresis examples.

Dependencies:
* Step 2.2 completion.

### Step 2.4: Validate phase changes

Run chunk protocol and subscription behavior validation.

Validation commands:
* npm run lint:server - contracts and server handlers.
* npm run test:server - chunk subscription and snapshot ordering coverage.
* npm run lint:client - viewport and subscription logic.
* npm run test:client - chunk visibility and subscription diff tests.

## Implementation Phase 3: Chunk-aware persistence and migration safety

<!-- parallelizable: false -->

### Step 3.1: Add chunk columns and indexes to tile persistence schema

Evolve schema additively to persist chunk coordinates and query efficiently by canvas and chunk.

Files:
* apps/server/src/db/schema.ts - Add `chunk_x` and `chunk_y` fields on tile records and optional operation log metadata.
* apps/server/migrations - Add migration introducing chunk columns and index on `(canvas_id, chunk_x, chunk_y, created_at)`.
* apps/server/drizzle.config.ts - Ensure migration generation and execution paths include new schema artifacts.

Success criteria:
* Migration applies cleanly on local and CI databases.
* New chunk index is present and used by chunk-scoped queries.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 61-62, 147-151) - schema and index recommendation.

Dependencies:
* Phase 2 completion.

### Step 3.2: Implement chunk-aware repository queries and dual-write read parity checks

Update repository APIs to read by chunk and optionally dual-write legacy-compatible records during migration period.

Files:
* apps/server/src/db/repository.ts - Add chunk-scoped fetch/query methods and dual-read or dual-write safeguards.
* apps/server/src/index.ts - Route chunk snapshot retrieval through chunk-aware repository paths.

Success criteria:
* Chunk snapshot queries use indexed chunk columns.
* Legacy and chunked read paths remain parity-compatible during feature-flagged migration.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 60-62, 147-151, 318-319) - repository and migration path guidance.

Dependencies:
* Step 3.1 completion.

### Step 3.3: Add migration verification and parity tests between legacy and chunked read paths

Create deterministic tests that compare legacy viewport snapshot union against chunk snapshot outputs for equivalent views.

Files:
* apps/server/src/index.integration.test.ts - Add chunk snapshot parity and resync-required tests.
* apps/server/src/db/repository.test.ts - Add chunk query and dual-read parity assertions if test file exists; otherwise add to existing server test surface.

Success criteria:
* Tests verify parity between legacy and chunked reads.
* Tests verify edge cases at chunk boundaries.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 264-279) - migration and boundary test strategy.

Dependencies:
* Step 3.2 completion.

### Step 3.4: Validate phase changes

Run schema, repository, and integration validation.

Validation commands:
* npm run test:server - migration parity and chunk data flow tests.
* npm run lint:server - repository and schema type compliance.
* npm run build:server - server build with new schema contracts.

## Implementation Phase 4: Zoom-tier aggregation and rollout controls

<!-- parallelizable: false -->

### Step 4.1: Add zoom-tier policy and aggregate payload mode for far zoom levels

Introduce zoom thresholds that switch from fine-grained tile chunk updates to aggregated payload mode at far zoom levels.

Files:
* apps/client/src/render/MosaicScene.tsx - Emit zoom-tier changes and consume aggregate mode hints.
* apps/client/src/App.tsx - Select subscription mode based on zoom tier policy.
* apps/server/src/contracts.ts - Add aggregate payload mode contract fields.
* apps/server/src/index.ts - Serve aggregate payload mode responses when requested.

Discrepancy references:
* Addresses DD-01 in Planning Log: selected hybrid approach extends fixed-grid baseline with aggregation for scalability.

Success criteria:
* Zoom-tier transitions are deterministic and debounced.
* Far zoom tiers reduce payload volume compared to fine mode.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 163-168, 249-253) - hybrid selected approach.

Dependencies:
* Phase 3 completion.

### Step 4.2: Add feature flags and canary session controls for chunking rollout

Gate chunk protocol and aggregation by feature flags to allow controlled rollout and rollback.

Files:
* apps/server/src/index.ts - Apply feature flag checks around chunk handlers.
* apps/client/src/network/useSocketConnection.ts - Gate chunk subscription behavior by server capabilities and flags.
* apps/server/README.md - Document flag usage and rollout operations.

Success criteria:
* Chunk protocol can be enabled per deployment or per session for canary cohorts.
* Rollback to legacy bounded events is possible without data migration rollback.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 245-253, 319-320) - staged rollout guidance.

Dependencies:
* Step 4.1 completion.

### Step 4.3: Add telemetry for subscription churn, payload size, and resync frequency

Instrument server and client metrics to monitor chunk churn and synchronization health.

Files:
* apps/server/src/index.ts - Emit counters for subscribe and unsubscribe rates, resync triggers, and snapshot payload sizes.
* apps/client/src/App.tsx - Emit client-side diagnostics for chunk set thrash and tier transitions.
* docs/decisions/2026-07-15-deployment-architecture-v01.md - Optional follow-up notes for observability alignment if updated in implementation scope.

Success criteria:
* Metrics expose churn and payload indicators at canary scale.
* Resync-required events can be traced with chunk and revision context.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 255-263) - performance and telemetry test targets.

Dependencies:
* Step 4.1 completion.

### Step 4.4: Add multi-replica readiness contract and failure-mode validation

Define and implement a bounded multi-replica readiness slice by introducing chunk membership coordination contract semantics and explicit failure-mode tests that preserve correctness when events originate from different replicas.

Files:
* apps/server/src/contracts.ts - Add adapter-agnostic membership coordination metadata and resync semantics required for multi-replica operation.
* apps/server/src/index.ts - Ensure chunk fanout and resync logic use replica-safe identifiers and do not assume process-local-only membership truth.
* apps/server/src/index.integration.test.ts - Add deterministic failure-mode tests for duplicate join, delayed leave, and cross-replica resync triggers.

Success criteria:
* Multi-replica coordination contract is represented in event payloads and server state transitions.
* Failure-mode tests cover duplicate membership and delayed disconnect ordering scenarios.
* Existing single-replica behavior remains unchanged.

Context references:
* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Lines 219-224, 229-233) - eventual multi-replica requirement and ordering constraints.

Dependencies:
* Step 4.2 completion.
* Step 4.3 completion.

### Step 4.5: Validate phase changes

Run performance-oriented and resilience-focused checks.

Validation commands:
* npm run test:server - chunk protocol and telemetry guard coverage.
* npm run test:client - zoom tier and subscription churn behavior tests.
* npm run build:client - verify client compilation under flagged modes.

Pre-canary gates:
* Chunk subscription churn gate: p95 subscribe and unsubscribe bursts remain within configured soft subscription budget during representative pan traces.
* Payload gate: aggregate zoom-tier payload p95 is lower than fine-grained payload p95 for far zoom scenarios.
* Resync gate: `chunk_resync_required` rate remains below 0.5% of chunk delta events in canary sessions.

## Implementation Phase 5: Final validation

<!-- parallelizable: false -->

### Step 5.1: Run full project validation

Execute complete project validation suite:
* npm run lint:client
* npm run lint:server
* npm run test:client
* npm run test:server
* npm run build:client
* npm run build:server

Pre-GA gates:
* Query-plan gate: chunk snapshot lookups use the `(canvas_id, chunk_x, chunk_y, created_at)` index in explain plans for representative canary datasets.
* Throughput gate: server-side chunk snapshot latency p95 and chunk delta fanout latency p95 meet rollout SLO targets defined by the team.
* Stability gate: no unresolved chunk-edge parity test failures and no unresolved multi-replica readiness failure-mode regressions.

### Step 5.2: Fix minor validation issues

Apply straightforward fixes for lint, type, and deterministic test failures directly related to this implementation.

### Step 5.3: Report blocking issues

Document non-trivial blockers, impacted files, and additional research needed when failures exceed minor-fix scope.

## Dependencies

* Workspace lint, test, and build scripts.
* Drizzle migration tooling and PostgreSQL runtime.
* Socket.IO room semantics and session replay contracts.

## Success Criteria

* All phases complete with bounded and chunked modes coexisting safely behind feature flags.
* Final validation passes with no critical regressions in placement, camera navigation, synchronization, or persistence.

## Implementation Phase 6: Post-review correctness and rollout confidence rework

<!-- parallelizable: false -->

### Step 6.1: Fix aggregate chunk snapshot merge semantics in client state reconciliation

Ensure the client does not clear fine-grained visible tiles when receiving aggregate payload snapshots for subscribed chunks.

Files:
* apps/client/src/App.tsx - Update chunk snapshot merge logic to be payload-mode aware and preserve mode-coherent behavior.

Success criteria:
* Aggregate snapshots no longer clear existing visible fine tiles unexpectedly.
* Fine snapshots continue to replace stale tiles for incoming chunks deterministically.
* Chunk resync requests remain mode-coherent and avoid stale-mode regressions.

Dependencies:
* Prior completion of chunk protocol phases.

### Step 6.2: Add direct App-level tests for aggregate and fine payload transitions and chunk resync behavior

Add deterministic tests that simulate payload mode transitions and verify the App layer emits coherent socket requests and state transitions.

Files:
* apps/client/src/App.test.tsx - Add tests for aggregate snapshot merge safety, fine payload replacement behavior, and chunk resync-triggered snapshot requests.

Success criteria:
* Tests fail before regressions are fixed and pass with corrected behavior.
* Coverage explicitly includes fine-to-aggregate and aggregate-to-fine behavior.

Dependencies:
* Step 6.1 completion.

### Step 6.3: Consolidate chunk-size runtime configuration across client and server runtime paths

Reduce runtime drift risk by centralizing chunk-size configuration used by client mapping and server repository/runtime chunk derivation.

Files:
* apps/server/src/contracts.ts - Add additive shared runtime constant export for chunk size.
* apps/client/src/App.tsx - Consume shared runtime chunk-size source.
* apps/server/src/index.ts - Consume shared runtime chunk-size source.
* apps/server/src/db/repository.ts - Consume shared runtime chunk-size source.

Success criteria:
* Runtime chunk-size constant is defined once and consumed consistently in client and server runtime code paths.
* Existing behavior remains unchanged with the same default chunk size.

Dependencies:
* None.

### Step 6.4: Gate client chunk streaming until server capabilities are known

Avoid initial default-enabled chunk subscriptions until capabilities are explicitly known from server snapshot.

Files:
* apps/client/src/App.tsx - Update chunk streaming enablement argument and subscription effect gating.
* apps/client/src/network/useSocketConnection.test.ts - Add or update assertions for capability-gated chunk subscription wiring where needed.

Success criteria:
* Client does not subscribe chunk events before realtime capabilities are available.
* Chunk subscriptions begin once capability indicates chunk streaming is enabled.

Dependencies:
* Step 6.1 completion.

### Step 6.5: Align server README CORS default documentation with runtime behavior

Update server environment variable documentation to match the actual runtime fallback for CORS origin.

Files:
* apps/server/README.md - Correct CORS default description.

Success criteria:
* README CORS default matches runtime value in server initialization.

Dependencies:
* None.

### Step 6.6: Validate rework changes

Run full validation to ensure rework correctness and no regressions.

Validation commands:
* npm run lint:client
* npm run lint:server
* npm run test:client
* npm run test:server
* npm run build:client
* npm run build:server
