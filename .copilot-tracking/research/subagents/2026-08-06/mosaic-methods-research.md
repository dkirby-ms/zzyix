---
title: Mosaic Methods Research for Alexander Mosaic Digitization
description: Research findings on preprocessing, tessellation methods, fidelity metrics, legal image sourcing, and offline-to-patch performance strategy for historically faithful digital mosaic reconstruction
author: Researcher Subagent
ms.date: 2026-08-06
ms.topic: reference
keywords:
  - alexander mosaic
  - image preprocessing
  - tessellation
  - superpixels
  - voronoi
  - licensing
  - patch payload
estimated_reading_time: 12
---

## Research scope

This note investigates best-practice methods to recreate ancient mosaics, starting from the Alexander Mosaic, into a digital tile grid suitable for a patch-based app.

Research questions covered:

* Source-image preprocessing for color correction, illumination normalization, and denoising
* Tessera generation approaches: fixed-grid, adaptive segmentation, Voronoi/procedural, hybrid
* Fidelity metrics specific to historical mosaics
* Legal and practical guidance for obtaining reference images with clear reuse rights
* Performance strategy for offline generation and compact patch import

## Key discoveries

* For mosaic-focused preprocessing, the strongest baseline is a color-managed pipeline that separates luminance from chroma, normalizes illumination locally, and denoises with edge-aware methods.
* Pure fixed-grid quantization is fastest and easiest but tends to lose directional stroke flow seen in opus vermiculatum.
* Adaptive region methods and centroidal Voronoi approaches better preserve contour flow and silhouette identity, at higher compute cost.
* A hybrid pipeline is the best first implementation target: fixed-grid for throughput plus local adaptive refinement near high-importance regions.
* Wikimedia Commons is the most practical open source for Alexander Mosaic references if each chosen file page license is verified individually.

## 1) Source-image preprocessing best practices

### Recommended preprocessing stack

* Ingest in high bit depth when possible, and preserve a master working copy in linear or near-linear color workflow.
* Convert to CIELAB or similar perceptual space so luminance and chroma can be treated independently.
* Perform illumination normalization on luminance channel first.
* Perform denoising second, using edge-preserving denoise.
* Apply local contrast restoration conservatively.
* Perform optional palette stabilization for historical stone-like gamut.

### Practical method choices

* Illumination normalization:
  * CLAHE on luminance with conservative clip limit to avoid halo artifacts
  * Retinex-style normalization when non-uniform museum lighting is severe
* Denoising:
  * Non-local means for preserving micro-structure while reducing sensor noise
  * Optional bilateral or TV-L1 variant where texture can be softened slightly for robust segmentation
* Edge support:
  * Morphological clean-up and gradient map extraction to guide later tessera orientation and refinement

### Why this is historically faithful

Ancient mosaics encode form through local tone transitions and contour grouping more than through photo-level smooth shading. Illumination correction and edge-aware denoising improve extraction of these structural cues without forcing modern photo realism.

### References

* OpenCV histogram equalization and CLAHE tutorial: <https://docs.opencv.org/4.x/d5/daf/tutorial_py_histogram_equalization.html>
* OpenCV denoising functions, including NLM and colored NLM in Lab-like workflow: <https://docs.opencv.org/4.x/d1/d79/group__photo__denoise.html>
* OpenCV morphology tutorial: <https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html>
* Retinex background and theory summary: <https://en.wikipedia.org/wiki/Retinex>

## 2) Tessera generation approaches

### A) Fixed-grid quantization

Method:

* Uniform rectangular or hex-like grid sampling
* Palette quantization per cell
* Optional ordered dithering

Pros:

* Fastest generation
* Predictable payload layout
* Straightforward patch packing and delta updates

Cons:

* Weak at curved contour flow
* Produces staircase edges on diagonals
* Less faithful to vermiculatum directional cues

Best use:

* Coarse preview and very large-scale offline batches

### B) Adaptive superpixel or segmentation tesserae

Method:

* Generate superpixels or marker-based regions on preprocessed image
* Fit one tessera per region or per subdivided region
* Align orientation to local gradient or structure tensor

Pros:

* Better edge adherence
* Better silhouette and facial feature retention
* Natural local variation in tile size

Cons:

* More parameter-sensitive
* Higher compute and memory cost
* Requires robust post-processing to avoid over-segmentation

Best use:

* High-fidelity zones such as faces, hands, weapon edges, and horse contours

References:

* Watershed segmentation overview and marker strategies: <https://en.wikipedia.org/wiki/Watershed_(image_processing)>

### C) Voronoi or procedural tessellation

Method:

* Seed points over the image
* Build Voronoi cells
* Relax seeds with Lloyd iterations toward centroidal Voronoi tessellation
* Optionally weight seed density by edge or saliency map

Pros:

* Organic non-grid look
* Strong potential to emulate hand-laid irregularity
* Smooth size and orientation variation

Cons:

* Harder to guarantee exact tile counts by region
* Requires clipping and topology repair near boundaries
* More complex packing format than fixed grid

Best use:

* Stylized faithful reconstructions where visual authenticity outranks deterministic indexing

References:

* Voronoi definition and algorithmic background: <https://en.wikipedia.org/wiki/Voronoi_diagram>
* Lloyd relaxation and mosaic simulation citation trail: <https://en.wikipedia.org/wiki/Lloyd%27s_algorithm>

### D) Hybrid method

Method:

* Start with fixed-grid backbone for deterministic patching
* Compute saliency map from edge magnitude, curvature, and semantic importance masks
* Replace selected cells with adaptive sub-tiling or Voronoi micro-tiling in high-importance regions

Pros:

* Balanced throughput and fidelity
* Predictable patch payload schema
* Better contour and directional flow where it matters

Cons:

* Two-stage complexity
* Requires merge rules at transition boundaries

Best use:

* Production first release for patch-based app constraints

## 3) Fidelity metrics tailored to historical mosaics

No single metric captures historical faithfulness. Use a metric suite:

* Tone gradient preservation:
  * Multi-scale SSIM on luminance
  * Gradient-domain error on low-to-mid frequencies
* Edge continuity:
  * Edge map F1 between reference and rendered mosaic
  * Contour fragmentation ratio and average contour length
* Directional flow:
  * Structure tensor coherence difference between reference and output
  * Orientation histogram divergence in key zones
* Silhouette recognition:
  * IoU or boundary F-score for segmented key figures
  * Human-in-the-loop recognition check for principal actors and objects

Suggested weighted score for model selection:

$$
F = 0.30 \cdot \text{MS-SSIM}_L + 0.25 \cdot \text{EdgeF1} + 0.25 \cdot (1 - D_{\theta}) + 0.20 \cdot \text{SilhouetteIoU}
$$

Where:

* $\text{MS-SSIM}_L$ is luminance multiscale structural similarity
* $\text{EdgeF1}$ is edge continuity agreement
* $D_{\theta}$ is directional orientation divergence
* $\text{SilhouetteIoU}$ is overlap on manually or model-derived masks

Reference:

* SSIM and MS-SSIM background: <https://en.wikipedia.org/wiki/Structural_similarity_index_measure>

## 4) Legal and source guidance for Alexander Mosaic images

### Practical safest path

* Prefer files from Wikimedia Commons category pages for the Alexander Mosaic and inspect each specific file page before use.
* Record for each selected file:
  * File URL
  * License tag on file page
  * Author and attribution text
  * Any ShareAlike obligation
  * Download timestamp and checksum for provenance

### Why this path works

* Commons provides per-file licensing metadata and explicit reuse guidance.
* Many files are in public domain or under free Creative Commons licenses, but terms vary file by file.
* Commons policy text is not itself a substitute for checking each media file license.

### Important cautions

* Do not assume museum website images are freely reusable unless explicit terms say so.
* Rights statements such as NoC-NC allow non-commercial use only and may not fit commercial product plans.
* Even for public-domain underlying artworks, confirm rights status of the specific digital photo and jurisdictional nuances.

### Sources

* Alexander Mosaic media category: <https://commons.wikimedia.org/wiki/Category:Battle_of_Issus_mosaic_(from_Pompeii)>
* Commons licensing policy overview: <https://commons.wikimedia.org/wiki/Commons:Licensing>
* Commons reuse guidance: <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>
* RightsStatements NoC-NC explanation: <https://rightsstatements.org/page/NoC-NC/1.0/>
* Museum context and restoration notice: <https://www.museoarcheologiconapoli.it/en/>

## 5) Performance strategy for offline generation and compact patch payloads

### Offline generation architecture

* Stage 1 preprocess:
  * Build normalized master image pyramid
* Stage 2 tessellation:
  * Run chosen tessera pipeline per level of detail
* Stage 3 optimization:
  * Palette reduction, shape simplification, and topology cleanup
* Stage 4 packaging:
  * Encode patch payloads and metadata manifests

### Patch payload design recommendations

* Store tessera geometry as quantized local coordinates per patch
* Use shared palette dictionary with local remap tables
* Encode tile orientation as compact bins, for example 16 or 32 directions
* Use delta payloads against previous revision for iterative updates
* Keep deterministic patch IDs for stable caching

### Data format sketch

* `manifest.json`:
  * source image hash
  * preprocessing parameters
  * tessellation algorithm version
  * palette dictionary hash
* `patch_<id>.bin`:
  * tile count
  * packed geometry stream
  * color index stream
  * orientation stream
  * optional quality metrics block

### Compute strategy

* Run heavy preprocessing and tessellation offline in batch jobs
* Cache intermediate maps:
  * luminance normalized image
  * edge map
  * saliency map
* Parallelize by patches and by levels of detail
* Import only compact binary payloads into app runtime

## Concrete algorithmic pipelines with trade-offs

### Pipeline 1: Deterministic grid baseline

1. Preprocess with luminance CLAHE + NLM denoise
2. Uniform grid tiling
3. Palette quantization per patch with global palette constraints
4. Edge-aware recolor adjustment on boundary cells
5. Export compact patch bins

Trade-offs:

* Highest speed, lowest complexity
* Lowest contour faithfulness on curved forms

### Pipeline 2: Adaptive segmentation fidelity-first

1. Preprocess with Retinex + NLM + gradient extraction
2. Marker-based watershed or superpixel segmentation
3. Region-to-tessera mapping with orientation from local structure tensor
4. Region merge pass to control tile count budget
5. Export patch payload with variable polygon cells

Trade-offs:

* Best silhouette and contour fidelity
* Highest implementation complexity and payload variability

### Pipeline 3: Hybrid production path

1. Preprocess with CLAHE or Retinex depending on illumination variance
2. Generate fixed-grid base tesserae
3. Compute saliency mask from edge strength, curvature, and key-figure masks
4. Replace high-saliency cells with local adaptive tessellation or relaxed Voronoi
5. Boundary stitching pass and palette harmonization
6. Export deterministic patch container with mixed cell encoding

Trade-offs:

* Strong fidelity-speed balance
* Moderate complexity, suitable for first production release

## Recommendation for first implementation

Start with Pipeline 3 (Hybrid production path).

Rationale:

* Meets patch-based determinism and compact payload goals
* Improves historical visual cues where users notice them most
* Allows phased rollout:
  * Milestone 1: fixed-grid only
  * Milestone 2: saliency-driven refinement
  * Milestone 3: optional Voronoi micro-tiling for premium fidelity

## Unresolved questions

* Target legal posture: non-commercial research prototype only, or commercial distribution
* Required minimum attribution footprint in product UI and exports
* Preferred max payload size per patch and max import latency budget
* Whether semantic masks for key figures will be manual, model-based, or both
* Whether runtime supports variable-polygon tessera rendering or requires rasterized tiles only

## Implementation-oriented next checks

* Build a 3-image benchmark set from legally clear Commons files, each with recorded license metadata
* Define acceptance thresholds for the composite fidelity score
* Run A/B comparison of Pipeline 1 vs Pipeline 3 on the same benchmark
* Decide patch schema early to avoid re-encoding migration later

## References index

* <https://en.wikipedia.org/wiki/Alexander_Mosaic>
* <https://www.museoarcheologiconapoli.it/en/>
* <https://docs.opencv.org/4.x/d5/daf/tutorial_py_histogram_equalization.html>
* <https://docs.opencv.org/4.x/d1/d79/group__photo__denoise.html>
* <https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html>
* <https://en.wikipedia.org/wiki/Retinex>
* <https://en.wikipedia.org/wiki/Watershed_(image_processing)>
* <https://en.wikipedia.org/wiki/Voronoi_diagram>
* <https://en.wikipedia.org/wiki/Lloyd%27s_algorithm>
* <https://en.wikipedia.org/wiki/Structural_similarity_index_measure>
* <https://commons.wikimedia.org/wiki/Category:Battle_of_Issus_mosaic_(from_Pompeii)>
* <https://commons.wikimedia.org/wiki/Commons:Licensing>
* <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia>
* <https://rightsstatements.org/page/NoC-NC/1.0/>
