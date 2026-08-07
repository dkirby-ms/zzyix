---
applyTo: '.copilot-tracking/changes/2026-08-06/alexander-mosaic-patch-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Alexander Mosaic Patch Recreation

## Overview

Implement a deterministic offline hybrid mosaic generator and a client importer that recreates one bounded Alexander mosaic patch through the existing revision-safe `quilt_place_tile` persistence and replay path.

## Objectives

### User Requirements

* Define a programmatic pipeline that reconstructs the Alexander mosaic into patch-compatible tile placements. Source: user task request and `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md`.
* Map the pipeline onto existing client/server architecture without introducing a new mutation protocol. Source: user task request and research integration findings.
* Specify fidelity controls and validation metrics for historical faithfulness. Source: user task request and research scoring proposal.
* Recommend one approach with alternatives and rejection reasons. Source: user task request and research technical scenarios.

### Derived Objectives

* Preserve legal provenance and deterministic source identity. Derived from research source-acquisition and reproducibility requirements.
* Prevent partial imports through preflight validation, bounded revision-safe queues, and deterministic conflict handling. Derived from existing protocol and cache constraints.
* Keep v1 within existing shape/material, topology, payload-budget, persistence, and replay contracts. Derived from server and client architecture evidence.

## Context Summary

### Project Files

* `apps/client/src/domain/tileGeometry.ts` - supported shape/material and transform contracts.
* `apps/client/src/domain/placementSolver.ts` - placement validation constraints.
* `apps/client/src/domain/quiltCache.ts` - revision monotonicity and operation deduplication.
* `apps/client/src/App.tsx` - existing placement orchestration and expected revision handling.
* `apps/server/src/index.ts` - protocol guards, `quilt_place_tile`, and payload budgets.
* `apps/server/src/db/repository.ts` - canonical placement persistence, snapshots, and replay.
* `apps/server/src/db/schema.ts` - patch operation and snapshot storage.
* `apps/server/src/domain/quiltTopology.ts` - patch dimensions and topology rules.
* `e2e/` - existing authenticated and reconnect test patterns.

### References

* `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` - primary research, selected hybrid approach, evidence, and weighted fidelity formula.
* `docs/canonical-quilt-data-storage.md` - canonical storage and synchronization model.
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - finite toroidal topology and dimension constraints.
* OpenCV CLAHE, denoising, and morphology references listed in the research file - offline preprocessing guidance.

### Standards References

* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md` - tracking artifact format and frontmatter conventions.
* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md` - concise, actionable planning prose.

## Implementation Checklist

### [ ] Implementation Phase 1: Source Pack And Contracts

<!-- parallelizable: false -->

* [ ] Create the licensed source manifest and normalized working-source contract.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 12-33)
* [ ] Define versioned patch manifests and validate supported tile contracts before network emission.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 34-53)

### [ ] Implementation Phase 2: Offline Hybrid Generator

<!-- parallelizable: false -->

* [ ] Implement deterministic CIELAB preprocessing, luminance normalization, denoising, and saliency masks.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 58-80)
* [ ] Generate fixed-grid tesserae with saliency-driven refinements and conflict-safe output.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 81-102)
* [ ] Produce machine-readable fidelity reports and acceptance thresholds.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 103-118)

### [ ] Implementation Phase 3: Client Importer

<!-- parallelizable: false -->

* [ ] Add payload parsing and preflight validation in a client domain module.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 123-140)
* [ ] Wire bounded, revision-safe import windows into the existing mutation orchestration.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 141-161)

### [ ] Implementation Phase 4: Server Persistence And Replay Verification

<!-- parallelizable: false -->

* [ ] Verify and test the unchanged socket-to-repository-to-snapshot path, with metadata conditional on current guards.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 166-191)

### [ ] Implementation Phase 5: Focused Tests And Acceptance Harness

<!-- parallelizable: false -->

* [ ] Add client, server, and end-to-end tests for deterministic import, retries, conflicts, budgets, persistence, and reconnect convergence.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 196-211)
* [ ] Add visual fidelity acceptance checks and retain reproducible score evidence.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 213-227)

### [ ] Implementation Phase 6: Final Validation

<!-- parallelizable: false -->

* [ ] Run full lint, build, unit test, focused Playwright, generated-artifact, and process-cleanup validation.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 233-243)
* [ ] Apply only minor isolated fixes and record protocol, schema, or algorithm blockers for follow-on planning.
  * Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Lines 245-247)

## Planning Log

See `.copilot-tracking/plans/logs/2026-08-06/alexander-mosaic-patch-log.md` for discrepancy tracking, implementation paths, and suggested follow-on work.

## Dependencies

* Licensed high-resolution source and reproducible offline image-processing toolchain.
* Existing client tile, placement, cache, and rendering contracts.
* Existing server Socket.IO mutation, topology, persistence, snapshot, and replay contracts.
* Node/npm workspace scripts and authenticated Playwright setup.

## Success Criteria

* One bounded Alexander mosaic patch is generated deterministically using only supported tile contracts. Traces to user requirements and research Preferred Approach.
* Import uses existing `quilt_place_tile`, expected patch revisions, ACK reconciliation, bounded retries, and deterministic conflict handling. Traces to research Implementation Patterns.
* Persistence, snapshots, replay, and reconnect converge without a new mutation protocol or v1 schema migration. Traces to research API and schema findings.
* Fidelity is measured with luminance MS-SSIM, EdgeF1, directional divergence, silhouette IoU, weighted score, and budget thresholds. Traces to research scoring form.
* Lint, build, unit, focused end-to-end, and visual acceptance checks are reproducible and documented. Traces to repository package scripts and research Recommended Next Steps.
