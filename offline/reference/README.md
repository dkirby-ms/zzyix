---
title: Alexander Mosaic Source Provenance
description: Provenance manifest and verification notes for the Alexander Mosaic benchmark source image
ms.date: 2026-08-07
ms.topic: reference
---

## Alexander Mosaic Source Provenance

The Alexander Mosaic benchmark uses the Wikimedia Commons close-up file marked
Public domain: `Alexander_Mosaic_detail_of_Alexander_the_Great.jpg`. The manifest
records the source page, original file URL, reuse terms, attribution metadata,
retrieval date, and checksums.

The underlying artwork is the ancient Alexander Mosaic from the House of the
Faun, Pompeii. It is outside copyright term as an ancient artwork. The selected
photographic source file is also listed as Public domain by Wikimedia Commons,
so it avoids ShareAlike obligations for generator input.

Source image bytes are intentionally not stored in the client or server runtime
bundle. The reproducible working source uses the full Wikimedia Commons close-up
of Alexander, without applying a local crop. Generated working sources belong
under `offline/output/` or another non-runtime path and must be reproducible from
`offline/reference/alexander-source-license-records.json`.

## Verification

Run the local manifest checks:

```bash
npm run verify:alexander-source
```

Run the live checksum check when network access is available:

```bash
npm run verify:alexander-source -- --live
```

The live check downloads the original source URL and verifies the recorded
SHA-256. It does not write image bytes to the workspace.

## Preprocessing

Generate deterministic preprocessing artifacts from the manifest source:

```bash
npm run preprocess:alexander-source -- --live
```

The preprocessor verifies the source SHA-256, converts the decoded sRGB pixels to
CIELAB, normalizes luminance with a fixed percentile stretch, applies a
deterministic bilateral LAB denoising pass, and emits saliency and edge masks for
recognition-critical face, helmet, armour, and contour features. Generated files
are written under `offline/output/` and are excluded from source control.

Generate the downstream palette and tile-candidate inputs from those
preprocessing artifacts:

```bash
npm run generate:alexander-mosaic-inputs
```

The generator reads the LAB, luminance, saliency, and edge artifacts, derives a
weighted source palette in CIELAB space, and ranks tile candidate cells by edge
density, saliency, and luminance contrast.