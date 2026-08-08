---
title: Alexander Mosaic Patch Plan Phase Validation
description: Validation of commits 587bb98 and 85a6d0a against the Alexander Mosaic Patch implementation plan, details, and research
ms.date: 2026-08-07
ms.topic: review
---

## Scope

* Plan: `.copilot-tracking/plans/2026-08-06/alexander-mosaic-patch-plan.instructions.md`
* Details: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md`
* Research: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md`
* Commits: `587bb98`, `85a6d0a`
* Changes log: Missing at `.copilot-tracking/changes/2026-08-06/alexander-mosaic-patch-changes.md`

## Findings

### Major: Full patch implementation is missing

* Phase 1, Step 1.2 requires a versioned patch manifest, deterministic tile payload, and client contract validation. No `offline/output/patch-manifest.json`, patch payload, or `apps/client/src/domain/mosaicImport.ts` exists.
* Phase 2, Steps 2.2 and 2.3 require fixed-grid supported tessera placements, saliency refinements, and machine-readable fidelity scoring. The current generator emits palette and ranked tile-candidate JSON only in `scripts/generate-alexander-mosaic-inputs.mjs`; no `offline/generator/generate_patch.py` or `offline/validation/score_alexander_patch.py` exists.
* Phase 3 requires bounded, revision-safe import through `quilt_place_tile`; no importer module or importer tests were added.
* Phase 4 requires Alexander-specific persistence and replay verification; no such verification was added.
* Phase 5 requires importer, E2E reconnect, and visual acceptance coverage; `e2e/quilt-mosaic-import.spec.ts` does not exist.
* Phase 6 cannot execute its planned fidelity and importer E2E commands because those artifacts are absent.

Evidence: [implementation details](../../details/2026-08-06/alexander-mosaic-patch-details.md) defines the missing steps and files; [generate-alexander-mosaic-inputs.mjs](../../../scripts/generate-alexander-mosaic-inputs.mjs) produces input candidates rather than patch-compatible placements.

### Major: Issue #159 acceptance coverage regressed with the close-up source

The manifest selects an Alexander-only close-up and declares retention targets `face`, `helmet`, `armour`, and `contour`, while issue #159 requires retention of face, weapon, horse, and contour edges. The preprocessing script still defaults to `face`, `weapon`, `horse`, and `contour`, creating a disagreement between the manifest contract and generator configuration. The verifier checks the metadata list but does not verify semantic or visual retention in generated masks.

Evidence: [source manifest](../../../offline/reference/alexander-source-license-records.json) records the close-up and changed targets; [preprocess-alexander-source.mjs](../../../scripts/preprocess-alexander-source.mjs) retains the prior target list; [verify-alexander-source-provenance.mjs](../../../scripts/verify-alexander-source-provenance.mjs) validates labels and hashes but not feature presence.

### Minor: Changes-log traceability is unavailable

The plan's `applyTo` target changes log is absent, so the commits cannot be mapped to each checklist item through the required implementation handoff. The current commits provide focused tests and provenance evidence, but not a plan-scoped completion record.

## Phase Assessment

| Phase | Status | Assessment |
|---|---|---|
| 1. Source Pack And Contracts | Partial | Provenance and preprocessing metadata exist. Patch manifest, payload, and runtime tile contract validation are missing. |
| 2. Offline Hybrid Generator | Partial | Deterministic CIELAB, luminance, denoising, saliency, palette, and candidate stages exist. Supported tessera placement generation and fidelity scoring are missing. |
| 3. Client Importer | Failed | No importer parser, preflight validator, bounded queue, retry policy, or importer tests exist. |
| 4. Server Persistence And Replay Verification | Failed | No Alexander import persistence, snapshot, replay, or reconnect verification was added. |
| 5. Focused Tests And Acceptance Harness | Partial | Focused preprocessing and candidate-generator tests pass. Importer, E2E, payload-budget, and visual fidelity acceptance tests are missing. |
| 6. Final Validation | Partial | Existing focused checks pass, but the plan's fidelity and importer E2E validation cannot run. |

## Checks Run

* `npm run test:preprocess-alexander-source`: passed.
* `npm run test:alexander-mosaic-inputs`: passed.
* `npm run verify:alexander-source`: passed.
* Planned patch-generation, fidelity, and importer E2E checks: not runnable because required artifacts are missing.

## Coverage

Overall status: **Partial**. The two commits satisfy a deterministic preprocessing and derived-input sub-slice, not the approved six-phase Alexander Mosaic Patch plan. The implementation should not be reported as complete until patch payload generation, client import, persistence/replay verification, fidelity evidence, and E2E acceptance are implemented.

## Recommended Next Validations

* Validate a real patch manifest and payload against the client tile and server topology contracts.
* Exercise bounded `quilt_place_tile` import with stale revisions, conflicts, ACK reconciliation, and payload budgets.
* Reconnect after import and compare snapshot/replay state with the clean import result.
* Add a semantic or visual edge-retention check proving the issue #159 face, weapon, horse, and contour criteria.
* Record the completed scope and deviations in `.copilot-tracking/changes/2026-08-06/alexander-mosaic-patch-changes.md`.

## Clarifying Questions

* Is issue #159 intended to be narrowed to the Alexander close-up, or must the source and acceptance evidence retain weapon and horse features as originally specified?
* Should the current preprocessing and candidate work be split into a completed sub-plan with the remaining patch/import/fidelity work tracked separately?
