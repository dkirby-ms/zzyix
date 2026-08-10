---
title: Alexander Mosaic App Integration Research
description: Research on app, server, and agent-worker surfaces for autonomous historical mosaic recreation
author: GitHub Copilot
ms.date: 2026-08-09
ms.topic: reference
---

## Research Topics

* Existing client representation, rendering, editing, and generation of mosaics or quilt cells
* Server persistence and serving surfaces for quilt or mosaic data
* Agent-worker capabilities that could drive autonomous mosaic recreation
* Alexander generated data wiring into app runtime, server, or worker
* Remaining work for product behavior, runtime integration, and validation

## Status

Complete for repository-local research. No implementation files were modified.

## Findings

### Client Mosaic Representation And Rendering

The client already has a complete interactive mosaic/quilt editing surface, but it
does not have an Alexander-specific importer or autonomous generation UI.

* The canonical tile model is `TileInstance`, with stable ID, shape, color, material,
	transform, creation time, and optional `placedBy`. It is defined in
	apps/client/src/domain/placementSolver.ts and mirrors the server contract in
	apps/server/src/contracts.ts.
* Supported tile shapes are fixed in apps/client/src/domain/tileGeometry.ts and
	apps/server/src/contracts.ts: square, triangle, rectangle, l-shape, large-square,
	circle, right-triangle, and large-right-triangle. Materials are ceramic, glass, and
	stone.
* Rendering is handled by apps/client/src/render/MosaicScene.tsx through React Three
	Fiber. Each `TileInstance` becomes an extruded Three.js mesh, using the tile outline
	from `getTileDefinition`, craft materials from apps/client/src/render/materials.ts,
	and optional remote ownership outlines.
* Toroidal display is visual, not duplicated storage. MosaicScene uses periodic-image
	helpers from apps/client/src/render/periodicImages.ts so wrapped views show translated
	images of canonical tiles.
* Editing is ghost-driven. apps/client/src/interaction/controller.ts computes active
	tile state, ghost state, optimistic placement results, and sequenced reconciliation.
	apps/client/src/domain/placementSolver.ts validates candidate geometry with bounds
	checks and SAT collision detection against settled tiles.
* Grid-assisted placement exists through apps/client/src/domain/gridPatterns.ts,
	apps/client/src/domain/gridPlacement.ts, apps/client/src/render/GridOverlay.tsx, and
	apps/client/src/ui/GridOverlayControls.tsx. Current grid patterns are general-purpose
	lattice/tessellation helpers, not historical-mosaic layout generators.
* Canonical quilt mode is the normal runtime path. apps/client/src/App.tsx discovers
	the canonical quilt via `discoverCanonicalWorld`, loads occupancy with
	`fetchQuiltOccupancy`, subscribes visible chunks with `subscribe_quilt_area`, stores
	fine snapshots/events in `quiltCache`, and renders `selectQuiltTiles(quiltCache)`.
* Local placement routes through the same Socket.IO mutation path the server owns.
	`placeFromState` in apps/client/src/App.tsx generates a server-format tile ID,
	computes affected cached patch IDs and expected patch revisions, stages an optimistic
	tile, emits `quilt_place_tile`, then reconciles accepted or rejected ACKs.
* Undo is implemented for the local user's last accepted server tile. It emits
	`quilt_remove_tile` with expected patch revisions and reconciles accepted patch
	revisions back into `quiltCache`.
* The E2E-only canvas API in apps/client/src/test/canvasTestApi.ts exposes
	`setActiveTile`, `movePointer`, `setCameraPan`, `setGridEnabled`, `placeTileAt`, and
	`placeTileAtWithAck`. This is useful for validation or test harnesses, but it is not
	a production importer and it still depends on the interactive active-tile path.
* Client tests cover geometry, placement, grid patterns, quilt cache, periodic images,
	render behavior, and E2E collaborative placement. Relevant files include
	apps/client/src/interaction/controller.test.ts, apps/client/src/domain/placementSolver.test.ts,
	apps/client/src/domain/gridPlacement.test.ts, apps/client/src/domain/quiltCache.test.ts,
	apps/client/src/render/MosaicScene.test.tsx, e2e/multi-user-fixtures.spec.ts, and
	e2e/quilt-seams.spec.ts.

### Server Persistence And Delivery

The server already persists and serves canonical quilt data through a patch-scoped
PostgreSQL model and Socket.IO delivery protocol. There is no Alexander-specific schema,
route, or import endpoint.

* The canonical storage model is documented in docs/canonical-quilt-data-storage.md:
	`canonical_world` selects the active quilt, `quilts` define finite toroidal topology,
	`patches` divide the world into ownership and revision units, `tiles` store each tile
	once, `tile_spatial_refs` index each tile by intersected patch/chunk, and
	`patch_operations` plus `patch_snapshots` provide durable history and recovery.
* The Drizzle schema in apps/server/src/db/schema.ts implements those tables. The
	migrations that introduced key pieces are apps/server/migrations/0005_finite_toroidal_quilt.sql,
	apps/server/migrations/0007_canonical_world.sql, and later authorization and agent
	control migrations.
* Runtime discovery is exposed by `GET /quilts/canonical` in apps/server/src/index.ts.
	It issues a canonical attempt, discovers the active world, and ensures an assigned
	patch for the authenticated principal.
* Runtime summary is exposed by `GET /quilts/:quiltId/occupancy`, which calls
	`listQuiltOccupancy` and returns authorized aggregate chunk counts.
* Socket.IO initializes canonical clients by validating the discovery target,
	loading `loadQuiltDeliveryContext`, acquiring a presence lease, and emitting
	`quilt_protocol` with topology, limits, owner identity, and mutation availability.
* Fine and aggregate reads are driven by `subscribe_quilt_area`. The client computes
	visible chunk IDs, groups them by canonical patch, sends cursors, and receives
	`quilt_patch_state`, `quilt_patch_event`, or resync signals.
* Authoritative placement is `persistQuiltTilePlacement` in apps/server/src/db/repository.ts.
	It canonicalizes toroidal coordinates, derives intersected and collision-lock patches,
	requires the principal to be an active human owner of every intersected patch, checks
	expected patch revisions, validates collisions with server-side geometry, inserts one
	`tiles` row, inserts `tile_spatial_refs`, appends `patch_operations`, advances patch
	revisions, records authorization audit events, and stores an idempotency binding.
* Authoritative removal is `persistQuiltTileRemoval` in the same repository module.
	It locks scoped patch rows, checks authorization and revision preconditions, removes
	the tile and spatial refs, appends patch operations, and advances revisions.
* Server tests cover placement idempotency, seam collisions, patch ownership, occupancy
	authorization, schema behavior, recovery, canonical world initialization, and agent
	read routes. Relevant files include apps/server/src/db/repository.postgres.integration.test.ts,
	apps/server/src/db/quiltBackfill.test.ts, apps/server/src/db/quiltParity.test.ts,
	apps/server/src/db/recovery.postgres.integration.test.ts, apps/server/src/db/canonicalWorld.postgres.integration.test.ts,
	and apps/server/src/routes/agentReads.test.ts.

### Agent-Worker Autonomous Capabilities

The Python worker provides durable autonomous observation, not autonomous mosaic
construction. It can claim work, read authorized quilt context/events, checkpoint, and
produce observation-only proposals. It cannot currently place tiles.

* apps/agent-worker/README.md states that the worker is durable and read-only. It
	claims assigned quilt triggers, owns a lease, checkpoints progress, calls approved
	read tools, and reports completion or failure. It explicitly says the worker does not
	mutate canonical quilt state.
* apps/agent-worker/src/main.py builds the supervisor, PostgreSQL control plane, server
	token provider, read tools, governed gateway or fake gateway, and `GraphWorkflow`.
	Runtime requires `AGENT_CONTROL_PLANE_DSN`, `AGENT_PRINCIPAL_ID`, and
	`AGENT_SERVER_TOKEN_SCOPE`.
* apps/agent-worker/src/control_plane.py defines the control-plane protocol and
	Postgres implementation for trigger claiming, run start/resume, quilt leases,
	checkpoint load/save, completion, failure, and requeue. The in-memory version supports
	tests.
* apps/agent-worker/src/supervisor.py serializes one workflow run per claimed quilt
	trigger, renews leases, commits checkpoints, marks triggers completed or failed, and
	requeues on lease loss.
* apps/agent-worker/src/tools.py provides three fixed read tools:
	`get_quilt_context`, `get_patch_snapshot`, and `get_patch_events`. The tools call
	`/internal/v1/agent/...`, validate UUIDs and limits, redact payloads down to metadata,
	and enforce a 64 KB serialized response cap.
* apps/server/src/routes/agentReads.ts mounts the corresponding internal read API when
	`FEATURE_AGENT_READS_ENABLED=true`. It filters quilt context to patches assigned to
	the agent principal, enforces snapshot/event limits, and writes authorization audit
	events.
* apps/agent-worker/src/workflow.py has explicit graph nodes: `load_context`,
	`load_events`, and `draft_proposal`. If structured proposals are disabled, the worker
	skips the gateway and emits a feature-gated observation fallback. If enabled, the
	gateway output is still constrained to safe actions.
* apps/agent-worker/src/gateway.py allows only structured actions shaped like
	`{"type":"observe","target":"<quilt-id>"}`. Provider output is untrusted and
	validated; unsafe action types fail.
* apps/server/src/db/schema.ts and apps/server/migrations/0012_agent_control_plane.sql
	define `agent_control` tables for assignments, runs, leases, checkpoints, trigger
	queue, tool-call outcomes, model metadata, and lifecycle audit. Migration
	apps/server/migrations/0015_patch_scoped_agent_assignments.sql adds patch-scoped
	agent assignment.
* Worker tests cover checkpoint validation, control-plane lease and recovery behavior,
	tool redaction/limits, gateway safe-output rules, supervisor requeue/resume behavior,
	and workflow lease-loss behavior. Relevant files include apps/agent-worker/tests/test_checkpoints.py,
	apps/agent-worker/tests/test_control_plane_postgres.py, apps/agent-worker/tests/test_tools.py,
	apps/agent-worker/tests/test_gateway.py, apps/agent-worker/tests/test_supervisor.py, and
	apps/agent-worker/tests/test_workflow.py.
* docs/fantome-resident-agent-architecture.md confirms the intended boundary: the server
	remains authority for tile validation and any future mutation must pass through the
	same server contracts humans use. Deferred tools include direct tile placement,
	deletion, patch claiming, transfer, raw Socket.IO operations, database queries, raw
	HTTP, filesystem access, dynamic tool creation, and code execution.

### Alexander Data Wiring

Alexander-generated data exists, but it is not wired into the app runtime, server, or
agent-worker runtime.

* package.json includes source-provenance, preprocessing, and mosaic-input commands:
	`verify:alexander-source`, `preprocess:alexander-source`,
	`test:preprocess-alexander-source`, `generate:alexander-mosaic-inputs`, and
	`test:alexander-mosaic-inputs`.
* offline/reference/alexander-source-license-records.json records the Wikimedia Commons
	source, checksum, crop/resize contract, preprocessing metadata, expected generated
	artifacts, and validation targets.
* scripts/preprocess-alexander-source.mjs creates deterministic source artifacts:
	normalized master image, CIELAB float32 binary, luminance PNG, denoised preview,
	saliency mask, edge mask, and preprocessing config.
* scripts/generate-alexander-mosaic-inputs.mjs reads the preprocessing config and emits
	a 24-color LAB-derived palette plus ranked tile candidates. The current output config
	reports width 1077, height 1616, palette size 24, and candidate count 760.
* offline/output/alexander-mosaic-inputs/alexander-mosaic-palette.json contains color
	IDs, hex values, RGB, LAB values, weights, pixel counts, saliency means, and edge
	pixel counts.
* offline/output/alexander-mosaic-inputs/alexander-tile-candidates.json contains ranked
	candidate cells with image-space boxes, anchors, edge density, saliency, luminance,
	nearest palette IDs, palette hex values, and scores.
* scripts/generate-alexander-mosaic-inputs.test.mjs validates deterministic palette and
	candidate generation from synthetic preprocessing artifacts. It checks stable hashes,
	palette shape, candidate count/order, edge-bearing candidates, and palette references.
* Repository-wide text search found Alexander references only in offline scripts,
	generated offline outputs, provenance files, package scripts, and planning/review
	documents. There are no imports of `alexander-mosaic-inputs`, no client domain module
	such as `mosaicImport`, no server route or seed path for Alexander payloads, no
	worker tool or trigger type for Alexander generation, and no E2E test named for
	mosaic import.
* Existing reviews agree with this state. .copilot-tracking/reviews/2026-08-07/alexander-mosaic-patch-plan-review.md
	says the current implementation stops at preprocessing plus palette and ranked
	candidate JSON. .copilot-tracking/reviews/rpi/2026-08-07/alexander-mosaic-patch-plan-001-validation.md
	identifies missing patch manifests, supported tessera placements, client import,
	persistence/replay verification, fidelity scoring, and E2E coverage.

### Integration Points

The shortest integration path is to transform the offline Alexander outputs into
existing `TileInstance` or `QuiltPlaceTileRequest`-compatible placements and submit
them through the current patch-scoped mutation authority. The integration points are
clear, but several contracts must be added.

* Offline generator integration point: extend scripts/generate-alexander-mosaic-inputs.mjs
	or add a downstream generator that converts image-space candidates into supported
	tile placements. It must choose shape, material, color, world transform, ordering,
	conflict policy, and target patch coordinate mapping.
* Client domain integration point: add an import/preflight module near
	apps/client/src/domain/ that validates a versioned patch manifest against current
	tile shapes, materials, topology, patch bounds, revision availability, payload size,
	and deterministic ordering.
* Client runtime integration point: reuse apps/client/src/App.tsx mutation orchestration
	rather than creating a new protocol. A bounded importer can call the same patch-id,
	expected-revision, optimistic-cache, `quilt_place_tile`, ACK reconciliation, retry,
	and resync logic used by `placeFromState`.
* Server integration point: no new persistence model is required if imports use
	`quilt_place_tile`. The server already owns collision, revision, ownership,
	idempotency, spatial refs, patch operations, and replay. Any server-side bulk import
	alternative would need to preserve the same authorization and revision behavior.
* Worker integration point: a future autonomous worker would need new gated tools or
	commands. Today the worker can observe and propose only. To drive recreation, it
	would need either a safe mutation proposal activation path that submits through the
	server as an agent principal, or a server-managed import trigger that the worker can
	request without direct database writes.
* Test integration point: e2e/support/multiUser.ts and apps/client/src/test/canvasTestApi.ts
	already provide a pattern for programmatic placement and state inspection. These are
	good validation harnesses, but product runtime should not depend on E2E-only APIs.

### Remaining Work

Product behavior, runtime integration, and validation are still substantial.

* Define the user-facing product behavior for issue 155: who starts an autonomous
	recreation, whether it targets one owned patch or a curated canonical patch, whether
	it is preview-only or commits real tiles, how progress is shown, and how conflicts or
	partial completion are reported.
* Decide the actor and authority model. Current server placement accepts only active
	human owners in `persistQuiltTilePlacement`. Agent principals are explicitly read-only
	today, so autonomous committed placement needs a new policy decision and code path
	that remains server-authoritative.
* Convert Alexander candidates into patch-compatible tessera placements. The current
	candidates are image-space cells and colors, not app tile shapes/transforms or
	revision-safe mutation payloads.
* Add a versioned manifest and payload schema for generated mosaics. It should include
	source provenance hash, generator seed, target dimensions, coordinate mapping,
	supported shapes/materials, ordered placements, expected footprint, and fidelity
	metadata.
* Add client preflight validation and bounded queue execution. The importer needs to
	reject unsupported shapes/materials, out-of-bounds placement, missing cached patch
	revisions, excessive payloads, and non-deterministic ordering before it emits network
	mutations.
* Add retry and recovery semantics for stale patch revisions, collisions, disconnects,
	resyncs, and user cancellation. Existing single-placement logic handles ACKs, but a
	multi-tile import needs batch progress and deterministic stop/resume behavior.
* Add fidelity scoring and acceptance artifacts. Existing scripts produce palette and
	candidates but no machine-readable recognizability score, edge retention by final
	tessera placement, or visual acceptance comparison.
* Add server and E2E verification that imported tiles persist, replay, and reconnect
	exactly through existing snapshots/events without duplicate tiles or unauthorized
	patch leakage.
* Add worker-trigger validation if autonomy is in scope for this implementation slice.
	That includes trigger payload schema, assignment scope, proposal/approval gates, safe
	mutation tool design, audit events, checkpoint semantics, and tests proving model
	output cannot bypass server validation.

## Evidence

### Client Evidence

* apps/client/src/domain/tileGeometry.ts defines tile shapes, material variants,
	outlines, transforms, and rotation normalization.
* apps/client/src/domain/placementSolver.ts defines `TileInstance`, placement bounds,
	periodic neighbor projection, SAT collision validation, and guided placement.
* apps/client/src/interaction/controller.ts defines `ActiveTile`, `GhostState`,
	sequenced tile state, optimistic placement ACK reconciliation, and `tryPlaceTile`.
* apps/client/src/domain/quiltCache.ts defines canonical patch cache state, snapshot
	merge, incremental placement/removal, optimistic pinning, undo metadata, eviction,
	and revision reconciliation.
* apps/client/src/render/MosaicScene.tsx renders extruded tile meshes, ghost meshes,
	remote cursors/selections, witness signals, grid overlays, periodic images, and
	interaction plane events.
* apps/client/src/App.tsx wires canonical world discovery, chunk subscription,
	occupancy refresh, protocol handling, `quilt_place_tile`, `quilt_remove_tile`, undo,
	grid controls, and E2E canvas API registration.
* apps/client/src/test/canvasTestApi.ts defines the E2E-only runtime bridge used by
	Playwright to set active tiles, place tiles, inspect tiles, and inspect metrics.
* apps/client/src/domain/quiltCache.test.ts verifies deduplication, patch eviction,
	chunk scope preservation, incremental placement/removal, optimistic retention, and
	monotonic revision reconciliation.
* apps/client/src/render/MosaicScene.test.tsx verifies periodic image enumeration,
	toroidal hit canonicalization, rotate/pan input routing, ownership outlines, witness
	rendering, and settled transform mounting.
* e2e/multi-user-fixtures.spec.ts verifies multi-user placement, material/color/rotation
	propagation, authorization rejection, convergence, and near-simultaneous placement
	behavior.
* e2e/quilt-seams.spec.ts verifies toroidal alias deduplication, reconnect cursor reuse,
	finite traversal, patch/tile/cache budgets, and grid stability.

### Server Evidence

* apps/server/src/contracts.ts is the shared source of truth for protocol version,
	tile shapes, materials, tile state, canonical descriptor, occupancy response, socket
	auth, placement payloads, and ACK/reject contracts.
* apps/server/src/db/schema.ts defines canonical world, quilts, patches, memberships,
	visibility policies, tiles, tile spatial refs, patch operations, patch snapshots,
	idempotency keys, presence leases, and agent-control tables.
* apps/server/src/db/repository.ts implements canonical discovery, assignment,
	occupancy, patch delivery context, patch snapshots/events, `persistQuiltTilePlacement`,
	and `persistQuiltTileRemoval`.
* apps/server/src/index.ts exposes `/quilts/canonical`, `/quilts/:quiltId/occupancy`,
	ownership endpoints, agent read route registration, Socket.IO initialization,
	`subscribe_quilt_area`, `quilt_place_tile`, `quilt_remove_tile`, and test-only quilt
	setup/publish endpoints.
* apps/server/src/routes/agentReads.ts defines internal read-only agent routes and
	enforces assignment, surface, limit, response-size, and audit controls.
* apps/server/migrations/0005_finite_toroidal_quilt.sql creates quilt/patch/tile spatial
	storage and patch operation history.
* apps/server/migrations/0007_canonical_world.sql creates the active canonical world
	pointer.
* apps/server/migrations/0012_agent_control_plane.sql creates the agent-control schema,
	assignments, runs, leases, checkpoints, trigger queue, tool/model metadata, lifecycle
	audit, queue limits, and restricted worker role.
* apps/server/migrations/0015_patch_scoped_agent_assignments.sql adds patch-scoped agent
	assignments.

### Worker Evidence

* apps/agent-worker/README.md documents read-only scope, production prerequisites,
	fixed tools, runtime flow, gateway behavior, and preflight commands.
* apps/agent-worker/src/main.py builds the runtime from environment configuration.
* apps/agent-worker/src/control_plane.py owns trigger, run, lease, checkpoint, and
	requeue interfaces plus Postgres and in-memory implementations.
* apps/agent-worker/src/supervisor.py owns process-once and run-forever behavior,
	lease renewal, checkpoint commits, completion, failure, and requeue.
* apps/agent-worker/src/tools.py owns server read tools and redaction.
* apps/agent-worker/src/workflow.py owns the context/events/proposal graph.
* apps/agent-worker/src/gateway.py owns the governed model gateway and observe-only
	action validation.
* apps/agent-worker/tests/test_workflow.py verifies read-only proposal behavior, feature
	gate fallback, framework graph use, checkpoint replay, and lease-loss stopping.
* apps/agent-worker/tests/test_supervisor.py verifies trigger completion, lease
	unavailable requeue, feature-gate blocking, reclaimed trigger reuse, and checkpoint
	resume.

### Alexander Pipeline Evidence

* package.json defines `verify:alexander-source`, `preprocess:alexander-source`,
	`test:preprocess-alexander-source`, `generate:alexander-mosaic-inputs`, and
	`test:alexander-mosaic-inputs`.
* scripts/preprocess-alexander-source.mjs defines deterministic preprocessing and writes
	normalized image, LAB binary, luminance image, denoised preview, saliency mask, edge
	mask, and config artifacts.
* scripts/generate-alexander-mosaic-inputs.mjs defines deterministic palette extraction
	and edge/saliency-ranked candidate generation.
* scripts/generate-alexander-mosaic-inputs.test.mjs validates deterministic generator
	output from synthetic source data.
* offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json reports
	generated output dimensions, candidate count, palette size, artifact paths, hashes,
	and pipeline settings.
* offline/output/alexander-mosaic-inputs/alexander-mosaic-palette.json and
	offline/output/alexander-mosaic-inputs/alexander-tile-candidates.json are generated
	source-derived inputs, not runtime placement payloads.
* .copilot-tracking/reviews/2026-08-07/alexander-mosaic-patch-plan-review.md and
	.copilot-tracking/reviews/rpi/2026-08-07/alexander-mosaic-patch-plan-001-validation.md
	both record that patch payload generation, importer, persistence/replay validation,
	fidelity scoring, and E2E import coverage remain unimplemented.

## Follow-On Questions

* Should autonomous committed recreation be performed by an agent principal, by a human
	user approving a generated import plan, or by a server-side administrative/import
	process?
* Should issue 155 target one user-owned canonical patch, a curated system-owned patch,
	or a temporary preview canvas before committing to the shared canonical quilt?
* What fidelity threshold is acceptable for the first in-app Alexander recreation using
	only the current supported tile shapes and materials?
* Should generated Alexander artifacts under offline/output remain ignored and
	reproducible, or should a compact manifest/payload be committed as a runtime fixture?

## Clarifying Questions

* Does "autonomously" require the Python agent-worker to commit tiles itself, or is a
	deterministic offline generator plus user-approved import enough for the first
	implementation slice?
* Is the intended Alexander target the current Wikimedia close-up, or must a fuller
	Alexander Mosaic scene be restored to include horse-level recognizability?
* Can an agent ever own or be granted write authority over a patch, or must all
	committed placements remain attributed to a human principal?