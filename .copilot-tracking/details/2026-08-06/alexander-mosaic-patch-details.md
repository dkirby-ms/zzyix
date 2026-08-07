<!-- markdownlint-disable-file -->
# Implementation Details: Alexander Mosaic Patch Recreation

## Context Reference

Sources: .copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md; user task requirements; package scripts in package.json, apps/client/package.json, and apps/server/package.json.

## Implementation Phase 1: Source Pack And Contracts

<!-- parallelizable: false; Step 1.2 depends on Step 1.1 -->

### Step 1.1: Create the licensed benchmark pack

Select one primary high-resolution Alexander mosaic image and up to two comparison images. Record source URL, file name, license, attribution, retrieval date, crop, and checksum in a versioned manifest. Keep source assets outside the runtime bundle unless the repository establishes an approved asset location.

Files:
* `offline/reference/alexander-source-license-records.json` - provenance and checksum manifest.
* `offline/reference/alexander-normalized-master.tif` - normalized working source, generated artifact.

Discrepancy references:
* Addresses DR-01 by making per-file licensing and attribution an explicit release gate.

Success criteria:
* Every benchmark image has verifiable reuse terms and attribution data.
* The primary source checksum is stable across repeated generation runs.

Context references:
* `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (External Research and Recommended Next Steps) - source and legal constraints.

Dependencies:
* Approved source image.
* Python 3.12 with `uv`, Pillow, `opencv-python-headless`, and `scikit-image` in `offline/pyproject.toml`.

### Step 1.2: Define the patch manifest and tile contract

Define a versioned manifest containing source identity, patch IDs, patch dimensions, coordinate transform, palette, material, shape, rotation bins, generator seed, and expected tile count. Validate each generated tile against the existing shape/material unions and placement constraints before import.

Files:
* `offline/output/patch-manifest.json` - generator and patch metadata.
* `offline/output/patch-<patchId>.json` - deterministic tile placement payload.
* `apps/client/src/domain/mosaicImport.ts` - shared runtime parsing and contract validation.

Success criteria:
* Invalid shapes, materials, coordinates, rotations, colors, and duplicate tile IDs fail before network emission.
* Re-running the generator with the same source and seed produces byte-equivalent payloads.

Context references:
* `apps/client/src/domain/tileGeometry.ts` (shape/material unions and transform primitives) - supported tile contract.
* `apps/client/src/domain/placementSolver.ts` (placement validation) - geometric constraints.

Dependencies:
* Step 1.1 completion.

## Implementation Phase 2: Offline Hybrid Generator

<!-- parallelizable: false; Phase 2 consumes the Phase 1 manifest and source -->

### Step 2.1: Preprocess the source image

Implement an offline pipeline that converts the source to CIELAB, normalizes luminance with CLAHE or an equivalent deterministic setting, applies edge-preserving denoising, and emits a reproducible saliency/edge mask. Preserve the unmodified source and all parameters in the manifest.

Files:
* `offline/pyproject.toml` - pinned offline generator and scoring dependencies.
* `offline/generator/preprocess.py` - preprocessing entry point and deterministic configuration.
* `offline/output/alexander-saliency-mask.png` - generated guidance artifact.

Discrepancy references:
* Addresses DD-01 by selecting deterministic preprocessing rather than runtime image processing.

Success criteria:
* Preprocessing output is reproducible and retains face, weapon, horse, and contour edges.
* Configuration records color space, normalization, denoising, and seed.

Context references:
* `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (External Research) - CLAHE, denoising, and morphology guidance.

Dependencies:
* Phase 1 completion.
* Run `uv run python offline/generator/preprocess.py --config offline/output/patch-manifest.json`.

### Step 2.2: Generate fixed-grid tesserae and saliency refinements

Generate a fixed-grid baseline over the bounded patch, quantize colors to the historical stone/ceramic palette, and apply deterministic refinement only where saliency exceeds configured thresholds. Use app-supported tile shapes and deterministic tie-breaking for overlap or slot conflicts.

Files:
* `offline/generator/generate_patch.py` - baseline and adaptive tessera generation.
* `offline/output/patch-<patchId>.json` - generated placements.

Success criteria:
* Full patch coverage is represented without illegal overlap.
* Salient contours receive higher tessera density or orientation coherence than low-detail regions.
* Tile count stays below the configured snapshot and import budget.

Context references:
* `apps/client/src/domain/tileGeometry.ts` (supported geometry) - output restrictions.
* `apps/server/src/domain/quiltTopology.ts` (topology constraints) - coordinate and dimension restrictions.
* `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (Preferred Approach) - hybrid algorithm.

Dependencies:
* Step 2.1 completion.
* Run `uv run python offline/generator/generate_patch.py --manifest offline/output/patch-manifest.json`.

### Step 2.3: Emit fidelity reports

Render or rasterize the generated patch into a comparison image and calculate luminance MS-SSIM, edge F1, directional divergence, silhouette IoU, weighted score, tile count, and conflict count. Establish an initial acceptance baseline for recognizability and retain reports with the payload.

Files:
* `offline/validation/score_alexander_patch.py` - metric calculation and report writer.
* `offline/output/patch-<patchId>-fidelity.json` - metric results.

Success criteria:
* The report uses the selected weighted score: 0.30 MS-SSIM_L + 0.25 EdgeF1 + 0.25 (1 - D_theta) + 0.20 SilhouetteIoU.
* Thresholds and failure reasons are machine-readable.

Dependencies:
* Step 2.2 completion.
* Run `uv run python offline/validation/score_alexander_patch.py --manifest offline/output/patch-manifest.json`.

## Implementation Phase 3: Client Importer

<!-- parallelizable: false -->

### Step 3.1: Parse and validate import payloads

Add a domain importer that validates manifest version, patch topology, tile contracts, normalized colors, deterministic transforms, and conflict policy before any socket call. Keep import state separate from ordinary manual placement state.

Files:
* `apps/client/src/domain/mosaicImport.ts` - parser, validator, and import state types.
* `apps/client/src/domain/mosaicImport.test.ts` - malformed payload and deterministic validation tests.

Success criteria:
* Malformed payloads produce actionable validation errors without partial writes.
* Existing manual placement behavior remains unchanged.

Context references:
* `apps/client/src/App.tsx` (placement orchestration and expectedPatchRevisions) - integration boundary.

Dependencies:
* Phase 2 payload schema.

### Step 3.2: Emit bounded, revision-safe placement windows

Reuse the existing `quilt_place_tile` event. Compute expected patch revisions before each emission or bounded window, cap in-flight work at the configured value, reconcile acknowledgements through the existing cache/update path, retry stale revisions within a bounded policy, and skip deterministic conflicts.

Files:
* `apps/client/src/App.tsx` - importer command wiring at the existing mutation path.
* `apps/client/src/domain/mosaicImport.ts` - queue, retry, and conflict policy.
* `apps/client/src/domain/quiltCache.ts` - reuse existing convergence semantics; modify only if a narrow importer hook is required.

Success criteria:
* Imports never use direct SQL or a new mutation event.
* Stale revisions retry with refreshed state and terminate after the configured limit.
* ACK, timeout, and conflict outcomes are observable in the import report.

Context references:
* `apps/client/src/App.tsx` (quilt_place_tile and expectedPatchRevisions) - existing client protocol path.
* `apps/client/src/domain/quiltCache.ts` (revision and op-seq handling) - convergence behavior.

Dependencies:
* Step 3.1 completion; server protocol remains unchanged.

## Implementation Phase 4: Server Persistence And Replay Verification

<!-- parallelizable: false -->

### Step 4.1: Verify the unchanged canonical write path

Confirm that import placements pass through the existing socket guard, placement validation, `persistQuiltTilePlacement`, patch operation append, revision increment, and snapshot/replay loaders. Add optional provenance metadata only in the existing operation payload namespace if the current payload contract permits it.

Files:
* `apps/server/src/index.ts` - protocol guard and handler tests only unless a narrow metadata guard is required.
* `apps/server/src/db/repository.ts` - persistence/replay tests only unless metadata projection is required.
* `apps/server/src/contracts.ts` - canonical color or metadata type only if required by the validated payload.

Discrepancy references:
* Addresses DR-02 by explicitly preserving the existing mutation and persistence protocol.
* Defers snapshot projection of tessera metadata to WI-01.

Success criteria:
* Imported tiles persist transactionally and replay identically after reconnect.
* Patch revisions and operation sequence numbers remain monotonic.
* No database migration is introduced for v1.

Context references:
* `apps/server/src/index.ts` (quilt_place_tile handler and payload budgets) - server boundary.
* `apps/server/src/db/repository.ts` (placement transaction and snapshot/replay loaders) - canonical persistence.
* `apps/server/src/db/schema.ts` (patch operations and snapshots) - storage contract.

Dependencies:
* Phase 3 importer implementation.

## Implementation Phase 5: Focused Tests And Acceptance Harness

<!-- parallelizable: false; Phase 5 depends on Phases 3 and 4 -->

### Step 5.1: Add client/server import tests

Test contract validation, deterministic output, bounded queue behavior, stale-revision retry, conflict skipping, ACK reconciliation, payload budget handling, persistence, and replay. Keep tests isolated from unrelated manual-placement scenarios.

Files:
* `apps/client/src/domain/mosaicImport.test.ts` - client importer tests.
* `apps/server/src/**/mosaicImport*.test.ts` - server protocol/persistence tests at the nearest existing test locations.
* `e2e/quilt-mosaic-import.spec.ts` - end-to-end convergence and reconnect coverage.

Success criteria:
* A bounded patch imports to the same final state on a clean client and after reconnect.
* Stale revisions and payload-budget failures are covered.
* Existing client and server test suites remain green.

Dependencies:
* Phases 3 and 4 completion.

### Step 5.2: Add visual fidelity acceptance checks

Run the generated patch through the same rendering path, compare against the normalized reference, and enforce configurable thresholds for weighted fidelity, silhouette overlap, edge continuity, and tile/conflict budgets. Require human visual QA for the first benchmark pack.

Files:
* `offline/validation/score_alexander_patch.py` - automated score thresholds.
* `offline/output/patch-<patchId>-fidelity.json` - retained acceptance evidence.
* `docs/decisions/2026-08-06-alexander-mosaic-patch-v01.md` - decision record if the project requires one.

Success criteria:
* Threshold failures block release of the payload.
* A reviewer can reproduce the score from the manifest, source checksum, and generated payload.

Dependencies:
* Steps 2.3 and 5.1 completion.

## Implementation Phase 6: Final Validation And Handoff

<!-- parallelizable: false -->

### Step 6.1: Run full project validation

Execute `npm run lint`, `npm run build`, `npm test`, `uv run python offline/validation/score_alexander_patch.py --manifest offline/output/patch-manifest.json --check-thresholds`, and `npm run test:e2e:preflight && npx playwright test e2e/quilt-mosaic-import.spec.ts --reporter=line`. The Playwright config owns its test stack; confirm ports 3101, 4173, and 3199 are free after the run.

Validation commands:
* `npm run lint` - client and server lint.
* `npm run build` - client and server TypeScript/build validation.
* `npm test` - client and server unit tests.
* `npm run test:e2e:preflight && npx playwright test e2e/quilt-mosaic-import.spec.ts --reporter=line` - authenticated browser validation through the configured Playwright stack.
* `uv run python offline/validation/score_alexander_patch.py --manifest offline/output/patch-manifest.json --check-thresholds` - generated artifact and fidelity validation.
* `lsof -i :3101`, `lsof -i :4173`, and `lsof -i :3199` - process cleanup checks; all must return no listeners.

### Step 6.2: Fix minor validation issues and report blockers

Apply isolated lint, typing, fixture, or threshold corrections. Record any issue requiring protocol changes, new schema design, or algorithm redesign as a follow-on plan rather than expanding v1 scope.

## Dependencies

* Licensed high-resolution benchmark image and reproducible offline image-processing toolchain.
* Existing tile shape/material and topology contracts.
* Existing Socket.IO `quilt_place_tile` protocol and revision-aware cache.
* Node/npm workspace scripts and Playwright test-auth setup.

## Success Criteria

* A deterministic hybrid generator produces schema-compatible tile placements for one bounded Alexander mosaic patch.
* Client import uses existing `quilt_place_tile`, revision checks, ACK reconciliation, and bounded retries.
* Server persistence and replay converge without a new mutation protocol or v1 migration.
* Fidelity reports measure luminance, edges, direction, silhouette, and budget constraints with machine-readable thresholds.
* Focused and full validation demonstrate deterministic import, reconnect convergence, and historical recognizability.
