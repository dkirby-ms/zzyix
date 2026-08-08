<!-- markdownlint-disable-file -->
---
title: Alexander Mosaic Patch Implementation Review
description: Review of the Alexander Mosaic preprocessing and mosaic-input implementation against the approved plan and issue acceptance criteria
ms.date: 2026-08-07
ms.topic: review
---

## Review Metadata

* Related plan: `.copilot-tracking/plans/2026-08-06/alexander-mosaic-patch-plan.instructions.md`
* Research: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md`
* Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md`
* Changes log: Missing at `.copilot-tracking/changes/2026-08-06/alexander-mosaic-patch-changes.md`
* Review scope: Current Alexander Mosaic implementation commits and issue #159 acceptance criteria
* Review date: 2026-08-07

## Summary

Issue #159 status: **Pass with follow-on work assigned**.

The implemented preprocessing and derived palette/candidate stages are deterministic and pass focused and full repository validation. The broader patch plan is intentionally split across #160 through #164. The Alexander close-up now uses an explicit portrait output contract, preserves decoded pixel orientation, and enforces manifest-backed edge coverage for face, weapon, armour, and contour regions. Horse retention is deferred by product decision for this close-up source.

| Severity | Count |
|----------|------:|
| Critical | 0 |
| Major | 0 |
| Minor | 1 |

## Findings

### Resolved: Broader patch-plan work is assigned to follow-on issues

The current implementation stops at preprocessing plus palette and ranked candidate JSON. The plan requires patch manifests and tile payloads, client-side payload validation and import queues, existing `quilt_place_tile` integration, persistence/replay verification, fidelity reports, and focused importer/E2E tests. No matching `mosaicImport`, patch manifest, patch generator, fidelity scorer, or `quilt-mosaic-import` E2E artifact exists in the planned locations. This leaves the plan success criteria for schema-compatible placements, bounded revision-safe import, replay convergence, and measurable fidelity unimplemented.

Evidence:

* [alexander-mosaic-patch-details.md](../../details/2026-08-06/alexander-mosaic-patch-details.md) defines Steps 1.2 through 6.1 and their required files.
* [generate-alexander-mosaic-inputs.mjs](../../../scripts/generate-alexander-mosaic-inputs.mjs) emits palette and candidate inputs, not supported tile placements or a patch payload.
* Existing `quilt_place_tile` references remain in the pre-existing client/server code; no importer module or importer-specific tests were added.

Disposition: #160 owns patch-compatible tessera generation, #161 fidelity reports, #162 importer preflight, #163 revision-safe import windows, and #164 persistence/replay verification. These are not blockers for #159.

### Resolved: Close-up feature-retention contract

Horse retention is deferred for the Alexander close-up. The manifest and default pipeline now consistently target `face`, `weapon`, `armour`, and `contour`. The preprocessor enforces edge-retention thresholds for fixed output-space regions and records measured coverage in its generated config.

Evidence:

* [alexander-source-license-records.json](../../../offline/reference/alexander-source-license-records.json) records close-up target regions and thresholds.
* [preprocess-alexander-source.mjs](../../../scripts/preprocess-alexander-source.mjs) validates every configured target region before writing artifacts.
* Live regeneration recorded retained edge counts of 15,108 for face, 6,226 for weapon, 88,662 for armour, and 197,106 for contour.

Disposition: resolved for the selected close-up, with horse retention explicitly deferred.

### Resolved: Close-up output geometry

The selected Commons close-up is portrait-oriented at 2154 x 3232. The manifest and pipeline now declare an explicit 1077 x 1616 portrait output, which live regeneration records exactly.

Evidence:

* [alexander-source-license-records.json](../../../offline/reference/alexander-source-license-records.json) declares resize dimensions 1077 x 1616.
* [preprocess-alexander-source.mjs](../../../scripts/preprocess-alexander-source.mjs) uses the same dimensions.

Disposition: resolved.

### Resolved: Orientation contract

The manifest recipe records `honor-decoded-pixel-order-no-rotation`. Preprocessing no longer calls Sharp’s `.rotate()`, and an EXIF-orientation fixture verifies that decoded pixel dimensions are preserved.

Evidence:

* [alexander-source-license-records.json](../../../offline/reference/alexander-source-license-records.json) declares no rotation.
* [preprocess-alexander-source.mjs](../../../scripts/preprocess-alexander-source.mjs) preserves decoded pixel order.

Disposition: resolved.

### Deferred: Candidate truncation coverage belongs to issue #160

The candidate generator globally ranks cells and truncates to the configured count. It does not reserve coverage for face, weapon, horse, or contour regions, and the emitted candidate artifact contains no retention-target coverage report. A salient region can therefore be dropped even when its edge mask exists.

Evidence:

* [generate-alexander-mosaic-inputs.mjs](../../../scripts/generate-alexander-mosaic-inputs.mjs) ranks candidates globally and applies `.slice(0, pipeline.count)`.
* [alexander-source-license-records.json](../../../offline/reference/alexander-source-license-records.json) records retention targets but no target regions or coverage thresholds.

Disposition: #160 owns candidate-to-tessera coverage and conflict policy. Issue #159 now enforces preprocessing-level edge coverage for its required regions.

### Resolved: Preprocessing tests detect semantic feature loss

The preprocessing test checks face, weapon, armour, and contour regions individually. It also includes an EXIF-orientation fixture. The manifest verifier checks output-region bounds, per-region minimum edge thresholds, portrait dimensions, and the no-rotation recipe.

Evidence:

* [preprocess-alexander-source.test.mjs](../../../scripts/preprocess-alexander-source.test.mjs) asserts all four required feature regions.
* [verify-alexander-source-provenance.mjs](../../../scripts/verify-alexander-source-provenance.mjs) validates the feature-region and portrait-output contract.

Disposition: resolved for issue #159. Candidate coverage remains issue #160 work.

### Minor: Implementation traceability artifact is missing

The plan review workflow requires a changes log, but `.copilot-tracking/changes/2026-08-06/alexander-mosaic-patch-changes.md` is absent. This prevents direct mapping of implementation commits, deviations, and validation evidence to individual plan steps.

Recommendation: create the changes log before the next review or split the work into a smaller plan with a corresponding changes log.

## Phase Validation

| Plan phase | Status | Evidence |
|------------|--------|----------|
| Issue #159 preprocessing scope | Pass | CIELAB, deterministic normalization, LAB denoising, saliency/edge masks, provenance, feature coverage, and focused tests are present. |
| Issue #160 tessera generation | Deferred | Owns patch payload, supported placements, candidate coverage, and conflict resolution. |
| Issue #161 fidelity reports | Deferred | Owns fidelity metrics and release thresholds. |
| Issue #162 import preflight | Deferred | Owns client payload parsing and validation. |
| Issue #163 revision-safe import | Deferred | Owns bounded placement emission, retries, and reporting. |
| Issue #164 persistence/replay tests | Deferred | Owns server/reconnect verification. |

## Validation Commands

| Command | Result |
|---------|--------|
| `npm run lint` | Pass |
| `npm run build` | Pass, with existing Vite config-loader and large-chunk warnings |
| `npm test` | Pass: client 183 passed, 16 skipped; server 220 passed, 1 skipped |
| `npm run test:preprocess-alexander-source` | Pass |
| `npm run test:alexander-mosaic-inputs` | Pass |
| `npm run verify:alexander-source` | Pass |
| `npm run verify:alexander-source -- --live` | Pass in implementation validation context |
| `npm run preprocess:alexander-source -- --live` | Pass in implementation validation context |
| `npm run generate:alexander-mosaic-inputs` | Pass in implementation validation context |
| Live feature coverage | Pass: face 15,108; weapon 6,226; armour 88,662; contour 197,106 edge pixels |
| VS Code diagnostics on touched scripts/docs | No errors |

## Missing Work And Deviations

* The implementation uses Node and `sharp` rather than the plan’s specified Python/uv offline toolchain. This is a documented implementation deviation that is acceptable for issue #159’s preprocessing slice only if the plan is split or revised.
* Generated artifacts are intentionally ignored under `offline/output/`, so the review validates reproducibility through tests and live generation rather than committed binary artifacts.
* The source was changed from a full-scene image plus local crop to a separate Wikimedia Commons close-up. Horse retention is deliberately deferred; face, weapon, armour, and contour coverage are enforced.
* The portrait output and no-rotation contracts are explicit and validated.

## Follow-Up Recommendations

### Deferred from scope

* Implement issue #160 for patch manifests and supported tile-placement generation.
* Implement issue #161 for fidelity scoring.
* Implement issues #162 through #164 for importer, revision-safe placement, and persistence/replay verification.

### Discovered during review

* Add a changes log for the 2026-08-06 Alexander plan.
* Carry manifest feature regions into issue #160's candidate-to-tessera coverage policy.

## Overall Status

**Pass for issue #159**. No critical or major findings remain within the preprocessing scope. The remaining broader patch-plan work is assigned to issues #160 through #164; the missing changes log remains a minor traceability concern.
