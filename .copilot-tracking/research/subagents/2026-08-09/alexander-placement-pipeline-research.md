---
title: Alexander Placement Pipeline Research
description: Actionable repository research for completing the Alexander mosaic placement, import, persistence, replay, reconnect, and fidelity workflow
ms.date: 2026-08-09
ms.topic: research
---

## Research Topics

* Determine whether existing Alexander palette and candidate outputs are sufficient for a deterministic placement manifest.
* Trace the existing client import-adjacent placement path, `quilt_place_tile` protocol, persistence, replay, and reconnect behavior.
* Identify exact implementation gaps, validation commands, phased work, and the boundary for agent-owned writes.

## Status

Complete for repository-local research. No source files were modified. The requested research document is:

`.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md`

## Executive Finding

The existing offline outputs are sufficient inputs for a deterministic manifest generator, but they are not themselves app-ready placements. The current pipeline ends with 24 palette colors and 760 ranked image-space candidate cells. A new downstream stage must choose the target quilt rectangle, map pixels to canonical world coordinates, choose supported tile shapes/materials/transforms, define deterministic ordering and conflict policy, and emit a versioned manifest with provenance hashes and fidelity metadata.

The safest v1 is a user or operator-triggered client import that submits each bounded placement through the existing `quilt_place_tile` path. This preserves server authorization, collision validation, patch revision checks, idempotency, spatial references, operation history, events, snapshots, and reconnect recovery. Agent-owned writes are not available today and should remain a separate, policy-backed follow-up unless product explicitly requires fully autonomous commits.

## Existing Alexander Data

### Source and preprocessing

* `offline/reference/alexander-source-license-records.json` defines the source identity, Wikimedia provenance, checksum, crop, and normalized working-source recipe. The primary source SHA-256 is `6c3731140a79698818db392e7a0a1985a56dad1fbf034552bd214dd14fd4397b`.
* `scripts/preprocess-alexander-source.mjs` implements deterministic source loading, SHA-256 verification, resize to `1077 x 1616`, sRGB to CIELAB-D65 conversion, luminance normalization, bilateral denoising, saliency, edge masks, and feature-retention checks.
* `offline/output/alexander-preprocessed/alexander-preprocessing-config.json` records the run metadata and artifact hashes. The current preprocessing config hash is `f261deac833975efdefe4b818adc65689ced42b8c39e725a6ff35ee617c95712`.

### Palette and candidate generation

* `scripts/generate-alexander-mosaic-inputs.mjs` consumes the preprocessing config plus LAB, luminance, saliency, and edge artifacts. `extractPalette` selects weighted, diverse LAB colors. `generateTileCandidates` ranks source cells by edge density, saliency, and contrast, assigns the nearest palette color, sorts deterministically, and truncates to the configured count.
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-palette.json` contains 24 entries with stable IDs, hex/RGB/LAB values, weights, pixel counts, saliency means, and edge-pixel counts. Its current SHA-256 is `2962b77cf2ab13a211169febc19bb1ba78fc3c4db803e000c5bc48190519f4b1`.
* `offline/output/alexander-mosaic-inputs/alexander-tile-candidates.json` contains 760 ranked candidates. Each candidate has a stable ID, image-space `box`, image-space `anchor`, score, edge/saliency/luminance statistics, nearest `paletteId`, `paletteHex`, and `paletteDeltaE`. The current candidate SHA-256 is `f1213ac07cee54db735ab0f4f7a641ce3a68e0dc96733a02dcf652b4d8142f5a`.
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json` records the candidate and palette artifact paths and hashes, output dimensions, pipeline parameters, generator seed `alexander-mosaic-inputs-v1`, source image ID, and preprocessing config hash. Its current SHA-256 is `95df0852dd9beb4c0d49becad9b57b0a01f315839bf0f436c441688bbe891cc6`.

The data is therefore enough to derive deterministic placements. It lacks tile geometry, world coordinates, target patch identity, material, transform policy, operation IDs, expected revisions, payload budgets, conflict outcomes, final tessera coverage, and a fidelity report. The outputs are under `/offline/output/`, which is ignored by Git, so reproducibility must be carried by the manifest metadata and generation commands rather than by assuming generated files are tracked.

One provenance issue should be resolved or documented: the source reference recipe names `offline/output/alexander-normalized-master.png`, while the actual generated artifact is under `offline/output/alexander-preprocessed/alexander-normalized-master.png`.

## Runtime Contracts

### Client placement path

* `apps/client/src/domain/tileGeometry.ts` defines the supported shapes: `square`, `triangle`, `rectangle`, `l-shape`, `large-square`, `circle`, `right-triangle`, and `large-right-triangle`. It also defines materials `ceramic`, `glass`, and `stone`, transform normalization, outlines, and transformed polygons.
* `apps/client/src/domain/placementSolver.ts` defines `TileInstance`, `derivePlacementBounds`, periodic-neighbor projection, bounds checks, and SAT overlap validation. Client validation is useful for preflight, but server validation remains authoritative.
* `apps/client/src/domain/quiltCache.ts` defines `setQuiltOptimisticTile`, `clearQuiltOptimisticTile`, `applyQuiltPatchPlacement`, `applyQuiltPatchRemoval`, `reconcileQuiltMutationRevisions`, snapshot merging, cursor tracking, and cache retention.
* `apps/client/src/App.tsx` contains the controlling runtime path. `expectedPatchRevisions` reads cached patch cursors. The normal placement flow finds affected patches, rejects when revisions are unavailable, stages an optimistic tile, emits `quilt_place_tile`, removes the optimistic tile on rejection, applies accepted tiles to every affected patch, reconciles patch revisions/event IDs, and records undo metadata. `placeFromState` is the nearest reusable pattern for a bounded importer.
* `apps/client/src/App.tsx` also debounces `subscribe_quilt_area`, sends cached cursors, merges snapshots/events, and handles patch resync. A production importer should integrate with these existing state transitions rather than use the E2E-only bridge in `apps/client/src/test/canvasTestApi.ts`.

### Server authority

* `apps/server/src/contracts.ts` defines `QuiltPlaceTileRequest` with `quiltId`, `operationId`, `expectedPatchRevisions`, and a tile payload. `QuiltPlaceTileAck` is either an accepted response with the authoritative tile and patch revisions/event IDs or a rejected response with a typed code.
* `apps/server/src/index.ts` handles `quilt_place_tile`, rejects when protocol mutation is disabled or the request is invalid, resolves the authenticated principal, calls `persistQuiltTilePlacement`, returns the ACK, and publishes patch events for accepted mutations.
* `apps/server/src/db/repository.ts` exports `persistQuiltTilePlacement`. It canonicalizes toroidal coordinates, derives all intersected/collision-lock patches, locks them in stable order, requires ownership of every affected patch, checks expected revisions, validates geometry and collisions, inserts the canonical tile and spatial refs, appends patch operations, advances revisions, writes audit data, and binds idempotency outcomes.
* Canonical storage and recovery are documented in `docs/canonical-quilt-data-storage.md`. Tiles are stored once; `tile_spatial_refs` indexes affected patch/chunk surfaces; `patch_operations` and `patch_snapshots` support replay and recovery. `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` fixes the 32 x 32 topology, 31.2 x 20.4 patch dimensions, and finite wrapped canonical coordinate model.

### Existing replay and reconnect evidence

* `apps/server/src/db/repository.postgres.integration.test.ts` covers accepted placement, idempotent replay without duplicate durable rows, ownership rejection, stale revisions, collision/locking behavior, removal, and patch revisions.
* `e2e/quilt-reconnect.spec.ts` proves multi-replica placement through `quilt_place_tile`, unauthorized rejection, accepted ACKs, patch events, stale revision rejection, removal, cursor-based event replay after reconnect, and subscription budgets.
* `e2e/quilt-seams.spec.ts` proves canonical room alias deduplication across seams and repeated laps, plus reconnect cursor convergence and finite client traversal budgets.
* `apps/client/src/domain/quiltCache.test.ts`, `apps/client/src/domain/placementSolver.test.ts`, and `apps/client/src/domain/gridPlacement.test.ts` cover cache monotonicity, optimistic state, geometry, collision, bounds, and grid behavior.

## Agent Boundary

`apps/agent-worker/README.md`, `apps/agent-worker/src/gateway.py`, `apps/agent-worker/src/tools.py`, and `apps/agent-worker/src/workflow.py` establish a durable read-only worker. It can claim assigned triggers, lease quilts, read authorized context/snapshots/events, checkpoint, and emit observation-only proposals. The gateway permits only safe `observe` actions. There is no Alexander trigger, manifest importer, Socket.IO mutation client, or worker `quilt_place_tile` capability.

`docs/decisions/2026-08-07-resident-agent-architecture.md` says future agents must use ordinary authenticated API and Socket.IO contracts, with the server remaining authoritative. It also explicitly rejects direct database writes and LLM-controlled canvas mutation. Therefore agent-owned placement requires a separate implementation and product/policy decision covering agent identity, patch ownership eligibility, mutation feature flags, audit, checkpoints, bounded retries, and multi-replica tests. It is not a prerequisite for a user-approved canonical import v1.

## Recommended Phased Implementation

### Phase 0: Product and target contract

Decide whether v1 is operator-triggered import or agent-committed recreation. For the recommended v1, define the target quilt/patch or user-owned patch, target world rectangle, tile count budget, acceptable partial completion, cancellation behavior, and fidelity threshold. Do not accept a manifest without a target coordinate transform and explicit conflict policy.

### Phase 1: Deterministic manifest generator

Add a downstream script, preferably `scripts/generate-alexander-patch-manifest.mjs`, consuming the existing three mosaic-input artifacts and their configs. Keep source preprocessing and palette/candidate generation unchanged.

The manifest should include:

* `schemaVersion`, source image ID, source SHA-256, preprocessing config SHA-256, mosaic-input config SHA-256, palette/candidate SHA-256 values, generator seed/version, and generation command/config
* Source coordinate space `1077 x 1616`, target quilt rectangle, scale/origin/axis transform, canonical topology assumptions, and target patch IDs or patch address policy
* Ordered placement records with stable tile ID, source candidate ID, target `position`, supported `shape`, `material`, color, rotation, mirrored flag, expected footprint, and source score/palette metadata
* Explicit deterministic ordering, maximum placement count, collision policy, out-of-bounds policy, and skipped-candidate reasons
* Pre-import feature coverage and post-selection coverage for face, weapon, armour, and contour, plus payload byte/count budgets

A conservative first geometry policy is to use one supported shape and fixed material/rotation while validating the pipeline, then add shape variation only when the fidelity scorer demonstrates value. The generator must calculate footprints with the same tile definitions used by the client/server, or a shared equivalent, so boundary and collision decisions are not guessed from candidate boxes.

Add `scripts/generate-alexander-patch-manifest.test.mjs` with synthetic candidates and assertions for stable output hashes, coordinate mapping, supported enums, deterministic ordering, bounds, duplicate IDs, conflict policy, and post-truncation feature coverage.

### Phase 2: Fidelity scorer and artifact verification

Add `scripts/score-alexander-patch-fidelity.mjs` or an equivalent stage that rasterizes the selected placements into the target image-space grid and compares the result against the normalized source. At minimum report color error, edge/contour retention, feature-region coverage, candidate skips, collision/out-of-bounds counts, and a machine-readable pass/fail threshold. Preserve the report alongside the generated manifest under `offline/output/alexander-mosaic-inputs/`.

Extend provenance verification so a manifest and fidelity report are checked for referenced artifact hashes, schema version, supported contract, expected dimensions, and reproducibility. Do not treat a visual screenshot alone as the acceptance artifact.

### Phase 3: Client parser and preflight

Add a focused client domain module such as `apps/client/src/domain/mosaicImport.ts` with pure parser/preflight functions and tests. It should validate schema and hashes, source image ID, topology and target patch identity, supported shapes/materials, finite transforms, tile ID uniqueness, footprint bounds, duplicate candidates, manifest ordering, maximum payload size, and availability of current patch cursors/revisions.

Preflight should return structured counts and reasons before network mutation. It should not silently repair coordinates or silently choose a different patch. A user-facing import UI can be added near existing app controls after the pure contract is stable.

### Phase 4: Bounded canonical import queue

Integrate a bounded queue near the `App.tsx` placement mutation path. Reuse the same operation shape and cache reconciliation used by `placeFromState`:

1. Load the target patch cursors and verify mutation is enabled and ownership is present.
2. Submit a small fixed number of in-flight `quilt_place_tile` operations, with unique operation IDs and current expected revisions for every affected patch.
3. Apply accepted ACKs to the cache and advance revisions from the ACK, not from local assumptions.
4. On `STALE_REVISION`, stop or resync the affected patch, refresh cursors, and retry the same deterministic item only within a bounded retry budget.
5. On collision, out-of-bounds, unauthorized, throttled, or resource errors, record the item outcome and follow the manifest conflict policy. Never advance past a failed item while pretending it committed.
6. On disconnect, pause, resubscribe with cursors, and resume only after preflight/revision state is valid. Support cancellation and resumable progress keyed by manifest hash.

Keep the queue client-side and protocol-native for v1. A server bulk import endpoint would add a second mutation surface and would need to reproduce the same authorization, collision, revision, idempotency, audit, and replay semantics.

### Phase 5: Persistence, replay, reconnect, and fidelity acceptance

Add focused client tests for manifest parsing, preflight rejection, queue bounds, ACK reconciliation, stale revision retry, collision skip, cancellation, and reconnect pause/resume. Add server integration coverage using import-shaped payloads for idempotent retry, stale revision rejection, ownership, collision, spatial refs, patch operation history, and snapshot/replay behavior.

Add `e2e/alexander-mosaic-import.spec.ts` using the existing setup/token/socket helpers. The test should import a small deterministic fixture, verify accepted count and rejected reasons, reconnect through another replica, resubscribe from cursors, compare canonical tile IDs/transforms/colors/materials, and verify no duplicate operations after retry. Attach the generated manifest and fidelity report or equivalent measurements to the test result. Run a separate bounded larger fixture to exercise payload and cache budgets without making the E2E test dependent on all 760 candidates.

Acceptance should require:

* Re-running generation produces identical manifest and fidelity hashes.
* Client preflight rejects malformed or incompatible manifests before any mutation.
* Every committed tile is accepted by the existing server path and is represented in spatial refs, patch operations, and current revisions.
* Replaying the same operation ID does not duplicate tiles.
* Reconnect and replay converge to the same canonical tile set and cursors.
* Fidelity report meets the agreed threshold and records skipped/conflicted candidates.
* No direct SQL writes or agent-only mutation path are used by v1.

### Phase 6: Separate agent-owned write decision

Only if product requires autonomous commits, implement a separate gated slice after the client import proves correctness. Extend agent principal ownership eligibility and provisioning consistently, add a deterministic agent client using ordinary authenticated HTTP/Socket.IO contracts, define trigger/manifest checkpoint schemas, preserve patch ownership and revision semantics, add audit/telemetry, and cover claim, placement, stale revision, collision, idempotent retry, transfer, reconnect, and disabled-agent behavior. Keep LLM output outside the mutation authority path.

## Validation Commands

Existing validations:

```bash
npm run verify:alexander-source
npm run test:preprocess-alexander-source
npm run test:alexander-mosaic-inputs
npm run test:client
npm run test:server
npm run build:client
npm run build:server
npm run lint:client
npm run lint:server
npm run test:e2e:multi-replica
```

For the current generated outputs, the first three commands passed during the prior research and are the cheapest regression checks. The client/server test and build commands validate the existing runtime surfaces before integration. The multi-replica E2E command requires the repository's test infrastructure and environment setup; it is the closest existing executable check for stale revision, patch events, replay, and reconnect. The new work should add focused package scripts for manifest generation, manifest tests, fidelity scoring, and the Alexander import E2E test rather than relying on an undocumented manual sequence.

Worker validation, if the agent slice is later approved:

```bash
cd apps/agent-worker
pytest
```

## Unresolved Questions

* What exact canonical quilt or owned patch is the import target, and what world rectangle should represent the 1077 x 1616 source?
* Is v1 user-approved import, operator import, or fully agent-committed? Current code and architecture support only the first two without a new authority slice.
* What tile count and in-flight/concurrency budget are acceptable for the first import, and should the full 760 candidates be attempted or should a deterministic subset be selected?
* What minimum fidelity metric and threshold define success, and which source features are release-blocking?
* Should generated manifests be committed, published as release artifacts, or regenerated in CI from the provenance source? The output directory is ignored today.
* Should import provenance be attached to existing patch operation metadata, or is the manifest hash in client telemetry/test artifacts sufficient for v1?
* How should collisions and out-of-bounds candidates be handled: skip with a recorded reason, stop the import, or regenerate a lower-density manifest?
* Should the existing provenance path mismatch for the normalized master image be corrected before adding manifest verification?

## Recommended Next Research

* Confirm the product target patch/rectangle, fidelity threshold, and v1 actor decision with the epic owner.
* Inspect the exact canonical-world setup dimensions and ownership fixture helpers before writing the E2E import fixture.
* Decide whether the manifest generator should share tile geometry through a small neutral data contract or maintain a deliberately mirrored geometry table with parity tests.
* Determine whether operation provenance belongs in existing `patch_operations` payloads or in a separate import-run record after reviewing audit/retention requirements.
