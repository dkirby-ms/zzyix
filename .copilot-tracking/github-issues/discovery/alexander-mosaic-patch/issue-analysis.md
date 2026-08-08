<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Discovery Issue Analysis - Alexander Mosaic Patch Recreation

* **Artifact(s)**: .copilot-tracking/plans/2026-08-06/alexander-mosaic-patch-plan.instructions.md, .copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md
* **Repository**: dkirby-ms/zzyix
* **Milestone**: none
* **Status**: Complete. Twelve issues were created and attached directly under #155.

## Planned Issues

### IS001 - Create - Track Alexander mosaic patch recreation

* **Working Title**: feat(mosaic): recreate Alexander mosaic patch through deterministic import pipeline
* **Key Search Terms**: "Alexander mosaic" OR "mosaic import", "deterministic generator", "quilt_place_tile"
* **Working Description**:
  ```markdown
  ## Summary

  Track the end-to-end work to generate one bounded Alexander mosaic patch offline and import it through the existing quilt placement protocol.

  ## Scope

  Coordinate source provenance, deterministic generation, client import, server persistence verification, focused tests, visual fidelity checks, and final validation.

  ## Acceptance Criteria

  - [ ] Child issues cover source provenance, manifest contracts, offline generation, client import, persistence verification, testing, visual acceptance, and final validation.
  - [ ] No new mutation protocol is introduced for the first version.
  - [ ] The imported patch persists, replays, and reconnects through the existing placement path.
  - [ ] Fidelity evidence is reproducible from the selected source, manifest, payload, and scoring command.
  ```
* **Working Labels**: feature
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: feature
  * milestone: none

#### IS001 - Related and Discovered Information

* Related requirements from the implementation plan
  * Recreate one bounded Alexander mosaic patch through supported tile placements.
  * Preserve existing client/server mutation, persistence, and replay contracts.
  * Use deterministic offline generation and machine-readable fidelity validation.

### IS002 - Create - Public-domain source image provenance

* **Working Title**: chore(mosaic): document public-domain source image provenance
* **Key Search Terms**: "source pack", "license manifest", "Alexander mosaic"
* **Working Description**:
  ```markdown
  ## Summary

  Create a reproducible source pack for the Alexander mosaic benchmark image and any comparison images used by the generator.

  ## Acceptance Criteria

  - [ ] A manifest records source URL, file name, license, attribution, retrieval date, crop, and checksum for each benchmark image.
  - [ ] The primary source checksum is stable across repeated generation runs.
  - [ ] Source assets remain outside the runtime bundle unless an approved asset location is established.
  - [ ] The normalized working source is reproducible from the manifest and original source.
  ```
* **Working Labels**: maintenance
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: maintenance
  * milestone: none

#### IS002 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 1, Step 1.1: licensed benchmark pack and normalized source contract.

### IS003 - Create - Patch manifest and tile contract

* **Working Title**: feat(mosaic): define patch manifest and supported tile contract validation
* **Key Search Terms**: "patch manifest", "tile contract", "mosaicImport"
* **Working Description**:
  ```markdown
  ## Summary

  Define the versioned patch manifest and runtime validation contract for generated mosaic placement payloads.

  ## Acceptance Criteria

  - [ ] The manifest includes source identity, patch identifiers, patch dimensions, coordinate transform, palette, material, shape, rotation bins, generator seed, and expected tile count.
  - [ ] Generated placements validate against supported shape, material, coordinate, rotation, color, and duplicate tile ID rules before network emission.
  - [ ] Re-running the generator with the same source and seed produces byte-equivalent payloads.
  - [ ] Runtime parsing lives in a client domain module that can be tested independently.
  ```
* **Working Labels**: feature
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: feature
  * milestone: none

#### IS003 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 1, Step 1.2 and establishes the payload contract consumed by the generator and client importer.

### IS004 - Create - Deterministic preprocessing pipeline

* **Working Title**: feat(mosaic): implement deterministic source preprocessing pipeline
* **Key Search Terms**: "CIELAB", "CLAHE", "saliency mask", "preprocess"
* **Working Description**:
  ```markdown
  ## Summary

  Implement the offline preprocessing step that converts the selected source into deterministic color, luminance, denoising, and saliency artifacts.

  ## Acceptance Criteria

  - [ ] The preprocessing pipeline converts the source to CIELAB and applies deterministic luminance normalization.
  - [ ] Edge-preserving denoising and saliency or edge mask generation are reproducible.
  - [ ] Configuration records color space, normalization, denoising, saliency parameters, and generator seed.
  - [ ] Output retains face, weapon, horse, and contour edges needed for recognizable mosaic generation.
  ```
* **Working Labels**: feature
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: feature
  * milestone: none

#### IS004 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 2, Step 2.1 and depends on the source pack and manifest contract.

### IS005 - Create - Fixed-grid tessera generator

* **Working Title**: feat(mosaic): generate fixed-grid tesserae with saliency refinements
* **Key Search Terms**: "tessera", "fixed grid", "saliency refinements", "tile placement"
* **Working Description**:
  ```markdown
  ## Summary

  Generate deterministic patch-compatible tile placements using a fixed-grid baseline, historical palette quantization, and saliency-driven refinement.

  ## Acceptance Criteria

  - [ ] The generated payload covers the bounded patch without illegal overlap.
  - [ ] Salient contours receive higher density or more coherent orientation than low-detail regions.
  - [ ] Conflict resolution uses deterministic tie-breaking.
  - [ ] Tile count stays within configured snapshot, payload, and import budgets.
  - [ ] Output uses only app-supported shape, material, color, coordinate, and rotation contracts.
  ```
* **Working Labels**: feature
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: feature
  * milestone: none

#### IS005 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 2, Step 2.2 and consumes the preprocessing output.

### IS006 - Create - Fidelity scoring report

* **Working Title**: feat(mosaic): emit machine-readable Alexander patch fidelity reports
* **Key Search Terms**: "fidelity", "MS-SSIM", "EdgeF1", "SilhouetteIoU"
* **Working Description**:
  ```markdown
  ## Summary

  Add the offline scoring step that compares the generated patch against the normalized source and records release-blocking fidelity metrics.

  ## Acceptance Criteria

  - [ ] The report includes luminance MS-SSIM, edge F1, directional divergence, silhouette IoU, weighted score, tile count, and conflict count.
  - [ ] The weighted score uses 0.30 MS-SSIM_L + 0.25 EdgeF1 + 0.25 (1 - D_theta) + 0.20 SilhouetteIoU.
  - [ ] Thresholds and failure reasons are machine-readable.
  - [ ] The score can be reproduced from the manifest, source checksum, generated payload, and scoring command.
  ```
* **Working Labels**: feature
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: feature
  * milestone: none

#### IS006 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 2, Step 2.3 and provides input for visual acceptance.

### IS007 - Create - Client import parser and preflight validation

* **Working Title**: feat(client): parse and preflight mosaic import payloads
* **Key Search Terms**: "mosaicImport", "preflight validation", "tile contract"
* **Working Description**:
  ```markdown
  ## Summary

  Add a client domain importer that parses patch payloads and rejects malformed imports before any socket placement event is emitted.

  ## Acceptance Criteria

  - [ ] The parser validates manifest version, patch topology, tile contracts, normalized colors, deterministic transforms, and conflict policy.
  - [ ] Malformed payloads return actionable validation errors without partial writes.
  - [ ] Import state remains separate from ordinary manual placement state.
  - [ ] Unit tests cover malformed payloads and deterministic validation behavior.
  ```
* **Working Labels**: feature
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: feature
  * milestone: none

#### IS007 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 3, Step 3.1 and consumes the generated payload schema.

### IS008 - Create - Revision-safe client import queue

* **Working Title**: feat(client): import mosaic placements through bounded revision-safe windows
* **Key Search Terms**: "quilt_place_tile", "expectedPatchRevisions", "bounded import", "stale revision"
* **Working Description**:
  ```markdown
  ## Summary

  Wire mosaic imports into the existing client placement mutation path using bounded windows, expected patch revisions, acknowledgement reconciliation, and deterministic retry or skip behavior.

  ## Acceptance Criteria

  - [ ] Imports reuse the existing quilt placement event and never use direct SQL or a new mutation event.
  - [ ] Expected patch revisions are computed before each emission or bounded window.
  - [ ] In-flight placement work is capped by configuration.
  - [ ] Stale revisions retry with refreshed state and terminate after the configured limit.
  - [ ] ACK, timeout, stale revision, and conflict outcomes are observable in the import report.
  ```
* **Working Labels**: feature
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: feature
  * milestone: none

#### IS008 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 3, Step 3.2 and depends on client payload validation.

### IS009 - Create - Server persistence and replay verification

* **Working Title**: test(server): verify mosaic imports use canonical persistence and replay path
* **Key Search Terms**: "persistQuiltTilePlacement", "patch operation", "snapshot replay", "mosaic import"
* **Working Description**:
  ```markdown
  ## Summary

  Verify imported placements pass through the unchanged server socket guard, placement validation, canonical persistence, operation append, revision increment, snapshot, and replay loaders.

  ## Acceptance Criteria

  - [ ] Imported tiles persist transactionally and replay identically after reconnect.
  - [ ] Patch revisions and operation sequence numbers remain monotonic.
  - [ ] No database migration is introduced for the first version.
  - [ ] Optional provenance metadata is added only if the existing payload contract permits it.
  - [ ] Tests cover the nearest socket, repository, snapshot, and replay boundaries.
  ```
* **Working Labels**: maintenance
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: maintenance
  * milestone: none

#### IS009 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 4, Step 4.1 and preserves the existing server protocol.

### IS010 - Create - Import regression and reconnect tests

* **Working Title**: test(mosaic): cover deterministic import retries conflicts and reconnect convergence
* **Key Search Terms**: "mosaic import tests", "reconnect convergence", "payload budget", "conflict skipping"
* **Working Description**:
  ```markdown
  ## Summary

  Add focused client, server, and end-to-end tests for deterministic import behavior and reconnect convergence.

  ## Acceptance Criteria

  - [ ] Tests cover contract validation, deterministic output, bounded queue behavior, stale revision retry, conflict skipping, acknowledgement reconciliation, and payload budget handling.
  - [ ] Server tests cover persistence and replay for imported placements.
  - [ ] End-to-end coverage proves a bounded patch imports to the same final state on a clean client and after reconnect.
  - [ ] Existing manual placement tests continue to pass without behavioral changes.
  ```
* **Working Labels**: maintenance
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: maintenance
  * milestone: none

#### IS010 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 5, Step 5.1 and depends on client importer and server verification work.

### IS011 - Create - Visual fidelity acceptance harness

* **Working Title**: test(mosaic): enforce visual fidelity acceptance for Alexander patch
* **Key Search Terms**: "visual fidelity", "acceptance thresholds", "human QA", "Alexander patch"
* **Working Description**:
  ```markdown
  ## Summary

  Add release-blocking visual acceptance checks for the generated patch and retain reproducible score evidence.

  ## Acceptance Criteria

  - [ ] The generated patch is rendered or rasterized through the intended comparison path.
  - [ ] Weighted fidelity, silhouette overlap, edge continuity, tile count, and conflict thresholds block release when they fail.
  - [ ] A reviewer can reproduce the score from the manifest, source checksum, generated payload, and scoring command.
  - [ ] The first benchmark pack receives explicit human visual QA.
  - [ ] A design or decision record is added if the project requires one for this benchmark.
  ```
* **Working Labels**: maintenance, documentation
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: maintenance, documentation
  * milestone: none

#### IS011 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 5, Step 5.2 and depends on fidelity scoring plus import regression coverage.

### IS012 - Create - Final validation and release handoff

* **Working Title**: chore(mosaic): run final validation and capture Alexander patch handoff
* **Key Search Terms**: "final validation", "mosaic import", "Playwright", "score thresholds"
* **Working Description**:
  ```markdown
  ## Summary

  Run the full validation suite for the Alexander mosaic patch work, apply isolated fixes, and record any blockers that require follow-on planning.

  ## Acceptance Criteria

  - [ ] Lint, build, unit tests, focused end-to-end tests, and fidelity threshold checks pass.
  - [ ] Minor lint, typing, fixture, or threshold corrections are applied only when isolated.
  - [ ] Issues requiring protocol changes, schema design, or algorithm redesign are captured as follow-on work instead of expanding first-version scope.
  - [ ] Required development and test ports are free after validation completes.
  - [ ] Final handoff summarizes validation status, generated artifacts, and remaining risks.
  ```
* **Working Labels**: maintenance
* **Working Milestone**: none
* **Suggested Issue Field Values**:
  * labels: maintenance
  * milestone: none

#### IS012 - Related and Discovered Information

* Related implementation detail
  * Implements Phase 6, Steps 6.1 and 6.2.

<!-- markdown-table-prettify-ignore-end -->
