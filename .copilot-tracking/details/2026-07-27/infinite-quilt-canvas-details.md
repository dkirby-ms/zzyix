<!-- markdownlint-disable-file -->
# Implementation Details: Infinite Quilt Canvas

## Context Reference

Sources: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`, `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md`, and GitHub issue 53.

## Implementation Phase 1: Product and Security Contract

<!-- parallelizable: false -->

### Step 1.1: Record immutable topology and migration decisions

Create an ADR that fixes the initial quilt topology contract: tenancy model; whether patches are user-visible regions; both wrapped axes; quilt rows, columns, patch width, and patch height; immutable dimensions after content exists; unwrapped navigation with canonical persistence; and bounded legacy canvases until explicit opt-in or deterministic packing. Define far-zoom repetition, seam cues, minimap behavior, canonical links, quilt-global or patch-local grid origin, presence and roster scope, and undo or copy/paste behavior across eviction and ownership boundaries. Record measurable database, protocol, recovery, cache, scene, and frame-time budget categories without inventing thresholds.

Files:
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Topology, migration, rollout, and budget decisions

Discrepancy references:
* `DR-01` - Production thresholds remain deferred pending measurement

Success criteria:
* The ADR defines canonical half-open coordinate ranges and both wrapped axes
* The ADR prohibits silently reinterpreting a legacy bounded canvas as a 1-by-1 torus
* The ADR resolves tenancy, patch visibility, far zoom, seam presentation, minimap, links, grid, presence, roster, undo, and copy/paste behavior
* Every unresolved capacity threshold has an owner, measurement method, and rollout gate

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 76-101) - Selected topology and coordinate invariants
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 296-304) - Legacy migration and recovery guidance
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 365-378) - Required product decisions

Dependencies:
* Product approval for the complete Stage 0 behavior contract and migration policy

### Step 1.2: Define principal, patch, and boundary authorization policy

Extend the ADR with stable principal requirements, patch roles and lifecycle, visibility rules, and the atomic rule that every patch intersected by a tile footprint must authorize the mutation. Do not map ownership to `clientId`, `placedBy`, or existing participation.

Files:
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Identity, ACL, moderation, and cross-patch transaction policy

Discrepancy references:
* `DR-02` - Concrete identity provider remains a release gate

Success criteria:
* The ADR defines owner/member/moderator capabilities and claim, transfer, suspension, and deletion behavior
* Fine data, aggregates, presence, search, and durable events share one visibility matrix
* Cross-patch mutations are all-or-nothing

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 56-60) - Existing identity limitations
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 177-193) - Authorization and transaction flow

Dependencies:
* Step 1.1
* Identity-provider selection before Phase 3 persistence enforcement

## Implementation Phase 2: Shared Topology Domain

<!-- parallelizable: false -->

### Step 2.1: Implement canonical topology primitives

Create one framework-independent server-owned shared module for positive modulo, canonical point resolution, nearest-image deltas, wrapped viewport decomposition, periodic image enumeration, and canonical subscription deduplication. Validate finite inputs, positive dimensions, exact seams, negative values, and multi-period inputs. Export cross-wire topology types from contracts only when protocol data needs them.

Files:
* `apps/server/src/domain/quiltTopology.ts` - Shared topology resolver
* `apps/server/src/domain/quiltTopology.test.ts` - Table and property-style invariant tests
* `apps/server/src/contracts.ts` - Quilt topology and canonical address types

Discrepancy references:
* `DD-01` - Use the existing server-source sharing boundary before introducing a third workspace package

Success criteria:
* Every point resolves to one patch and patch-local coordinate in half-open ranges
* Wrapped viewports decompose into no more than four canonical rectangles
* Aliases and duplicate rooms resolve to one canonical identity

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 82-141) - Resolver invariants and example
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` (Lines 83-100) - Shared module anchor

Dependencies:
* Step 1.1 topology decisions

### Step 2.2: Route client viewport math through the resolver

Replace scattered wrapped arithmetic with calls into the shared resolver while preserving signed unwrapped camera coordinates. Keep existing chunk budgets and unbounded behavior behind explicit topology modes during rollout.

Files:
* `apps/client/src/domain/math2d.ts` - Wrapped viewport and chunk enumeration integration
* `apps/client/src/domain/math2d.test.ts` - One-axis, corner, seam, and deduplication tests

Success criteria:
* Negative and multi-lap camera positions produce deterministic canonical subscriptions
* A corner-straddling viewport subscribes once per canonical chunk
* Existing bounded and unbounded tests remain green

Context references:
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` (Lines 35-38) - Existing viewport ownership

Dependencies:
* Step 2.1

### Step 2.3: Validate topology phase

Validation commands:
* `npm run test:server -- src/domain/quiltTopology.test.ts` - Shared resolver invariants
* `npm run test:client -- src/domain/math2d.test.ts` - Client viewport integration
* `npm run lint:client` - Client static validation
* `npm run lint:server` - Server static validation
* `npm run build:client` - Cross-workspace import validation
* `npm run build:server` - Server type and build validation

## Implementation Phase 3: Additive Persistence and Identity Expansion

<!-- parallelizable: false -->

### Step 3.1: Add quilt, patch, membership, history, and spatial schema

Extend Drizzle schema and types with quilts, canonical patches, stable principals or mapped external principals, patch memberships, patch operations, patch snapshots, and tile spatial references. Preserve one authoritative tile row and make spatial references derived query metadata. Add patch-leading indexes and uniqueness constraints that enforce canonical addresses.

Files:
* `apps/server/src/db/schema.ts` - Additive domain tables, relations, indexes, and constraints
* `apps/server/src/db/types.ts` - Persistence types
* `apps/server/migrations/0005_finite_toroidal_quilt.sql` - Additive migration and Socket.IO attachment table
* `apps/server/migrations/meta/_journal.json` - Migration journal
* `apps/server/migrations/meta/0005_snapshot.json` - Reviewed schema snapshot if generated consistently

Discrepancy references:
* `DR-03` - Existing Drizzle snapshot metadata gap requires manual migration review

Success criteria:
* A tile has one stable ID and can be discovered from each intersected patch and chunk
* The migration is additive and backward compatible before constraints are tightened
* `socket_io_attachments` is provisioned for adapter payloads over 8 KB

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 154-175) - Persistence model and spatial-reference rules
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` (Lines 102-130) - Migration anchors and metadata risk

Dependencies:
* Phase 1 authorization model
* Phase 2 canonical address types
* Disposable PostgreSQL database for migration validation

### Step 3.2: Implement idempotent backfill and parity verification

Create an explicit backfill that maps legacy canvases to non-toroidal compatibility records or the approved packing target, preserves tile IDs and transforms, leaves ownership unclaimed or system-owned per policy, computes spatial references, and can resume safely. Add parity checks before enforcing non-null constraints.

Files:
* `apps/server/src/db/quiltBackfill.ts` - Idempotent resumable backfill
* `apps/server/src/db/quiltBackfill.test.ts` - Preservation, restart, and parity tests
* `apps/server/src/db/repository.ts` - Dual-read or parity query support
* `apps/server/src/db/repository.test.ts` - Spatial reference helper coverage
* `apps/server/package.json` - Dedicated backfill command if needed
* `package.json` - Root command forwarding if needed

Success criteria:
* Re-running the backfill creates no duplicate quilts, patches, memberships, or spatial references
* Tile IDs, transforms, materials, colors, authorship, and layout remain unchanged
* No legacy participant is inferred to be an owner

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 296-304) - Migration guidance

Dependencies:
* Step 3.1
* Approved legacy migration policy from Phase 1

### Step 3.3: Separate production migration execution from server startup

Define a single deployment migration job or release step so rolling application replicas do not race schema changes. Keep startup schema verification, but remove production migration ownership from every server process after the deployment path exists.

Files:
* `apps/server/src/db/migrate.ts` - Migration invocation contract
* `apps/server/src/index.ts` - Startup verification behavior
* Deployment workflow or configuration identified during implementation - One-shot migration execution

Discrepancy references:
* `DR-04` - Current repository lacks application Container Apps deployment definitions, so the final deployment file cannot yet be named

Success criteria:
* Exactly one production job owns migration application per release
* Application replicas fail clearly on incompatible schema and do not race DDL

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 250-258) - Additive migration and one-job execution sequence

Dependencies:
* Step 3.1
* Deployment owner identification

### Step 3.4: Validate persistence phase

Validation commands:
* `npm run build:server` - Schema and repository type validation
* `npm run db:apply` - Apply migration to a disposable local database only
* `npm run test:server -- src/db/quiltBackfill.test.ts src/db/repository.test.ts` - Backfill and spatial parity

## Implementation Phase 4: Patch-Scoped Correctness and Recovery

<!-- parallelizable: false -->

### Step 4.1: Move placement correctness inside one patch-scoped transaction

Canonicalize the anchor server-side, derive the full geometry footprint and collision halo, acquire affected patch locks in stable sorted order, read nearby authoritative tiles inside the transaction, enforce every intersected patch permission and expected revision, validate placement, then persist the tile, spatial references, and linked patch operations atomically. Publish only after commit.

Files:
* `apps/server/src/db/repository.ts` - Transaction orchestration, sorted locks, in-transaction reads, writes, and idempotency
* `apps/server/src/index.ts` - Thin authenticated request handling and post-commit publication
* `apps/server/src/domain/placementSolver.ts` - Periodic neighbor inputs without duplicated topology math
* `apps/server/src/domain/placementSolver.port.test.ts` - Seam parity against client geometry behavior

Success criteria:
* Concurrent conflicting seam placements produce exactly one winner
* Reversed patch order does not deadlock
* Distant patch writes proceed concurrently
* Unauthorized or stale writes persist no partial state

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 177-193) - Required transaction flow
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` (Lines 42-45) - Current pre-lock validation race

Dependencies:
* Phase 3 schema and backfill
* Stable principal integration selected in Phase 1

### Step 4.2: Add real PostgreSQL concurrency coverage

Use separate database connections and real concurrent transactions to test seam conflicts, sorted lock acquisition, idempotent retries, and distant writes. Keep pure helper tests, but do not claim in-memory sequential tests prove database behavior.

Files:
* `apps/server/src/db/repository.postgres.integration.test.ts` - Concurrent transaction integration suite
* `apps/server/src/index.concurrency.test.ts` - Pure deterministic lock-set tests only

Success criteria:
* Tests fail when validation is moved before locking or lock order is unstable
* Retry by operation ID creates one tile, spatial-reference set, operation set, and event

Context references:
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` (Lines 59-63) - Existing concurrency test limitation

Dependencies:
* Step 4.1
* Disposable PostgreSQL database with at least two connections

### Step 4.3: Establish reconstructable recovery and retention

Select and encode one recovery invariant. Prefer authoritative tile rows as current state and patch operations as audit and delivery history; otherwise guarantee a retained patch baseline no newer than the earliest retained operation. Never allow independent age cutoffs to erase the only reconstructable baseline.

Files:
* `apps/server/src/db/repository.ts` - Patch reconstruction and pruning queries
* `apps/server/src/db/snapshots.ts` - Patch snapshot creation
* `apps/server/src/jobs/retention.ts` - Safe retention orchestration
* `apps/server/src/jobs/retention.test.ts` - Retention invariant tests
* `apps/server/src/db/recovery.postgres.integration.test.ts` - Reconstruction at supported retention ages

Success criteria:
* Reconstruction equals authoritative tile state at every supported retention age
* Quiet patches do not reconstruct as empty after snapshot pruning

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 68-73) - Existing recovery defect

Dependencies:
* Phase 3 patch history schema

### Step 4.4: Validate correctness phase

Validation commands:
* `npm run test:server -- src/db/repository.postgres.integration.test.ts` - Locking and concurrency
* `npm run test:server -- src/db/recovery.postgres.integration.test.ts src/jobs/retention.test.ts` - Recovery invariant
* `npm run lint:server` - Static validation
* `npm run build:server` - Server build

## Implementation Phase 5: Protocol V2 Area-of-Interest Delivery

<!-- parallelizable: false -->

### Step 5.1: Define authenticated quilt protocol and bounded room resolution

Add protocol-v2 handshake data, quilt and patch cursors, authorized fine and aggregate subscriptions, and acknowledgement results for accepted, forbidden, invalid, and budget-exceeded rooms. Canonicalize and deduplicate room IDs server-side. Cap rooms per connection, chunks per request, churn, snapshot tile count, and payload bytes using measured or conservatively canaried configuration.

Files:
* `apps/server/src/contracts.ts` - Protocol-v2 request, acknowledgement, cursor, and event contracts
* `apps/server/src/realtime/quiltRooms.ts` - Canonical room resolution, authorization, and limits
* `apps/server/src/realtime/quiltRooms.test.ts` - Resolution, privacy, and budget tests
* `apps/server/src/index.ts` - Handshake, subscription, recovery, and scoped publication
* `apps/server/src/index.integration.test.ts` - Protocol integration and no-duplicate-delivery tests

Success criteria:
* Unauthorized fine, aggregate, presence, and event subscriptions fail consistently
* One protocol-v2 mutation produces one durable scoped event stream
* Invalid or excessive requests return explicit per-room outcomes

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 195-218) - Protocol-v2 requirements

Dependencies:
* Phase 4 transaction and recovery correctness
* Phase 1 visibility matrix

### Step 5.2: Integrate patch cursors and reconnect recovery on the client

Negotiate protocol version, send canonical area-of-interest subscriptions, reconcile accepted cursors, and recover from persisted event IDs or scoped snapshots without a whole-quilt snapshot. Keep protocol v1 behind an explicit compatibility gate during rollout.

Files:
* `apps/client/src/network/useSocketConnection.ts` - Protocol negotiation and event wiring
* `apps/client/src/network/useSocketConnection.test.ts` - Registration, cleanup, and recovery tests
* `apps/client/src/App.tsx` - Subscription acknowledgement and cursor reconciliation
* `apps/client/src/App.test.tsx` - Scoped snapshot, resync, and duplicate suppression tests
* `apps/server/README.md` - Protocol flags, limits, and recovery operations

Success criteria:
* Failed automatic Socket.IO recovery converges through application cursors
* A v2 client does not consume duplicate v1 session-wide mutations

Context references:
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` (Lines 167-195) - Protocol anchors

Dependencies:
* Step 5.1

### Step 5.3: Add two-replica recovery harness

Run two server processes against PostgreSQL and the adapter, reconnect a seam-straddling client through another replica, and prove cursor convergence, room authorization, attachment handling, and duplicate-free durable events.

Files:
* `playwright.multi-replica.config.ts` - Dedicated multi-server harness
* `e2e/quilt-reconnect.spec.ts` - Cross-replica recovery scenarios

Discrepancy references:
* `DR-05` - Existing Playwright configuration starts one server only

Success criteria:
* Reconnect through another replica converges without a whole-quilt snapshot
* Adapter payloads above 8 KB succeed through the attachment table

Context references:
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-plan-anchor-research.md` (Lines 68-71) - Single-server harness limitation

Dependencies:
* Steps 5.1 and 5.2
* PostgreSQL-backed Socket.IO adapter

### Step 5.4: Validate protocol phase

Validation commands:
* `npm run test:server -- src/realtime/quiltRooms.test.ts src/index.integration.test.ts` - Server protocol behavior
* `npm run test:client -- src/network/useSocketConnection.test.ts src/App.test.tsx` - Client protocol behavior
* `npx playwright test --config=playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts --reporter=line` - Cross-replica recovery

## Implementation Phase 6: Client Virtualization and Seam Rendering

<!-- parallelizable: false -->

### Step 6.1: Replace flat retained state with a bounded quilt cache

Store canonical patch and chunk snapshots, cursors, optimistic operations, explicit undo metadata, and active selections in keyed state. Evict data and render objects outside the prefetch margin while pinning active optimistic, undo, and selected entities. Deduplicate aliases by stable tile ID.

Files:
* `apps/client/src/domain/quiltCache.ts` - Cache state, merge, pin, and eviction rules
* `apps/client/src/domain/quiltCache.test.ts` - Bounded traversal and pinning tests
* `apps/client/src/App.tsx` - Quilt identity, cache orchestration, and eviction
* `apps/client/src/App.test.tsx` - Scoped reconciliation and bounded state tests

Success criteria:
* Long traversal keeps retained tiles, chunks, cursors, and optimistic metadata within configured budgets
* Unsubscribe evicts eligible state without losing pending or undoable operations

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 36-44) - Current incomplete virtualization

Dependencies:
* Phase 5 scoped recovery protocol

### Step 6.2: Render camera-relative periodic images with canonical identity

Keep one React Three Fiber scene and an unwrapped logical camera. Rebase render coordinates near the camera, enumerate visible periodic images, and assign display keys that map to one canonical tile ID. Replace total-world interaction planes with camera-local planes.

Files:
* `apps/client/src/render/periodicImages.ts` - Visible image and display-key resolver
* `apps/client/src/render/periodicImages.test.ts` - Edge, corner, and multi-lap image tests
* `apps/client/src/render/MosaicScene.tsx` - Camera-relative aliases and local interaction plane
* `apps/client/src/render/MosaicScene.test.tsx` - Pointer, selection, and alias identity tests
* `apps/client/src/render/GridOverlay.tsx` - Seam-continuous grid rendering

Success criteria:
* Edge and corner crossings are continuous without a camera jump
* Multiple display aliases select, remove, highlight, and link to one tile
* Repeated laps do not degrade precision or grid alignment

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 143-152) - Camera-local client flow and interaction behavior

Dependencies:
* Steps 2.1 and 6.1

### Step 6.3: Make interactions and geometry seam-equivalent

Convert display hits to unwrapped space, canonicalize once, gather target-patch and wrapped-neighbor geometry, translate nearest images, and reuse Euclidean SAT, snapping, adjacency, grid, presence, and selection logic. Require all intersected patch permissions before mutation.

Files:
* `apps/client/src/interaction/controller.ts` - Canonical hit and mutation routing
* `apps/client/src/interaction/controller.test.ts` - Alias and seam interaction tests
* `apps/client/src/domain/placementSolver.ts` - Wrapped neighbor geometry inputs
* `apps/client/src/domain/placementSolver.test.ts` - Seam collision and adjacency parity
* `apps/client/src/domain/gridPatterns.ts` - Canonical grid origin rules
* `apps/client/src/domain/gridPatterns.test.ts` - Seam pattern continuity
* `apps/client/src/domain/gridPlacement.ts` - Canonical snapping
* `apps/client/src/domain/gridPlacement.test.ts` - Seam snapping parity

Success criteria:
* Collision, adjacency, snapping, picking, presence, and selection match interior behavior at every seam
* One canonical mutation is emitted regardless of which alias receives the pointer hit

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 93-99) - Seam-equivalence invariants

Dependencies:
* Step 6.2
* Phase 4 server-side enforcement

### Step 6.4: Add seam and long-traversal E2E coverage

Exercise one-axis seams, four-corner views, collaborative placement and removal through aliases, multiple laps, reconnect, cache eviction, and stable grid alignment. Collect state count, scene count, draw-call, snapshot-byte, and frame-time measurements for canary budgets.

Files:
* `e2e/quilt-seams.spec.ts` - Seam, alias, and traversal scenarios
* `e2e/multi-user-fixtures.spec.ts` - Collaborative seam behavior

Discrepancy references:
* `DR-01` - Measurements inform final production thresholds

Success criteria:
* All topology, interaction, authorization, and bounded-state acceptance scenarios pass
* Measurements are captured for canary gates rather than replaced with guessed limits

Dependencies:
* Steps 6.1 through 6.3

### Step 6.5: Validate client phase

Validation commands:
* `npm run test:client -- src/domain/quiltCache.test.ts src/render/periodicImages.test.ts src/render/MosaicScene.test.tsx` - Cache and render behavior
* `npm run test:client -- src/interaction/controller.test.ts src/domain/placementSolver.test.ts src/domain/gridPatterns.test.ts src/domain/gridPlacement.test.ts` - Seam interactions
* `npx playwright test e2e/quilt-seams.spec.ts --reporter=line` - User behavior
* `npm run lint:client` - Static validation
* `npm run build:client` - Client build

## Implementation Phase 7: Migration Canary and Legacy Retirement

<!-- parallelizable: false -->

### Step 7.1: Add dual-read parity and canary telemetry

Compare legacy and patch-scoped reads during migration. Emit metrics for parity failures, lock waits, mutation latency, snapshot bytes, resyncs, room churn, attachment use, pool wait, client cache and scene counts, draw calls, and frame time. Gate rollout by quilt and principal cohort.

Files:
* `apps/server/src/db/quiltParity.ts` - Legacy versus patch comparison
* `apps/server/src/db/quiltParity.test.ts` - Parity fixtures and mismatch reporting
* `apps/server/src/db/repository.ts` - Dual-read and metrics hooks
* `apps/server/src/index.ts` - Feature gates and canary selection
* `apps/client/src/App.tsx` - Client capability and fallback gates
* Deployment configuration - Flags, metrics, and rollout values

Success criteria:
* Every migrated canvas size passes read and layout parity
* Rollout can stop or roll back without dropping legacy data
* Canary thresholds use measured evidence

Context references:
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` (Lines 286-293) - Migration canary and monitored signals

Dependencies:
* Phases 3 through 6

### Step 7.2: Rehearse migration and document operations

Run migration, backfill, parity, rollback, and recovery against representative production-like data. Document operator commands and failure handling.

Files:
* `scripts/verify-quilt-migration.sh` - Repeatable disposable-environment rehearsal
* `apps/server/README.md` - Migration, rollback, and recovery runbook
* `README.md` - User-facing topology and compatibility summary

Success criteria:
* Rehearsal preserves IDs, transforms, layout, and authorship
* Backfill restart and rollback procedures are verified
* No script can target a non-loopback database without explicit production controls

Dependencies:
* Step 7.1

### Step 7.3: Retire legacy protocol and storage after exit gates

After parity, recovery, multi-replica, authorization, and client-budget gates pass for the approved window, stop v1 session-wide mutation fanout, remove whole-canvas recovery dependencies, and schedule a separate contract migration for obsolete columns. Keep tile identity stable.

Files:
* `apps/server/src/index.ts` - Remove v1 durable fanout compatibility path
* `apps/client/src/App.tsx` - Remove v1 fallback after server retirement
* `apps/server/src/db/repository.ts` - Remove legacy read path
* A later reviewed migration - Remove obsolete columns and constraints

Success criteria:
* Protocol-v2 clients receive only scoped durable streams
* Recovery and undo no longer require whole-canvas retained state
* Legacy columns are removed only after rollback no longer depends on them

Dependencies:
* Steps 7.1 and 7.2
* Approved canary exit window

## Implementation Phase 8: Final Validation

<!-- parallelizable: false -->

### Step 8.1: Run full project validation

Execute all repository gates:
* `npm run lint`
* `npm run build`
* `npm run test`
* `npm run test:e2e:ci`
* `npx playwright test --config=playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts --reporter=line`
* `scripts/verify-quilt-migration.sh` against a disposable loopback PostgreSQL database

The migration verification script must apply the complete migration sequence, run the idempotent backfill twice, verify legacy-to-patch parity, exercise rollback while legacy compatibility remains supported, and run retention-age reconstruction checks. Treat any identity, transform, layout, authorship, ownership, spatial-reference, or reconstruction mismatch as a release blocker.

### Step 8.2: Fix minor validation issues

Correct isolated lint, type, migration, and test issues. Re-run the narrow failing command before repeating the full gate.

### Step 8.3: Report blocking issues

Document failures that require architecture changes, new production measurements, identity-policy changes, or migration redesign. Create follow-on research and planning instead of expanding implementation scope during validation.

## Dependencies

* Node.js and npm versions supported by the repository
* Docker Compose PostgreSQL service on loopback for database integration and E2E tests
* Stable principal provider and approved patch ACL matrix before authorization enforcement
* Disposable database for migration and backfill validation
* Two-server test harness for adapter and recovery validation

## Success Criteria

* Opposite edges wrap continuously on both axes while canonical state remains finite
* Patch ownership is independent from chunks and is enforced for every intersected patch
* Transactions serialize conflicting seam writes without serializing distant patches
* Recovery remains reconstructable across every supported retention age
* Protocol-v2 subscriptions are scoped, authorized, bounded, acknowledged, and recoverable
* Client state and scene objects remain bounded during long traversal
* Legacy content migrates without changed IDs, transforms, layout, authorship, or invented owners
* All repository and multi-replica validation gates pass
