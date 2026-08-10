---
title: Alexander Placement Manifest Import Planning Log
description: Discrepancy and implementation-path tracking for the Alexander mosaic import plan
ms.date: 2026-08-09
ms.topic: plan
---
<!-- markdownlint-disable-file -->
# Planning Log: Alexander Placement Manifest Import

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Phase 1 Provisional Resolution

* V1 is a user or operator-triggered client import. Agent-owned writes remain a
  separate decision-gated follow-up.
* The import target supplies the canonical protocol-V2 quilt ID, an
  operator-selected owned patch, its target world rectangle, and an explicit
  source-to-world transform. Runtime code must not infer any of these values.
* The configured candidate budget, four in-flight placements, two stale-revision
  retries, pause-and-resume cancellation, and deterministic skip-and-record
  conflict policy are the provisional v1 defaults.
* Geometry parity begins with square ceramic tiles at zero rotation without
  mirroring. The generator mirrors the existing client/server enums and square
  footprint; richer geometry requires later fidelity evidence.
* The exact patch selection and release fidelity threshold remain product release
  gates. They are represented as explicit manifest requirements so implementation
  can proceed without silently choosing a target or threshold.

### Final Validation Status

* No new unaddressed research items or plan deviations were identified. The plan covers deterministic manifest generation from existing palette/candidate outputs, app-supported preflight, bounded `quilt_place_tile` import, fidelity evidence, canonical persistence, replay, reconnect, and the separate agent-owned-write boundary.
* DR-01 remains a release-gate product decision, mitigated for implementation by the documented provisional defaults and explicit target/transform requirements.
* DR-02 is an identified Phase 2 verification item, not an omitted implementation step; the plan requires the provenance mismatch to be corrected or documented before manifest acceptance.
* DR-03 is correctly categorized as publication-policy follow-on work and does not block implementation of the canonical import path.
* DD-03 is resolved: all plan and details phases are dependency-ordered and marked `parallelizable: false`.
* Phase 5 validation passed for source provenance, preprocessing, mosaic inputs,
  manifest generation and tests, fidelity scoring and tests, client/server
  tests, client/server builds, and client/server lint.
* Two manifest generations produced matching artifact hashes
  `3313069d7e0a44cf11fe261ea6289fe4ce2aa5d70cdfb71e5206f182d1e6d0bf`.
  Two fidelity scorings produced matching report hashes
  `59c15f8cdf1017e0a772402e67a392e4654b5ce230b673afb387ec37de9bfd8d`.
* The focused Alexander multi-replica import scenario passed. The initial
  combined E2E run reported a transient `ECONNREFUSED` for replica A in the
  reconnect scenario; the focused reconnect rerun passed without a code change.
  Ports 3001, 5173, 3201, 3202, and 3299 were clear after validation.

### Unaddressed Research Items

* DR-01: The exact canonical quilt, owned patch set, target world rectangle, and release fidelity threshold are not specified in the repository research.
  * Source: `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md` under `Unresolved Questions`
  * Reason: These are product and deployment decisions rather than implementation facts. The plan supplies provisional import, retry, concurrency, and conflict defaults so implementation can proceed while release values are confirmed.
  * Impact: Medium. Phase 1 must confirm the release target and threshold before acceptance, but the generator and queue can be built against explicit provisional values.

* DR-02: The normalized-master provenance recipe references a path that differs from the current generated artifact path.
  * Source: `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md` under `Existing Alexander Data`
  * Reason: The plan preserves the existing provenance verifier scope and requires the discrepancy to be corrected or explicitly documented during manifest verification.
  * Impact: Medium. Hash verification could fail or become ambiguous if left unresolved.

* DR-03: The repository does not establish whether generated manifests should be committed, published, or regenerated in CI.
  * Source: `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md` under `Unresolved Questions`
  * Reason: The plan treats ignored outputs as reproducible artifacts and defers publication policy to implementation setup.
  * Impact: Medium. Release and CI artifact handling remains open.

* DR-04: The exact canonical quilt, owned patch set, target world rectangle, and
  release fidelity threshold remain product release gates.
  * Reason: The manifest contract intentionally requires explicit target and
    transform values rather than inferring them at runtime.
  * Impact: Medium. The validated implementation is ready, but an import cannot
    be released until product supplies these values.

### Plan Deviations from Research

* DD-01: The plan selects a client-side, user or operator-triggered import queue for v1 and defers agent-owned writes.
  * Research recommends: Deterministic manifest plus canonical client import, with agent-owned mutation as a separate policy-backed phase.
  * Plan implements: The recommended path as the primary plan and includes agent-owned writes only as optional Phase 6.
  * Rationale: Existing worker and architecture are read-only and require ordinary authenticated contracts plus explicit authority policy for mutation.

* DD-02: The plan uses a conservative initial tile geometry policy before introducing shape variation.
  * Research recommends: Start with one supported shape and fixed material or rotation, then add variation when fidelity evidence supports it.
  * Plan implements: Geometry parity as a required contract and variation only after scorer evidence.
  * Rationale: This reduces divergence between offline footprint calculations and client/server collision rules while preserving an evidence-based path to richer output.

* DD-03: The initial draft marked implementation Phases 2 and 3 as parallelizable even though their steps have sequential dependencies.
  * Research recommends: Generate the manifest before fidelity scoring, then establish the manifest/preflight contract before implementing the import queue.
  * Plan implements: Both the plan and details now mark Phases 2 and 3 as `parallelizable: false`; their dependent steps remain ordered within each phase.
  * Rationale: The scheduling discrepancy was corrected after validation and is retained for traceability.

## Implementation Paths Considered

### Selected: Deterministic Manifest and Canonical Client Import

* Approach: Generate a versioned app-ready manifest from existing palette and candidate artifacts, preflight it in the client, submit bounded placements through `quilt_place_tile`, and verify canonical persistence, replay, reconnect, and fidelity.
* Rationale: Reuses the existing authority, authorization, collision, idempotency, patch revision, cache, and replay contracts without creating a second mutation surface.
* Evidence: `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md` under `Executive Finding`, `Runtime Contracts`, and `Recommended Phased Implementation`

### IP-01: Server Bulk Import Endpoint

* Approach: Add a server-side endpoint that accepts a manifest and performs bulk placement.
* Trade-offs: Could reduce client orchestration overhead, but would duplicate or centralize client semantics for authorization, collision handling, expected revisions, idempotency, audit, progress, and replay.
* Rejection rationale: The research explicitly recommends the existing `quilt_place_tile` path as the import boundary and identifies a bulk endpoint as a second mutation surface.

### IP-02: Agent-Owned Autonomous Mutation in V1

* Approach: Extend the worker to claim the manifest and commit placements directly through authenticated Socket.IO/API contracts.
* Trade-offs: Satisfies the strongest interpretation of autonomous recreation, but requires agent identity and ownership eligibility, policy gates, audit, checkpoints, retries, transfer, and multi-replica coverage.
* Rejection rationale: Current worker behavior is read-only, and the product boundary is unresolved. Making it a v1 prerequisite would expand the epic into a separate authority and threat-model project.

### IP-03: Raw Candidate Interpretation in the Client

* Approach: Ship palette and image-space candidates to the browser and perform mapping, geometry, and selection at import time.
* Trade-offs: Avoids a new offline script, but weakens reproducibility, increases client complexity, and makes fidelity and manifest provenance harder to audit.
* Rejection rationale: The research recommends a deterministic downstream generator and an app-ready manifest rather than runtime interpretation of raw image-space data.

## Suggested Follow-On Work

* WI-01: Agent-owned placement authority — Define agent principal ownership, feature flags, checkpoints, audit, and ordinary authenticated mutation behavior if product requires fully autonomous commits (High; separate epic). Dependency: v1 canonical import and product approval.
* WI-02: Generated artifact publication policy — Decide whether manifests and fidelity reports are committed, released, or regenerated in CI (Medium). Dependency: manifest schema and reproducibility checks.
* WI-03: Rich tile-shape optimization — Add shape/material/rotation variation only after baseline fidelity and geometry parity are measured (Medium). Dependency: Phase 2 scorer and Phase 3 preflight.
* WI-04: Diagnose the transient replica-A connection refusal if it recurs in CI
  (Low). Preserve the focused reconnect rerun as the immediate discriminator and
  add startup telemetry only if the failure becomes reproducible.
