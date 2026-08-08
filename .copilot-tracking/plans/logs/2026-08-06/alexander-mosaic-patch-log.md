<!-- markdownlint-disable-file -->
# Planning Log: Alexander Mosaic Patch Recreation

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-01: Research recommends a legal benchmark pack of three images, while v1 implementation is bounded to one primary source plus optional comparisons.
  * Source: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (Recommended Next Steps)
  * Reason: One bounded target is sufficient to prove the pipeline and acceptance harness; comparison images remain optional evidence.
  * Impact: Low

* DR-02: Research identifies optional tessera metadata in snapshots as a v2 question.
  * Source: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (Potential Next Research)
  * Reason: v1 keeps provenance in the operation payload namespace and does not change snapshot projection or schema.
  * Impact: Medium

* DR-03: Research recommends throughput benchmarking beyond the initial bounded import.
  * Source: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (Potential Next Research)
  * Reason: v1 includes bounded-window behavior and payload-budget tests but defers large-scale benchmark tuning.
  * Impact: Medium

### Plan Deviations From Research

* DD-01: The plan makes preprocessing, generation, and scoring explicit offline workspaces rather than prescribing a runtime implementation language.
  * Research recommends: Offline preprocessing and hybrid generation.
  * Plan implements: Toolchain-neutral offline stages with concrete artifact and validation contracts.
  * Rationale: The repository has TypeScript runtime packages but no established image-processing package; keeping the offline boundary tool-neutral avoids an unjustified dependency decision.

* DD-02: The plan treats optional operation metadata as conditional and test-gated.
  * Research recommends: Optional metadata under `patch_operations.payload.meta`.
  * Plan implements: Add metadata only if current payload guards accept it; otherwise retain provenance in the manifest.
  * Rationale: Preserve the existing server contract and avoid a migration or snapshot projection change in v1.

* DR-04 (Resolved): The plan now defines a Python 3.12/uv offline toolchain, concrete `.py` entry points, pinned dependencies, and runnable generation/scoring commands.
  * Source: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (Task Implementation Requests, Scope and Success Criteria).
  * Reason: `offline/generator/preprocess`, `offline/generator/generatePatch`, and `offline/validation/scoreAlexanderPatch` are extensionless placeholders, no `offline/` tree exists, and the planned `apps/client/src/domain/mosaicImport.ts` and `e2e/quilt-mosaic-import.spec.ts` files are not present.
  * Impact: Resolved in the current plan revision.

* DR-05 (Resolved): Phases 1, 2, and 5 are now sequential because their details declare dependencies on prior steps or phases.
  * Source: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (Preferred Approach and Recommended Next Steps).
  * Reason: Phase 2 depends on Step 1.1, Phase 5 depends on Phases 3 and 4, and Phase 1 establishes contracts consumed by later work; the current markers do not distinguish independent work within a phase from phase-level scheduling.
  * Impact: Resolved in the current plan revision.

* DR-06 (Resolved): Checklist references now point to the exact step ranges in the implementation details file.
  * Source: `.copilot-tracking/plans/2026-08-06/alexander-mosaic-patch-plan.instructions.md` (Implementation Checklist) compared with `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (step headings).
  * Reason: The current checklist references align with the current details headings and each referenced step body, including dependencies and commands where present.
  * Impact: Resolved. Reviewers can be routed directly to the named implementation step.

* DR-07 (Resolved): Final validation commands and process-lifecycle checks are runnable as written.
  * Source: `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md` (Step 6.1) compared with `package.json`, `scripts/dev-test-auth.mjs`, and `playwright.config.ts`.
  * Reason: Step 6.1 now invokes `npm run test:e2e:preflight && npx playwright test e2e/quilt-mosaic-import.spec.ts --reporter=line`, allowing the Playwright configuration to own its stack, and explicitly checks ports 3101, 4173, and 3199 for no listeners after the run.
  * Impact: Resolved. The final browser validation targets the configured stack and verifies cleanup of its test-service ports.

* DD-03 (Resolved): The plan selects Python 3.12 with `uv`, Pillow, OpenCV, and scikit-image for the offline implementation.
  * Research recommends: An offline CIELAB/CLAHE/denoising, fixed-grid, saliency-refinement generator with machine-readable scoring.
  * Plan implements: Pinned offline dependencies, concrete Python entry points, and reproducible `uv run` commands.
  * Rationale: Python provides the clearest fit for the researched image-processing methods while remaining outside the client/server runtime path.

## Implementation Paths Considered

### Selected: Hybrid Deterministic Import

* Approach: Offline CIELAB normalization and saliency extraction, fixed-grid tessera backbone, deterministic saliency refinements, patch JSON packaging, and client emission through existing `quilt_place_tile` with revision-aware bounded windows.
* Rationale: Balances historical recognizability, deterministic replay, supported geometry, runtime performance, and minimal protocol risk.
* Evidence: `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md` (Technical Scenarios and Key Discoveries)

### IP-01: Pure Fixed-Grid Quantization

* Approach: Quantize the entire source to a uniform grid using supported tiles.
* Trade-offs: Lowest implementation cost and simplest determinism, but weaker contour flow and curved-edge fidelity.
* Rejection rationale: Does not meet the research target for recognizable faces, weapons, horse contours, and other high-saliency details.

### IP-02: Fully Adaptive Segmentation Or Voronoi

* Approach: Use watershed, Voronoi, or Lloyd-relaxed regions as the primary tessera geometry.
* Trade-offs: Potentially higher contour fidelity, but increased algorithmic complexity, variable payload structure, and greater integration/performance risk.
* Rejection rationale: Too much first-release risk for the existing fixed shape/material and patch protocol contracts.

## Suggested Follow-On Work

* WI-01: Snapshot tessera metadata projection - Decide whether provenance, orientation confidence, and saliency metadata must be available in snapshot payloads for immediate client use. Priority: Medium.
  * Source: Research potential next steps and DR-02.
  * Dependency: v1 operation payload and replay tests.

* WI-02: Large-import throughput benchmark - Measure queue window sizes, ACK latency, revision contention, and snapshot budget behavior across larger patch sets. Priority: Medium.
  * Source: Research potential next steps and DR-03.
  * Dependency: v1 importer telemetry and bounded import completion.

* WI-03: Canonical color contract decision - Establish whether server-stored colors require a strict canonical format and update palette validation accordingly. Priority: Medium.
  * Source: Research potential next steps.
  * Dependency: v1 palette manifest and importer validation.
