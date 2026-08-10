---
title: Alexander Mosaic Pipeline Research
description: Research notes for Alexander the Great mosaic preprocessing and data generation pipeline for GitHub issue 155
author: GitHub Copilot
ms.date: 2026-08-09
ms.topic: research
---

## Research Topics

Topic: Existing Alexander the Great mosaic preprocessing/data generation pipeline and generated assets for GitHub issue 155.

Questions:

1. What scripts, tests, docs, and generated outputs already exist for Alexander mosaic source verification, preprocessing, and mosaic input generation?
2. What inputs/outputs and data shapes do these scripts produce? Include exact workspace-relative paths and line ranges where possible.
3. What commands or tests validate the pipeline today?
4. What evidence suggests the pipeline is complete vs partial/stale?
5. What remaining work is implied specifically for data generation and asset provenance?

## Findings

### Existing pipeline inventory

The Alexander mosaic pipeline exists as a provenance verifier plus two offline
generation stages.

* `scripts/verify-alexander-source-provenance.mjs:1-135` validates the source
  manifest, Wikimedia origin, public-domain reuse terms, checksums, crop bounds,
  normalized working-source recipe, preprocessing metadata, mosaic-input
  metadata, runtime-bundle exclusion, and optional live SHA-256 and byte-length
  checks.
* `scripts/preprocess-alexander-source.mjs:1-424` downloads or reads the source
  image, verifies SHA-256, decodes and resizes the source, converts sRGB to
  CIELAB, normalizes luminance, applies deterministic bilateral LAB denoising,
  creates saliency and edge masks, enforces feature-region edge coverage, and
  writes preprocessing artifacts.
* `scripts/generate-alexander-mosaic-inputs.mjs:1-459` reads the preprocessing
  config and generated artifacts, derives a weighted CIELAB palette, ranks
  tile-candidate cells by edge density, saliency, and contrast, assigns nearest
  palette colors, and writes mosaic-input JSON artifacts.
* `scripts/preprocess-alexander-source.test.mjs:1-190` covers deterministic
  synthetic preprocessing, LAB byte shape, feature-edge retention, config
  repeatability, and decoded-pixel orientation preservation.
* `scripts/generate-alexander-mosaic-inputs.test.mjs:1-151` covers deterministic
  palette and candidate generation from synthetic preprocessing artifacts.
* `offline/reference/alexander-source-license-records.json:1-180` is the source
  provenance manifest and pipeline contract. It records source identity,
  dimensions, byte length, SHA-1, SHA-256, crop, normalized working-source
  recipe, preprocessing outputs, feature retention regions, and mosaic-input
  output names.
* `offline/reference/README.md:8-66` documents provenance, runtime-bundle
  exclusion, local and live verification, live preprocessing, feature retention,
  and downstream mosaic-input generation.
* `package.json:48-52` exposes the five direct pipeline commands, and
  `package.json:68` records `sharp` as the image IO dependency.
* `.gitignore:7` excludes `/offline/output/`, so generated working artifacts
  are intentionally present outside source control.

Generated outputs are present in the current workspace:

* `offline/output/alexander-preprocessed/alexander-normalized-master.png`
* `offline/output/alexander-preprocessed/alexander-cielab-float32.bin`
* `offline/output/alexander-preprocessed/alexander-luminance-normalized.png`
* `offline/output/alexander-preprocessed/alexander-denoised-preview.png`
* `offline/output/alexander-preprocessed/alexander-saliency-mask.png`
* `offline/output/alexander-preprocessed/alexander-edge-mask.png`
* `offline/output/alexander-preprocessed/alexander-preprocessing-config.json`
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-palette.json`
* `offline/output/alexander-mosaic-inputs/alexander-tile-candidates.json`
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json`

### Inputs, outputs, and data shapes

The source manifest defines one primary benchmark image:

* `offline/reference/alexander-source-license-records.json:21-47` records image
  id `alexander-mosaic-primary`, Wikimedia source page, immutable upload URL,
  MIME type `image/jpeg`, dimensions 2154 x 3232, byte length 3,377,658,
  Commons SHA-1, and SHA-256
  `6c3731140a79698818db392e7a0a1985a56dad1fbf034552bd214dd14fd4397b`.
* `offline/reference/alexander-source-license-records.json:49-56` records a
  full-image crop with x 0, y 0, width 2154, and height 3232.
* `offline/reference/alexander-source-license-records.json:58-99` records the
  normalized working-source recipe: download, SHA-256 verification, full crop,
  decoded-pixel-order orientation, sRGB conversion, Lanczos3 resize to 1077 x
  1616, and PNG encoding.

Preprocessing accepts the manifest source image by `--live` download or local
`--source` path:

* `scripts/preprocess-alexander-source.mjs:76-101` parses `--live`, `--source`,
  `--output`, `--manifest`, and `--image-id`.
* `scripts/preprocess-alexander-source.mjs:124-141` reads a local source or
  downloads the manifest `originalUrl` and verifies source SHA-256.
* `scripts/preprocess-alexander-source.mjs:143-182` derives the target resize
  and crop from the manifest recipe, decodes through `sharp`, removes alpha,
  converts to sRGB, and returns raw RGB with width, height, and channel count.
* `scripts/preprocess-alexander-source.mjs:184-219` converts every sRGB pixel
  to CIELAB-D65 and emits a `Float32Array` with three float32 values per pixel.
* `scripts/preprocess-alexander-source.mjs:221-259` applies deterministic L*
  percentile normalization and produces an 8-bit grayscale luminance buffer.
* `scripts/preprocess-alexander-source.mjs:261-333` applies bilateral LAB
  denoising while preserving normalized luminance.
* `scripts/preprocess-alexander-source.mjs:366-389` calculates per-feature
  edge counts and saliency means, and fails generation when a configured region
  falls below its minimum edge-pixel threshold.
* `scripts/preprocess-alexander-source.mjs:403-424` writes six artifacts plus
  `alexander-preprocessing-config.json`.

The generated preprocessing config records the current run shape:

* `offline/output/alexander-preprocessed/alexander-preprocessing-config.json:1-38`
  records preprocessing artifact paths, byte sizes, and SHA-256 values.
* `offline/output/alexander-preprocessed/alexander-preprocessing-config.json:40-80`
  records edge threshold, feature coverage for face, weapon, armour, and
  contour, output width 1077, height 1616, and luminance percentiles.
* `offline/output/alexander-preprocessed/alexander-preprocessing-config.json:82-134`
  records the deterministic pipeline parameters and generator seed
  `alexander-mosaic-preprocess-v1`.
* `offline/output/alexander-preprocessed/alexander-preprocessing-config.json:135-140`
  records source byte length, expected SHA-256, image id, and actual source
  SHA-256.
* The LAB artifact is 20,885,184 bytes, matching 1077 x 1616 x 3 x 4 bytes.

Mosaic-input generation consumes the preprocessing config:

* `scripts/generate-alexander-mosaic-inputs.mjs:52-82` parses `--input`,
  `--output`, `--palette-size`, and `--candidate-count`.
* `scripts/generate-alexander-mosaic-inputs.mjs:94-113` reads the LAB float32
  artifact and image-mask PNG artifacts, verifying width and height against
  the preprocessing config.
* `scripts/generate-alexander-mosaic-inputs.mjs:152-228` bins LAB pixels and
  selects a weighted, diverse palette with saliency and edge weighting.
* `scripts/generate-alexander-mosaic-inputs.mjs:230-347` ranks source-space
  cells by edge density, saliency mean, and luminance range, assigns nearest
  palette color, sorts by score, and truncates to the configured count.
* `scripts/generate-alexander-mosaic-inputs.mjs:360-423` writes palette,
  candidates, and generator config JSON.

The generated mosaic-input config and JSON artifacts record the current run
shape:

* `offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json:1-18`
  records the palette and candidate artifact paths, byte sizes, and SHA-256
  values.
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json:20-26`
  records output width 1077, height 1616, palette size 24, and candidate count
  760.
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json:28-40`
  records candidate and palette generation parameters and generator seed
  `alexander-mosaic-inputs-v1`.
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json:42-45`
  records source image id, preprocessing config path, and preprocessing config
  SHA-256 `f261deac833975efdefe4b818adc65689ced42b8c39e725a6ff35ee617c95712`.
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-palette.json:1-439`
  contains 24 palette entries. Each entry has id, hex, RGB, LAB, weight,
  source pixel count, saliency mean, and edge-pixel count, followed by
  `sourceImageId`.
* `offline/output/alexander-mosaic-inputs/alexander-tile-candidates.json:1-16731`
  contains 760 ranked candidates. Each candidate has id, box, anchor, score,
  edge density, edge-pixel count, saliency mean, luminance mean, luminance
  range, nearest palette id, palette hex, and Delta E. The file ends with a
  1077 x 1616 `preprocessed-source-pixel` coordinate space and source image id.

### Validation commands and current results

The repository exposes these direct validations:

```bash
npm run verify:alexander-source
npm run verify:alexander-source -- --live
npm run test:preprocess-alexander-source
npm run test:alexander-mosaic-inputs
```

The repository exposes these generation commands:

```bash
npm run preprocess:alexander-source -- --live
npm run generate:alexander-mosaic-inputs
```

Current non-live validation run on 2026-08-09:

```text
npm run verify:alexander-source
Verified 1 Alexander Mosaic source record.

npm run test:preprocess-alexander-source
tests 2, pass 2, fail 0

npm run test:alexander-mosaic-inputs
tests 1, pass 1, fail 0
```

The current generated output tree is ignored by Git:

```text
git status --short --ignored offline/output
!! offline/output/
```

Current generated JSON hashes checked on 2026-08-09:

```text
f261deac833975efdefe4b818adc65689ced42b8c39e725a6ff35ee617c95712  offline/output/alexander-preprocessed/alexander-preprocessing-config.json
95df0852dd9beb4c0d49becad9b57b0a01f315839bf0f436c441688bbe891cc6  offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json
2962b77cf2ab13a211169febc19bb1ba78fc3c4db803e000c5bc48190519f4b1  offline/output/alexander-mosaic-inputs/alexander-mosaic-palette.json
f1213ac07cee54db735ab0f4f7a641ce3a68e0dc96733a02dcf652b4d8142f5a  offline/output/alexander-mosaic-inputs/alexander-tile-candidates.json
```

### Complete versus partial or stale evidence

Evidence that the current preprocessing and mosaic-input stages are complete:

* The source provenance manifest is internally validated by
  `scripts/verify-alexander-source-provenance.mjs:24-135` and passed locally.
* The preprocessor writes every manifest-listed preprocessing artifact and
  records hashes, byte sizes, output dimensions, luminance percentiles, edge
  threshold, feature coverage, and pipeline parameters in the generated config.
* Feature coverage in
  `offline/output/alexander-preprocessed/alexander-preprocessing-config.json:40-80`
  exceeds manifest thresholds by wide margins: face 15,108, weapon 6,226,
  armour 88,662, and contour 197,106 edge pixels.
* The mosaic-input generator writes real palette and candidate JSON, records
  source preprocessing config SHA-256, and produced 24 palette colors plus 760
  candidates in the current generated output.
* Focused tests passed during this research session and cover deterministic
  repeatability, expected artifact shapes, feature retention, orientation, and
  palette/candidate structure.
* `.copilot-tracking/reviews/2026-08-07/alexander-mosaic-patch-plan-review.md:11-151`
  records a previous review pass for issue #159 and explicitly marks
  preprocessing plus palette/candidate generation as complete, with broader
  patch/import work deferred.

Evidence that broader issue 155 work remains partial or that some generated
asset provenance is incomplete:

* The current generator stops at palette and ranked candidate inputs. It does
  not emit a patch manifest, supported tile-placement payload, tessera geometry,
  or fidelity report. The prior review records this boundary in
  `.copilot-tracking/reviews/2026-08-07/alexander-mosaic-patch-plan-review.md:34-42`.
* `.copilot-tracking/reviews/rpi/2026-08-07/alexander-mosaic-patch-plan-001-validation.md:20-25`
  records missing patch manifest, payload, client importer, fidelity scorer,
  and E2E importer validation.
* `scripts/generate-alexander-mosaic-inputs.mjs:342-347` globally sorts and
  truncates candidates. The generated candidate artifact has no per-feature
  coverage report proving that face, weapon, armour, and contour remain
  represented after truncation.
* `offline/reference/alexander-source-license-records.json:58` records the
  normalized working source expected path as `offline/output/alexander-normalized-master.png`,
  while the actual preprocessing artifact path is
  `offline/output/alexander-preprocessed/alexander-normalized-master.png` in
  `offline/output/alexander-preprocessed/alexander-preprocessing-config.json:27-30`.
  Both paths are non-runtime output locations, but the mismatch should be
  resolved or documented for asset provenance.
* Generated configs do not persist a hash for themselves inside a separate
  committed run manifest. The script returns `configArtifact` at runtime, but
  the ignored output directory is the only place where generated config files
  currently live.
* `.copilot-tracking/memory/2026-08-07/deterministic-source-preprocessing-memory.md:103-104`
  records an older generated run with 676 ranked tile candidates. The current
  generated config records 760 candidates. This is not a runtime failure, but
  it shows prior notes are stale relative to current ignored outputs.

### Remaining data generation and asset provenance work

The remaining work implied specifically for data generation and provenance is:

* Add a read-only generated-artifact verifier that validates the current
  `offline/output/alexander-preprocessed/` and
  `offline/output/alexander-mosaic-inputs/` artifact hashes, dimensions, counts,
  and source/config links without requiring a live download or regeneration.
* Persist a small generated-run manifest, or document an equivalent policy, so
  ignored generated outputs can be audited by hash and regenerated by command.
* Resolve or document the normalized working-source path mismatch between the
  source manifest and the actual preprocessing output directory.
* Add candidate-level feature coverage reporting so generated candidates can be
  checked against the manifest retention regions after global ranking and
  truncation.
* Document generated artifact schemas and intended downstream consumers under
  `offline/`, including LAB byte encoding, PNG mask channel behavior, palette
  entry shape, candidate entry shape, and coordinate space.
* Continue issue #160-style data generation for patch manifests, supported
  tile payloads, tessera assignment, conflict policy, and downstream fidelity
  artifacts before issue 155 can be called complete beyond preprocessing inputs.

## Evidence

Primary evidence reviewed:

* `package.json:48-52`, `package.json:68`
* `.gitignore:7`
* `offline/reference/README.md:8-66`
* `offline/reference/alexander-source-license-records.json:1-180`
* `scripts/verify-alexander-source-provenance.mjs:1-135`
* `scripts/preprocess-alexander-source.mjs:1-424`
* `scripts/generate-alexander-mosaic-inputs.mjs:1-459`
* `scripts/preprocess-alexander-source.test.mjs:1-190`
* `scripts/generate-alexander-mosaic-inputs.test.mjs:1-151`
* `offline/output/alexander-preprocessed/alexander-preprocessing-config.json:1-140`
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json:1-45`
* `offline/output/alexander-mosaic-inputs/alexander-mosaic-palette.json:1-439`
* `offline/output/alexander-mosaic-inputs/alexander-tile-candidates.json:1-16731`
* `.copilot-tracking/reviews/2026-08-07/alexander-mosaic-patch-plan-review.md:11-151`
* `.copilot-tracking/reviews/rpi/2026-08-07/alexander-mosaic-patch-plan-001-validation.md:20-25`
* `.copilot-tracking/memory/2026-08-07/deterministic-source-preprocessing-memory.md:103-104`

Validation executed during this research:

* `npm run verify:alexander-source` passed.
* `npm run test:preprocess-alexander-source` passed with 2 tests.
* `npm run test:alexander-mosaic-inputs` passed with 1 test.
* `git status --short --ignored offline/output` reported `!! offline/output/`.
* `sha256sum` confirmed current generated JSON artifact hashes.

## Follow-On Questions

* Should ignored generated outputs remain purely ephemeral, or should the repo
  add a committed generated-run manifest with hashes for reproducibility review?
* Should `offline/reference/alexander-source-license-records.json` continue to
  record the normalized working source at `offline/output/alexander-normalized-master.png`,
  or should it be updated to the actual preprocessing output directory?
* What minimum candidate coverage should issue #160 require for face, weapon,
  armour, and contour after candidate truncation?

## Clarifying Questions

* Is GitHub issue 155 expected to treat preprocessing and mosaic-input JSON as
  complete deliverables for a sub-issue only, or should they be wired directly
  into the autonomous app/agent flow before closing issue 155?
* Should the final provenance policy allow generated source derivatives under
  ignored `offline/output/` only, or should selected non-source generated assets
  be committed once they are small JSON artifacts?