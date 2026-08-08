---
title: Server Storage Research
description: Research findings on server-side quilt/patch persistence and synchronization in zzyix
author: Researcher Subagent
ms.date: 2026-08-06
ms.topic: reference
keywords:
  - server
  - storage
  - quilt
  - patch
  - migrations
estimated_reading_time: 8
---

## Research Scope

* Determine how patch/canvas/quilt data is persisted and synchronized
* Focus on apps/server/src, migrations, and canonical/finite toroidal docs
* Identify schema fields/APIs for reconstructed mosaic patch storage
* Capture payload and data constraints
* Locate server-side validation entry points for imported patch data
* Propose schema-compatible tessera metadata encoding

## Findings in Progress

Status: Complete

### 1) Persistence schema fields and APIs for reconstructed mosaic patch storage

Canonical quilt persistence is normalized across quilt topology, patch ownership, canonical tiles, spatial indexes, and per-patch event streams.

Core durable tables and key fields:

* `quilts`: topology and dimensions (`patch_rows`, `patch_columns`, `patch_width`, `patch_height`, `origin_x`, `origin_y`, `topology`, `protocol_version`)
* `patches`: patch identity and concurrency (`quilt_id`, `row`, `column`, `state`, `owner_principal_id`, `revision`)
* `tiles`: canonical tile facts (`id`, `quilt_id`, `anchor_patch_id`, `shape`, `color`, `material`, `pos_x`, `pos_y`, `rotation`, `mirrored`, `created_at`)
* `tile_spatial_refs`: lookup expansion across touched patches/chunks (`tile_id`, `patch_id`, `chunk_x`, `chunk_y`)
* `patch_operations`: per-patch durable event log (`patch_id`, `op_seq`, `event_id`, `operation_id`, `op_type`, `payload`)
* `patch_snapshots`: optional patch checkpoints (`patch_id`, `op_seq`, `state`)
* `canonical_world`: active canonical pointer (`product_key='canonical'`, `quilt_id`, `status`, `generation`)

Server API paths that write/read these tables:

* Write path: Socket event `quilt_place_tile` validates payload then calls `persistQuiltTilePlacement`
* Write path: Socket event `quilt_remove_tile` calls `persistQuiltTileRemoval`
* Sync/read path: `subscribe_quilt_area` uses `loadPatchDeliverySnapshot` and cursor replay via `loadPatchDeliveryOperationsAfter`
* Snapshot maintenance: `savePatchSnapshot` creates checkpoint rows from reconstructed patch state

Transactional write shape for placement in `persistQuiltTilePlacement`:

1. Canonicalize coordinates into toroidal quilt space
2. Compute intersected patches/chunks from geometry
3. Lock affected patches and authorize ownership/policy
4. Validate geometry/collision against nearby tiles
5. Insert one canonical tile row (`tiles`)
6. Insert one-or-more spatial refs (`tile_spatial_refs`)
7. Append per-patch operation rows (`patch_operations`)
8. Increment each touched patch revision

### 2) Constraints: payload size, patch dimensions, color representation, migration impact

Payload and transport constraints:

* Protocol limits are server-configurable with defaults:
  * `maxSnapshotTiles`: default 2000
  * `maxPayloadBytes`: default 256 KiB
  * `maxRoomsPerRequest`: default 32
  * `maxChunksPerRequest`: default 64
* During subscribe/replay, oversized replay/snapshot payloads are rejected as `budget-exceeded`
* HTTP JSON parser uses `express.json()` with no explicit limit override in this file (Express default applies)

Patch and quilt dimension constraints:

* DB-level checks enforce positive dimensions (`patch_rows > 0`, `patch_columns > 0`, `patch_width > 0`, `patch_height > 0`)
* DB trigger `enforce_patch_parent_bounds` enforces each patch row/column lies within parent quilt dimensions
* Runtime topology guard enforces finite positive dimensions and positive integer patch counts before canonicalization
* Architectural decision fixes canonical target at 32x32 patches of size 31.2 x 20.4 with toroidal wrapping

Color representation constraints:

* `color` is stored as `text` and validated only as a runtime string
* No server-side DB check currently constrains color format (hex/rgb/etc.)

Migration impact findings:

* `0005_finite_toroidal_quilt.sql` introduces quilt/patch canonical storage model (`quilts`, `patches`, `tile_spatial_refs`, `patch_operations`, `patch_snapshots`) and parent-bounds trigger
* `0007_canonical_world.sql` adds the canonical pointer table and generation/status checks
* `0003_tidy_chunk_columns.sql` adds `tiles.chunk_x/chunk_y`, backfills from `pos_x/pos_y` using 8.0-unit chunk formula, and adds chunk index
* `0010_new_tile_shapes.sql` expands allowed tile shape enum, impacting imported shape compatibility

### 3) Where server-side validation should run for imported patch data

For an import endpoint/job, validation should run in layers, reusing existing code paths:

* Transport and schema validation:
  * Reuse `isQuiltPlaceTileRequest` and `isPlaceTilePayload` (IDs, shape/material enum membership, number checks, transform checks)
* Canonical geometry validation:
  * Reuse canonicalization (`resolveCanonicalPoint`) and affected-patch derivation
  * Reuse `validatePlacement` collision checks before insertion
* Authorization and concurrency validation:
  * Keep patch ownership/policy checks and expected revision checks in `persistQuiltTilePlacement`
* DB guardrails (final protection):
  * Existing FK, unique, check constraints, and patch-parent bounds trigger

Practical implication: imported tiles should be fed through `persistQuiltTilePlacement` per tile (or a bulk variant with equivalent semantics), not direct SQL inserts into `tiles`.

### 4) Schema-compatible tessera metadata encoding recommendation

Goal: preserve compatibility with existing clients and protocol while storing extra tessera metadata (example: orientation confidence).

Recommended encoding (safe with current schema):

* Store metadata under an optional namespaced object inside `patch_operations.payload`, for example:
  * `payload.meta = { schema: 1, tessera: { orientation: 0.92, confidence: 0.81 } }`
* Keep existing required fields unchanged (`tileId`, `shape`, `color`, `material`, `transform`)
* Do not overload existing semantic fields like `color`, `shape`, or `placedBy`

Why this is safe now:

* Runtime payload guards are permissive and only require known fields/types; unknown fields are tolerated
* Existing event-to-client mapping in `index.ts` projects only known fields, so old clients remain unaffected

Caveat:

* This metadata will be durable in `patch_operations.payload` but is not currently projected into normal `TileInstance` snapshots, because snapshot reconstruction reads canonical rows from `tiles` and maps only known columns.
* If clients must consume metadata on first snapshot, a follow-up schema/API extension is needed (for example a new nullable JSONB column or explicit metadata sidecar API).

## Evidence

Schema and storage model:

* apps/server/src/db/schema.ts:116
* apps/server/src/db/schema.ts:133
* apps/server/src/db/schema.ts:145
* apps/server/src/db/schema.ts:223
* apps/server/src/db/schema.ts:456
* apps/server/src/db/schema.ts:495
* apps/server/src/db/schema.ts:521
* apps/server/src/db/schema.ts:549

Write/sync APIs and flow:

* apps/server/src/index.ts:1907
* apps/server/src/index.ts:1915
* apps/server/src/index.ts:1921
* apps/server/src/index.ts:1974
* apps/server/src/index.ts:2049
* apps/server/src/db/repository.ts:1784
* apps/server/src/db/repository.ts:1811
* apps/server/src/db/repository.ts:1818
* apps/server/src/db/repository.ts:1906
* apps/server/src/db/repository.ts:1917
* apps/server/src/db/repository.ts:1937
* apps/server/src/db/repository.ts:1953
* apps/server/src/db/repository.ts:1977
* apps/server/src/db/repository.ts:3483
* apps/server/src/db/repository.ts:3607
* apps/server/src/db/repository.ts:3658

Validation entry points:

* apps/server/src/index.ts:635
* apps/server/src/index.ts:644
* apps/server/src/index.ts:675
* apps/server/src/index.ts:684
* apps/server/src/index.ts:718
* apps/server/src/domain/quiltTopology.ts:53
* apps/server/src/domain/quiltTopology.ts:88
* apps/server/src/domain/placementSolver.ts:164
* apps/server/src/domain/placementSolver.ts:215

Payload/size constraints and protocol budgets:

* apps/server/src/index.ts:163
* apps/server/src/index.ts:164
* apps/server/src/index.ts:166
* apps/server/src/index.ts:167
* apps/server/src/index.ts:2234
* apps/server/src/index.ts:2245
* apps/server/src/index.ts:2274
* apps/server/src/index.ts:802

Color, shape, and material representation:

* apps/server/src/contracts.ts:81
* apps/server/src/contracts.ts:84
* apps/server/src/contracts.ts:325
* apps/server/src/contracts.ts:338
* apps/server/src/db/types.ts:1
* apps/server/src/db/types.ts:12
* apps/server/migrations/0000_overjoyed_lila_cheney.sql:39
* apps/server/migrations/0000_overjoyed_lila_cheney.sql:47
* apps/server/migrations/0000_overjoyed_lila_cheney.sql:48
* apps/server/migrations/0010_new_tile_shapes.sql:2

Dimension and parent-bounds constraints:

* apps/server/migrations/0005_finite_toroidal_quilt.sql:20
* apps/server/migrations/0005_finite_toroidal_quilt.sql:21
* apps/server/migrations/0005_finite_toroidal_quilt.sql:22
* apps/server/migrations/0005_finite_toroidal_quilt.sql:23
* apps/server/migrations/0005_finite_toroidal_quilt.sql:32
* apps/server/migrations/0005_finite_toroidal_quilt.sql:50
* apps/server/migrations/0005_finite_toroidal_quilt.sql:66
* apps/server/migrations/0005_finite_toroidal_quilt.sql:75

Canonical model and topology decisions:

* docs/canonical-quilt-data-storage.md:49
* docs/canonical-quilt-data-storage.md:54
* docs/canonical-quilt-data-storage.md:67
* docs/canonical-quilt-data-storage.md:82
* docs/canonical-quilt-data-storage.md:119
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:50
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:54
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:60
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:244

Migration impact:

* apps/server/migrations/0003_tidy_chunk_columns.sql:1
* apps/server/migrations/0003_tidy_chunk_columns.sql:3
* apps/server/migrations/0005_finite_toroidal_quilt.sql:17
* apps/server/migrations/0005_finite_toroidal_quilt.sql:90
* apps/server/migrations/0005_finite_toroidal_quilt.sql:98
* apps/server/migrations/0005_finite_toroidal_quilt.sql:115
* apps/server/migrations/0007_canonical_world.sql:1
* apps/server/migrations/0010_new_tile_shapes.sql:2

## Recommended Server Integration Flow

Use this flow for importing a reconstructed mosaic patch while staying compatible with existing schema and clients.

1. Resolve canonical target quilt using canonical pointer (`canonical_world`) and verify generation/topology.
2. Partition import tiles by patch address after canonicalization (`resolveCanonicalPoint`), but execute writes through existing mutation transaction logic.
3. For each tile, construct a protocol-compatible placement request and call `persistQuiltTilePlacement`.
4. Supply exact `expectedPatchRevisions` from a fresh `loadQuiltDeliveryContext` read to preserve optimistic concurrency.
5. On conflict (`STALE_REVISION`, `UNAUTHORIZED`, `PLACEMENT_REJECTED`), stop the batch or branch to retry policy; do not direct-write tables.
6. Optionally attach import-specific metadata under `payload.meta` in operation payloads for audit/provenance without client contract breakage.
7. After successful commit batch, call `savePatchSnapshot` for touched patches to reduce replay depth.
8. Emit/broadcast using existing room delivery paths (`quilt_patch_event`) so connected clients converge via current protocol.

## Unresolved Questions

* Should imported tessera metadata be queryable by clients on first snapshot, or is event-log durability sufficient for current scope?
* Is there a required canonical color format contract (hex only, rgba, named colors), or should free-form string remain supported?
* Should imports preserve source tile IDs exactly, or should the server remap and return an ID translation table?
