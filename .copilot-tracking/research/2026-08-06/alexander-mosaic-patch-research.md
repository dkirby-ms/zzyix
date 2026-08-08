<!-- markdownlint-disable-file -->
# Task Research: Alexander Mosaic Patch Recreation

Research how to build a system in this repository that can faithfully recreate famous ancient mosaics inside the app, using the Alexander the Great (House of the Faun) mosaic as the initial reference target.

## Task Implementation Requests

* Define a programmatic pipeline that reconstructs the Alexander mosaic into patch-compatible tile placements.
* Map the pipeline onto existing client/server architecture without introducing a new mutation protocol.
* Specify fidelity controls and validation metrics to measure historical faithfulness.
* Recommend one approach for implementation now, with alternatives and reasons for rejection.

## Scope and Success Criteria

* Scope: End-to-end research for source acquisition, preprocessing, tessera generation, patch encoding, import execution, persistence, replay, and fidelity evaluation for one target patch or bounded patch set.
* Assumptions:
  * The app already supports quilt-like patch rendering and networked persistence primitives.
  * A high-resolution source image with clear reuse rights can be obtained (for example, Wikimedia Commons with per-file verification).
  * First release targets deterministic import into existing shape/material contracts.
  * Variable polygon tessera runtime rendering is not required for v1.
* Success Criteria:
  * Identify exact integration points in apps/client/src and apps/server/src with file-level evidence.
  * Define a schema-compatible payload strategy that works with quilt_place_tile and revision checks.
  * Define measurable fidelity metrics and acceptance thresholds for Alexander-mosaic recognizability.
  * Produce one selected implementation approach with phased rollout and risk controls.

## Outline

1. Inspect current patch/quilt model, render path, and mutation protocol.
2. Inspect server persistence and synchronization constraints.
3. Evaluate reconstruction algorithms for ancient-mosaic faithfulness.
4. Select one implementation scenario and map to concrete repository touchpoints.
5. Provide step-by-step implementation and validation plan.

## Potential Next Research

* Determine whether v2 should expose optional tessera metadata in snapshot payloads.
  * Reasoning: Metadata is currently safest in patch operation payload, but snapshot projection may be required for immediate client use.
  * Reference: apps/server/src/db/repository.ts:1233, apps/server/src/index.ts:635.
* Benchmark importer throughput with controlled in-flight placement windows.
  * Reasoning: Current protocol is revision-safe but per-tile sequencing may bottleneck large imports.
  * Reference: apps/client/src/App.tsx:1069-1140, apps/server/src/index.ts:2234-2274.
* Define canonical color contract policy.
  * Reasoning: Server stores color as text; deterministic rendering and reproducibility improve with canonical format.
  * Reference: apps/server/src/contracts.ts:338, apps/client/src/ui/TilePalette.tsx:47-80.

## Research Executed

### File Analysis

* apps/client/src/domain/tileGeometry.ts
  * Tile shape/material unions, transform primitives, and geometry behavior define import constraints.
* apps/client/src/domain/quiltCache.ts
  * Patch-scoped snapshots, revision monotonicity, and op-seq dedupe govern convergence.
* apps/client/src/App.tsx
  * Existing place/remove event flow and expectedPatchRevisions are reusable for import.
* apps/client/src/render/MosaicScene.tsx
  * Rendering hotspots, periodic image expansion, and scene metrics identify performance risk.
* apps/server/src/index.ts
  * Socket protocol v2 handlers, payload guards, and snapshot budget constraints.
* apps/server/src/db/repository.ts
  * Canonical transaction path for placement persistence and patch revision increments.
* apps/server/src/db/schema.ts and apps/server/migrations/*.sql
  * Canonical quilt schema, topology checks, patch operation durability, and shape evolution.
* docs/canonical-quilt-data-storage.md
  * Canonical storage architecture and synchronization model.
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md
  * Topology and dimensions constraints relevant for import mapping.

### Code Search Results

* quilt_place_tile
  * apps/client/src/App.tsx:1069-1140
  * apps/server/src/index.ts:1907-1974
* expectedPatchRevisions
  * apps/client/src/App.tsx:310-314, 947-969, 1095-1136
* patch_operations and patch_snapshots
  * apps/server/src/db/schema.ts:495-549
  * apps/server/src/db/repository.ts:1937-1977, 3658
* periodic image and seam handling
  * apps/client/src/render/periodicImages.ts:33-87
  * apps/client/src/render/MosaicScene.tsx:477-488
* placement validation
  * apps/client/src/domain/placementSolver.ts:176-239
  * apps/server/src/domain/placementSolver.ts:164, 215

### External Research

* OpenCV docs: CLAHE and denoising for luminance normalization and edge-preserving cleanup.
  * Source: [OpenCV CLAHE tutorial](https://docs.opencv.org/4.x/d5/daf/tutorial_py_histogram_equalization.html)
  * Source: [OpenCV denoise APIs](https://docs.opencv.org/4.x/d1/d79/group__photo__denoise.html)
* Morphological operations and edge map support for tessera boundary guidance.
  * Source: [OpenCV morphology tutorial](https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html)
* Segmentation/tessellation theory references (watershed, Voronoi, Lloyd relaxation) for adaptive methods.
  * Source: [Watershed](https://en.wikipedia.org/wiki/Watershed_(image_processing))
  * Source: [Voronoi diagram](https://en.wikipedia.org/wiki/Voronoi_diagram)
  * Source: [Lloyd algorithm](https://en.wikipedia.org/wiki/Lloyd%27s_algorithm)
* Legal acquisition path for Alexander mosaic references with per-file license checks.
  * Source: [Wikimedia category: Battle of Issus mosaic](https://commons.wikimedia.org/wiki/Category:Battle_of_Issus_mosaic_(from_Pompeii))
  * Source: [Commons licensing](https://commons.wikimedia.org/wiki/Commons:Licensing)
  * Source: [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)

### Project Conventions

* Standards referenced: Existing protocol v2 placement path, canonical quilt topology constraints, revision monotonic cache/update semantics.
* Instructions followed: Task Researcher mode constraints, single-primary-document requirement, evidence-first consolidation, alternative evaluation then selection.

## Key Discoveries

### Project Structure

* Client already has a stable and modular patch pipeline:
  * placement and geometry: apps/client/src/domain/placementSolver.ts:26-34 and apps/client/src/domain/tileGeometry.ts:4-31
  * patch cache and replay consistency: apps/client/src/domain/quiltCache.ts:15-33, 127-248
  * mutation orchestration: apps/client/src/App.tsx:939-1140
  * seam/toroidal rendering: apps/client/src/render/periodicImages.ts:33-87
* Server persistence is canonical and transaction-driven:
  * schema: apps/server/src/db/schema.ts:116, 223, 456, 495, 521, 549
  * write flow: apps/server/src/index.ts:1907-1974 -> apps/server/src/db/repository.ts:1784-1977
* Topology and dimension correctness are strongly guarded in both DB and runtime:
  * apps/server/migrations/0005_finite_toroidal_quilt.sql:32-75
  * apps/server/src/domain/quiltTopology.ts:53-88

### Implementation Patterns

* Reuse existing quilt_place_tile path for import writes rather than direct SQL.
* Compute expectedPatchRevisions before each emission (or bounded window), then reconcile ACKs with existing optimistic logic.
* Keep import deterministic by using fixed patch-local addressing, normalized color format, and deterministic tie-breaking for slot conflict handling.
* Store optional tessera metadata in patch operation payload namespace to preserve compatibility.

### Complete Examples

```ts
// Import step uses existing protocol path and revision semantics.
type MosaicImportTile = {
  tileId: string;
  shape: "square" | "triangle" | "hex" | "diamond" | "circle" | "star" | "trapezoid" | "parallelogram";
  color: string;
  material: "ceramic" | "glass" | "stone";
  position: { x: number; y: number };
  rotation: number;
  mirrored: boolean;
};

async function emitImportTile(tile: MosaicImportTile, expectedPatchRevisions: Record<string, number>) {
  return socket.emitWithAck("quilt_place_tile", {
    tileId: tile.tileId,
    shape: tile.shape,
    color: tile.color,
    material: tile.material,
    position: tile.position,
    rotation: tile.rotation,
    mirrored: tile.mirrored,
    expectedPatchRevisions,
  });
}
```

### API and Schema Documentation

* Protocol mutation and replay:
  * apps/server/src/index.ts:1907-1974, 2049
* Canonical placement persistence and patch op appends:
  * apps/server/src/db/repository.ts:1784-1977
* Snapshot/replay loaders:
  * apps/server/src/db/repository.ts:3483, 3607
* Payload budget limits:
  * apps/server/src/index.ts:166-167, 2234-2274
* Canonical topology constraints:
  * docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:50-60

### Configuration Examples

```json
{
  "source": {
    "url": "https://commons.wikimedia.org/wiki/Category:Battle_of_Issus_mosaic_(from_Pompeii)",
    "fileLicenseVerified": true,
    "attribution": "Record per selected file"
  },
  "preprocess": {
    "space": "CIELAB",
    "luminanceNormalization": "clahe",
    "denoise": "fastNlMeansDenoisingColored"
  },
  "generation": {
    "pipeline": "hybrid-fixed-grid-plus-saliency-refinement",
    "palette": "stone-ceramic-historical",
    "orientationBins": 16
  },
  "import": {
    "mode": "windowed-sequential",
    "maxInFlight": 8,
    "retryOnStaleRevision": true
  }
}
```

## Technical Scenarios

### Faithful Mosaic Patch Generation

Three viable scenarios were evaluated for this codebase.

**Requirements:**

* Preserve recognizable composition and tonal gradients of source mosaic.
* Map source into app patch coordinate and persistence model.
* Keep runtime rendering performant and deterministic.
* Reuse existing protocol, revision checks, and replay behavior.

**Preferred Approach:**

* Hybrid deterministic import pipeline:
  * offline preprocessing + tessera generation
  * deterministic fixed-grid backbone across full patch
  * saliency-driven adaptive refinement in important regions (faces, edges, weapons, horse contours)
  * import through existing quilt_place_tile flow with expectedPatchRevisions and ACK reconciliation
  * optional metadata under patch_operations.payload.meta for provenance/orientation confidence

```text
offline/reference/
  alexander-source-license-records.json
  alexander-normalized-master.tif
  alexander-saliency-mask.png
offline/output/
  patch-manifest.json
  patch-<patchId>.json
client/
  importer reads patch-<patchId>.json
  emits quilt_place_tile with revision checks
server/
  persists via persistQuiltTilePlacement
  appends patch_operations
  snapshots touched patches
```

```mermaid
flowchart LR
  A[Reference image + license verification] --> B[Offline preprocessing CLAHE/Lab/NLM]
  B --> C[Fixed-grid tessera baseline]
  C --> D[Saliency-driven adaptive refinement]
  D --> E[Patch payload generation]
  E --> F[Client importer]
  F --> G[quilt_place_tile + expectedPatchRevisions]
  G --> H[persistQuiltTilePlacement + patch_operations]
  H --> I[Snapshot/replay convergence]
  I --> J[Fidelity scoring + visual QA]
```

**Implementation Details:**

1. Source and legal provenance
   * Select one Alexander mosaic image with clear per-file license terms and attribution data.
2. Offline preprocessing
   * Convert to CIELAB, normalize luminance (CLAHE or Retinex where needed), denoise with edge-preserving method.
3. Tessera generation
   * Generate fixed-grid baseline using app-supported shapes/materials only.
   * Apply adaptive refinement where saliency map exceeds threshold.
4. Patch payload packaging
   * Produce deterministic patch-local tile arrays with normalized colors and transform values.
5. In-app import execution
   * Parse payload in client domain module.
   * Validate against shape/material unions.
   * Emit with expectedPatchRevisions, reconcile ACKs, retry stale revisions with bounded policy.
6. Persistence and replay
   * Keep server path unchanged (quilt_place_tile -> persistQuiltTilePlacement).
   * Optionally add provenance metadata in patch operation payload namespace.
7. Fidelity validation
   * Compute weighted score using luminance structure, edge continuity, directional coherence, and silhouette overlap.

Selected scoring form:

$$
F = 0.30 \cdot \text{MS-SSIM}_L + 0.25 \cdot \text{EdgeF1} + 0.25 \cdot (1 - D_{\theta}) + 0.20 \cdot \text{SilhouetteIoU}
$$

```ts
// Deterministic conflict policy recommendation for v1 importer.
function shouldPlaceTile(overlapDetected: boolean, staleRevision: boolean): "place" | "retry" | "skip" {
  if (staleRevision) return "retry";
  if (overlapDetected) return "skip";
  return "place";
}
```

#### Considered Alternatives

Alternative A: Pure fixed-grid quantization
* Pros: Simplest, deterministic, lowest cost.
* Cons: Noticeably weaker contour flow and curved-edge faithfulness for Alexander composition.
* Rejected because: fails desired fidelity for historically recognizable details.

Alternative B: Fully adaptive segmentation/Voronoi-only pipeline
* Pros: Highest contour and directional fidelity potential.
* Cons: Greater complexity, variable payload structure, harder deterministic integration with current patch flow.
* Rejected because: too much implementation risk for first release in this app architecture.

Selected: Alternative C (Hybrid)
* Rationale: Best balance of faithfulness, deterministic patch import, and compatibility with existing client/server protocol and persistence.

## Evidence Log

Client pipeline and constraints:
* apps/client/src/domain/tileGeometry.ts:4-25, 147-174
* apps/client/src/domain/placementSolver.ts:176-239
* apps/client/src/domain/quiltCache.ts:15-33, 127-248, 295-313
* apps/client/src/App.tsx:284-314, 672-713, 816-910, 939-1140
* apps/client/src/render/periodicImages.ts:33-87
* apps/client/src/render/MosaicScene.tsx:477-488

Server schema, protocol, and constraints:
* apps/server/src/db/schema.ts:116, 223, 456, 495, 521, 549
* apps/server/src/index.ts:166-167, 1907-1974, 2049, 2234-2274
* apps/server/src/db/repository.ts:1784-1977, 3483, 3607, 3658
* apps/server/src/domain/quiltTopology.ts:53-88
* apps/server/migrations/0005_finite_toroidal_quilt.sql:32-75

Canonical architecture decisions:
* docs/canonical-quilt-data-storage.md:49-82, 119
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:50-60, 244

External methods and legal references:
* OpenCV CLAHE tutorial: https://docs.opencv.org/4.x/d5/daf/tutorial_py_histogram_equalization.html
* OpenCV denoise APIs: https://docs.opencv.org/4.x/d1/d79/group__photo__denoise.html
* OpenCV morphology tutorial: https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html
* Watershed: https://en.wikipedia.org/wiki/Watershed_(image_processing)
* Voronoi: https://en.wikipedia.org/wiki/Voronoi_diagram
* Lloyd algorithm: https://en.wikipedia.org/wiki/Lloyd%27s_algorithm
* Wikimedia category: https://commons.wikimedia.org/wiki/Category:Battle_of_Issus_mosaic_(from_Pompeii)
* Commons licensing: https://commons.wikimedia.org/wiki/Commons:Licensing

## Recommended Next Steps

1. Build a legal benchmark pack of 3 Alexander source images with license/attribution manifest.
2. Implement offline hybrid generator prototype and output patch JSON compatible with current tile contracts.
3. Add client importer module that emits quilt_place_tile with bounded in-flight queue.
4. Add integration tests for import convergence, stale-revision retry, and payload budget behavior.
5. Add visual/fidelity test harness with baseline and weighted score thresholds.
