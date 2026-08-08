<!-- markdownlint-disable-file -->
# Memory: deterministic-source-preprocessing

**Created:** 2026-08-07T08:35:02-05:00 | **Last Updated:** 2026-08-07T08:46:14-05:00

## Task Overview

Implement GitHub issue #159, `feat(mosaic): implement deterministic source preprocessing pipeline`, using the RPI prompt flow. Success criteria: convert the selected Alexander Mosaic source into deterministic CIELAB, luminance normalization, edge-preserving denoising, saliency or edge mask artifacts; record color space, normalization, denoising, saliency parameters, and generator seed; retain face, weapon, horse, and contour edges for downstream recognizable mosaic generation.

All durable session state for checkpointing is managed through `.copilot-tracking/memory/`. No RPI planning files were created during implementation because the change stayed localized and did not require persistent orchestration artifacts.

## Current State

Completed implementation appears present in the workspace, and `git status --short` returned no output at checkpoint time, so the worktree was clean after the previous implementation turn.

Files and artifacts from the completed work:

* `scripts/preprocess-alexander-source.mjs` - deterministic source preprocessor for live or local Alexander source images
* `scripts/preprocess-alexander-source.test.mjs` - synthetic image regression test for deterministic LAB, denoising, saliency, edge, and config outputs
* `scripts/verify-alexander-source-provenance.mjs` - extended provenance verifier for preprocessing metadata
* `offline/reference/alexander-source-license-records.json` - manifest now records preprocessing script, config path, artifact names, required config fields, and edge-retention targets
* `offline/reference/README.md` - documents preprocessing command and output behavior
* `package.json` - includes `preprocess:alexander-source` and `test:preprocess-alexander-source` scripts plus `sharp` dev dependency
* `package-lock.json` - updated dependency lock for `sharp`
* `.gitignore` - excludes generated `offline/output/`
* `scripts/generate-alexander-mosaic-inputs.mjs` - deterministic palette and tile-candidate generator from preprocessing artifacts
* `scripts/generate-alexander-mosaic-inputs.test.mjs` - synthetic regression test for repeatable palette and candidate artifacts
* `offline/output/alexander-mosaic-inputs/` - ignored generated palette, tile candidate, and generator config outputs from the current Alexander preprocessing run

Tracking artifacts for this session:

| Artifact | Percent Complete |
|----------|------------------|
| `.copilot-tracking/memory/2026-08-07/deterministic-source-preprocessing-memory.md` | 100% |

Most recent RPI phase before checkpoint: Phase 5, Discover. Completed steps: implemented follow-up items 1 and 2, validated generator behavior, inspected generated output, and revised next work. In-progress step: none. Remaining steps in phase: none.

## Important Discoveries

* **Decision:** Use `sharp` as a root dev dependency for deterministic image IO while keeping LAB conversion, percentile luminance normalization, bilateral denoising, and masks in plain Node code - this avoided hand-rolling image decoding/PNG encoding while preserving deterministic algorithm control.
* **Decision:** Keep generated image and binary artifacts under `offline/output/` and ignore that directory - this matches the existing manifest policy that source and generated working files stay out of runtime bundles.
* **Decision:** Validate determinism with a synthetic Alexander-like test image instead of checking in source bytes - this covers repeatability and edge retention without committing large or policy-sensitive image assets.
* **Decision:** Extend the provenance manifest and verifier to record the preprocessing contract - this ensures the required configuration metadata is discoverable even though generated output is ignored.
* **Failed Approaches:** Initial config artifact logic tried to include the config artifact hash inside the config itself, creating a self-hashing problem. Fixed by storing the config artifact metadata separately as `configArtifact` rather than inside `output.artifacts`.
* **Failed Approaches:** Initial mask generation used `Math.max(...scores)`, which could overflow the call stack on full-size images. Fixed with an iterative `maxValue` helper.
* **Decision:** Treat preprocessing config as the handoff boundary for downstream mosaic inputs. The palette and tile-candidate generator consumes LAB, luminance, saliency, and edge artifacts instead of re-decoding the source image.
* **Decision:** Palette extraction uses weighted CIELAB bin selection with saliency and edge weighting, then enforces color diversity by Delta E before filling from remaining source-derived bins.
* **Decision:** Tile candidates are ranked source-space cells using edge density, saliency mean, and luminance contrast, with each candidate assigned to its nearest derived palette color.
* **Failed Approaches:** The generator initially assumed grayscale PNG artifacts decode as one channel. `sharp` returned three channels for these PNGs in this environment, so the mask reader now collapses multi-channel grayscale deterministically to the first channel.
* **Failed Approaches:** The synthetic test initially required the requested palette size exactly. Simple sources may contain fewer distinct LAB bins, so the test now verifies deterministic source-derived output without inventing colors.
* **Failed Approaches:** The synthetic test compared generator config hashes across different output directories. That was path-sensitive, so the test now compares palette and candidate artifact hashes plus structural config fields.

Most recent Phase 4 review findings:

* **PASS:** Focused synthetic preprocessor test passed after implementation and after local repairs.
* **PASS:** Live preprocessing run downloaded the Alexander source, verified SHA-256, and generated ignored artifacts under `offline/output/alexander-preprocessed/`.
* **PASS:** Provenance verification passed locally and with `--live` after adding preprocessing metadata checks.
* **PASS:** VS Code diagnostics reported no errors in touched script/docs files.
* **PASS:** Ports `3001` and `5173` had no listeners at completion.
* **RESIDUAL RISK:** `npm install --save-dev sharp` reported existing audit findings: 5 moderate and 3 high vulnerabilities. No audit remediation was attempted because it was outside issue #159.
* **PASS:** `npm run test:alexander-mosaic-inputs` passed after the downstream generator was added and repaired.
* **PASS:** `npm run generate:alexander-mosaic-inputs` passed against the current ignored Alexander preprocessing outputs, generating 24 palette colors and 676 ranked tile candidates.
* **PASS:** `npm run test:preprocess-alexander-source` and `npm run verify:alexander-source` still passed after adding mosaic input metadata.
* **PASS:** VS Code diagnostics reported no errors in the new generator, generator test, updated verifier, and README.

## Next Steps

1. Artifact Verification Command - add a verifier that checks generated preprocessing and mosaic input artifact hashes against recorded run manifests without requiring regeneration. Priority: High.
2. Tile Shape Assignment - map tile candidates to the client tile shape catalog using local edge orientation, luminance contrast, and palette distance. Priority: High.
3. Mosaic Plan Preview - generate a small static preview image or JSON summary that visualizes top-ranked candidate coverage before client integration. Priority: Medium.
4. Offline Output README - document generated artifact formats, dimensions, and intended downstream consumers under `offline/`. Priority: Medium.

## Context to Preserve

* **Sources:** GitHub issue #159 supplied the feature request and acceptance criteria for deterministic source preprocessing.
* **Sources:** `offline/reference/alexander-source-license-records.json` established the Alexander source provenance, source URL, SHA-256, normalized working source recipe, and runtime bundle exclusion policy.
* **Sources:** `scripts/verify-alexander-source-provenance.mjs` was the owning validation path for Alexander source metadata before preprocessing was added.
* **Validation:** `npm run test:preprocess-alexander-source` passed.
* **Validation:** `npm run preprocess:alexander-source -- --live` passed and generated ignored outputs.
* **Validation:** `npm run verify:alexander-source` passed.
* **Validation:** `npm run verify:alexander-source -- --live` passed.
* **Validation:** `npm run test:alexander-mosaic-inputs` passed.
* **Validation:** `npm run generate:alexander-mosaic-inputs` passed.
* **Generated Output:** Current ignored Alexander mosaic inputs contain 24 palette colors and 676 ranked tile candidates.
* **Validation:** `lsof -i :3001` and `lsof -i :5173` returned no output at completion.
* **Agents:** No custom implementation subagents were invoked during the implementation turn.
* **Questions:** Confirm whether to continue with next work item 1, 2, 3, or 4 from the revised RPI Discover list.
