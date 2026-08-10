---
applyTo: '.copilot-tracking/changes/2026-08-09/alexander-placement-manifest-import-changes.md'
title: Alexander Placement Manifest Import Plan
description: Plan to complete the Alexander mosaic epic through deterministic manifest generation and canonical client import
ms.date: 2026-08-09
ms.topic: plan
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Alexander Placement Manifest Import

## Overview

Complete the Alexander mosaic epic by converting existing deterministic palette and candidate artifacts into an app-supported placement manifest, preflighting it in the client, submitting bounded windows through `quilt_place_tile`, and proving fidelity, persistence, replay, and reconnect convergence while deferring agent-owned writes.

## Objectives

### User Requirements

* Build a deterministic placement-manifest pipeline from existing palette and candidate outputs — Source: user request and `.copilot-tracking/research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md`
* Add canonical client import with preflight and bounded placement windows through existing `quilt_place_tile` — Source: user request
* Verify fidelity, persistence, replay, and reconnect — Source: user request
* Treat agent-owned writes as a separate follow-up unless v1 is explicitly required to be fully agent-committed — Source: user request

### Derived Objectives

* Preserve server authority, patch revisions, authorization, collision checks, idempotency, spatial references, and replay by reusing the existing mutation contract — Derived from `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md`
* Make generated outputs auditable through provenance hashes, stable ordering, explicit geometry, budgets, and machine-readable fidelity reports — Derived from missing pipeline stages identified in research
* Keep raw image-space candidate interpretation out of the browser — Derived from reproducibility and runtime-boundary findings

## Context Summary

### Project Files

* `scripts/generate-alexander-mosaic-inputs.mjs` and `offline/output/alexander-mosaic-inputs/` provide 24 palette colors and 760 ranked candidates for the new deterministic stage.
* `apps/client/src/App.tsx` contains the existing placement mutation and ACK/cache reconciliation path to reuse for import queue integration.
* `apps/client/src/domain/tileGeometry.ts` and `apps/client/src/domain/placementSolver.ts` define supported tile contracts, footprints, bounds, and collision behavior.
* `apps/server/src/contracts.ts`, `apps/server/src/index.ts`, and `apps/server/src/db/repository.ts` define canonical placement validation and persistence.
* `e2e/quilt-reconnect.spec.ts`, `e2e/quilt-seams.spec.ts`, and server integration tests provide replay, reconnect, revision, and multi-replica patterns.
* `apps/agent-worker/src/` is currently read-only for authorized observation and proposal workflows.

### References

* `.copilot-tracking/research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md` - Primary Issue 155 research handoff.
* `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md` - Detailed repository investigation and recommended phases.
* `.copilot-tracking/plans/logs/2026-08-09/alexander-placement-manifest-import-log.md` - Discrepancies, selected path, alternatives, and follow-on work.

### Standards References

* `.github/instructions/hve-core/markdown.instructions.md` - Markdown frontmatter and structure conventions applied to these tracking artifacts.
* `.github/instructions/hve-core/writing-style.instructions.md` - Clear, direct planning prose.

## Implementation Checklist

### [x] Implementation Phase 1: Product Contract and Target Geometry

<!-- parallelizable: false -->

* [x] Step 1.1: Resolve v1 actor boundary, target quilt or patch set, target rectangle, fidelity threshold, budgets, retry limits, and conflict policy.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 18-37)
* [x] Step 1.2: Establish geometry parity between manifest generation and client/server tile contracts.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 39-54)

### [x] Implementation Phase 2: Deterministic Manifest and Fidelity Artifacts

<!-- parallelizable: false -->

* [x] Step 2.1: Add deterministic manifest generation, stable ordering, provenance, supported geometry, budgets, and tests.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 60-83)
* [x] Step 2.2: Add fidelity scoring and manifest/report provenance verification.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 85-101)
* [x] Step 2.3: Run offline source, input, manifest, and fidelity validation.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 103-110)

### [x] Implementation Phase 3: Client Parser, Preflight, and Bounded Queue

<!-- parallelizable: false -->

* [x] Step 3.1: Add pure manifest parsing and preflight with structured rejection reasons.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 116-134)
* [x] Step 3.2: Integrate a bounded, ACK-driven, resumable queue beside the existing placement path.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 136-153)

### [x] Implementation Phase 4: Canonical Persistence, Replay, Reconnect, and Fidelity E2E

<!-- parallelizable: false -->

* [x] Step 4.1: Add server integration coverage using import-shaped requests without adding a bulk mutation endpoint.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 159-173)
* [x] Step 4.2: Add a small-fixture and bounded larger-fixture multi-replica E2E import spec.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 175-191)
* [x] Step 4.3: Run focused client, server, build, lint, and multi-replica validation.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 193-202)

### [x] Implementation Phase 5: Full Validation and Handoff

<!-- parallelizable: false -->

* [x] Step 5.1: Run full project validation and confirm generated hashes and process cleanup.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 208-210)
* [x] Step 5.2: Repair only scoped minor validation failures and rerun focused checks.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 212-214)
* [x] Step 5.3: Report blockers and hand off agent-owned writes as a separate decision-gated effort.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 216-218)

### [ ] Implementation Phase 6: Optional Agent-Owned Write Follow-Up

<!-- parallelizable: false -->

* [ ] Step 6.1: Only after explicit approval, design worker mutation authority through ordinary authenticated contracts with audit, checkpoints, bounded retries, and multi-replica tests.
  * Details: `.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md` (Lines 220-237)

## Planning Log

See `.copilot-tracking/plans/logs/2026-08-09/alexander-placement-manifest-import-log.md` for DR-01 through DR-03, DD-01 through DD-03, selected path, rejected alternatives, and WI-01 through WI-03.

## Dependencies

* Product confirmation of the target patch, source-to-world transform, release fidelity threshold, and v1 actor. Provisional engineering defaults cover candidate count, four in-flight placements, two stale-revision retries, and deterministic skip-and-record conflict handling.
* Existing Node, client, server, PostgreSQL, and authenticated multi-replica test infrastructure.
* Existing source provenance, preprocessing, and mosaic-input generation commands.
* A decision on publication or CI handling for ignored generated manifests and fidelity reports.

## Success Criteria

* Identical source and config inputs produce byte-identical manifest and fidelity hashes — Traces to: user deterministic-pipeline requirement and research finding that existing outputs are sufficient inputs.
* Client preflight rejects malformed or incompatible manifests before any mutation — Traces to: user canonical-import requirement and research Phase 3.
* All committed placements use existing `quilt_place_tile` and pass canonical server persistence, idempotent replay, patch history, snapshots, and revision checks — Traces to: user persistence/replay requirement and existing runtime contracts.
* Reconnect through another replica converges to the same canonical tile set, transforms, revisions, and cursors — Traces to: user reconnect requirement and existing E2E patterns.
* Fidelity meets the agreed threshold and records skipped or conflicted candidates — Traces to: user fidelity requirement and research Phase 2.
* Agent-owned writes remain outside v1 unless explicitly approved and planned as the authority follow-up — Traces to: user boundary requirement and resident-agent architecture research.
