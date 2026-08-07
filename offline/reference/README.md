---
title: Alexander Mosaic Source Provenance
description: Provenance manifest and verification notes for the Alexander Mosaic benchmark source image
ms.date: 2026-08-07
ms.topic: reference
---

## Alexander Mosaic Source Provenance

The Alexander Mosaic benchmark uses a Wikimedia Commons file marked Public domain:
`Battle_of_Issos_MAN_Napoli_Inv10020_n01.jpg`. The manifest records the source
page, original file URL, reuse terms, attribution metadata, retrieval date, crop,
and checksums.

The underlying artwork is the ancient Alexander Mosaic from the House of the
Faun, Pompeii. It is outside copyright term as an ancient artwork. The selected
photographic source file is also listed as Public domain by Wikimedia Commons,
so it avoids ShareAlike obligations for generator input.

Source image bytes are intentionally not stored in the client or server runtime
bundle. Generated working sources belong under `offline/output/` or another
non-runtime path and must be reproducible from
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