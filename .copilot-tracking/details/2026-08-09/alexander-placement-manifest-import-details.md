---
title: Alexander Placement Manifest Import Details
description: Implementation details for deterministic Alexander mosaic manifest generation and canonical client import
ms.date: 2026-08-09
ms.topic: plan
---
<!-- markdownlint-disable-file -->
# Implementation Details: Alexander Placement Manifest Import

## Context Reference

Sources: `.copilot-tracking/research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md`, `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md`, and the user request. Existing runtime contracts are in `apps/client/src/App.tsx`, `apps/client/src/domain/tileGeometry.ts`, `apps/client/src/domain/placementSolver.ts`, `apps/server/src/contracts.ts`, and `apps/server/src/db/repository.ts`.

## Implementation Phase 1: Product Contract and Target Geometry

<!-- parallelizable: false -->

### Step 1.1: Resolve v1 import ownership and target

Define v1 as user or operator-triggered import unless the epic owner explicitly requires agent-committed writes. Use a product-selected owned patch as the target, require the source-to-world transform to be explicit in the manifest, and use provisional engineering defaults of the configured candidate budget, four in-flight placements, two stale-revision retries, pause-and-resume cancellation semantics, and deterministic skip-and-record handling for collisions or out-of-bounds candidates. Select the canonical quilt, target patch or patch set, target world rectangle, and fidelity threshold before release, with these provisional defaults overrideable during implementation.

Files:
* `.copilot-tracking` planning decision or product record if the repository's issue workflow requires persistence
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` as the topology constraint reference

Discrepancy references:
* DR-01 and DD-01 in the planning log

Success criteria:
* The manifest contract has an explicit target and transform and does not infer a patch at runtime.
* The v1 actor boundary is recorded as user or operator import, or the plan is reopened for agent authority work.

Context references:
* `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md` under `Unresolved Questions` and `Phase 0`

Dependencies:
* Product decision on target patch and fidelity threshold

### Step 1.2: Establish geometry parity contract

Choose a conservative initial geometry policy, preferably one supported shape with fixed material and rotation. Define a neutral manifest geometry table or mirrored geometry table with parity tests against the client/server tile contract. Include canonical coordinate wrapping and footprint calculations.

Files:
* `apps/client/src/domain/tileGeometry.ts` and `apps/client/src/domain/placementSolver.ts` for existing contracts
* `apps/server/src/contracts.ts` for server payload enums
* `scripts/generate-alexander-patch-manifest.mjs` for the new generator
* `scripts/generate-alexander-patch-manifest.test.mjs` for parity tests

Success criteria:
* Every emitted placement uses supported shape, material, color, transform, and finite canonical coordinates.
* Generator footprint and client/server validation agree for boundary and collision cases.

Dependencies:
* Step 1.1 target geometry

## Implementation Phase 2: Deterministic Manifest and Fidelity Artifacts

<!-- parallelizable: false -->

### Step 2.1: Generate the versioned placement manifest

Create `scripts/generate-alexander-patch-manifest.mjs` as a deterministic downstream stage after `scripts/generate-alexander-mosaic-inputs.mjs`. Consume the existing palette, candidate, preprocessing, and input config artifacts. Emit stable ordering, placement IDs, source candidate references, mapped canonical positions, supported tile attributes, provenance hashes, generator version or seed, budgets, conflict policy, skipped-candidate reasons, and target geometry metadata.

Files:
* `scripts/generate-alexander-patch-manifest.mjs`
* `scripts/generate-alexander-patch-manifest.test.mjs`
* `package.json` for explicit generation and test scripts
* `offline/output/alexander-mosaic-inputs/alexander-patch-manifest.json` as generated output

Discrepancy references:
* Addresses research findings on the missing manifest, geometry, ordering, provenance, and budgets.

Success criteria:
* Repeated generation from identical inputs produces byte-identical manifest output and hash.
* The generator rejects missing or hash-mismatched inputs and records deterministic skips for duplicate, conflicting, out-of-bounds, or budget-excluded candidates.
* Tests cover coordinate mapping, stable ordering, supported enums, duplicate IDs, bounds, conflict policy, and feature coverage after truncation.

Context references:
* `.copilot-tracking/research/subagents/2026-08-09/alexander-placement-pipeline-research.md` under `Existing Alexander Data` and `Phase 1`

Dependencies:
* Phase 1 target and geometry contract
* Existing commands `npm run verify:alexander-source` and `npm run test:alexander-mosaic-inputs`

### Step 2.2: Produce and verify fidelity evidence

Add a deterministic scorer that rasterizes selected placements into source image space and reports color error, edge and contour retention, feature-region coverage, skipped/conflicted candidates, and threshold pass/fail. Extend provenance verification for manifest and report schema, hashes, dimensions, supported contract, and reproducibility.

Files:
* `scripts/score-alexander-patch-fidelity.mjs`
* `scripts/score-alexander-patch-fidelity.test.mjs`
* `scripts/verify-alexander-source.mjs` or the existing verifier identified during implementation
* `offline/output/alexander-mosaic-inputs/alexander-fidelity-report.json`
* `package.json`

Success criteria:
* The report is machine-readable, tied to manifest and source hashes, and includes release-blocking thresholds.
* A fixture with known error passes or fails deterministically at the expected threshold.

Dependencies:
* Step 2.1 manifest schema and rasterization policy

### Step 2.3: Validate offline phase

Validation commands:
* `npm run verify:alexander-source`
* `npm run test:preprocess-alexander-source`
* `npm run test:alexander-mosaic-inputs`
* New manifest generation and manifest test commands
* New fidelity scorer and scorer test commands

## Implementation Phase 3: Client Parser and Preflight

<!-- parallelizable: false -->

### Step 3.1: Add pure manifest parsing and preflight

Create a client domain module that parses the manifest, validates schema and provenance hashes, target identity, topology, supported tile attributes, finite transforms, unique IDs, footprints, ordering, payload budgets, and current patch cursor availability. Return structured accepted, rejected, and warning counts before any network mutation. Do not silently repair coordinates or switch targets.

Files:
* `apps/client/src/domain/mosaicImport.ts`
* `apps/client/src/domain/mosaicImport.test.ts`
* `apps/client/src/domain/tileGeometry.ts` if shared validation requires a narrow export

Discrepancy references:
* Addresses DD-01 by keeping raw candidate interpretation out of runtime and using a versioned app-ready contract.

Success criteria:
* Malformed, incompatible, over-budget, stale-target, unsupported, and hash-mismatched manifests are rejected before `quilt_place_tile` is emitted.
* Pure tests cover valid manifests, every preflight rejection category, deterministic ordering, and current cursor requirements.

Dependencies:
* Phase 2 manifest schema
* Existing placement and geometry types

### Step 3.2: Add bounded import queue beside the existing placement path

Integrate a queue near `placeFromState` in `apps/client/src/App.tsx`. Use unique operation IDs, current expected patch revisions, bounded in-flight work, ACK-driven revision reconciliation, optimistic cache updates consistent with existing placement, cancellation, progress keyed by manifest hash, and explicit outcome records.

Files:
* `apps/client/src/App.tsx`
* `apps/client/src/domain/mosaicImport.ts`
* `apps/client/src/domain/quiltCache.ts` only if an existing reconciliation helper needs a narrow extension
* Focused client tests for queue behavior

Success criteria:
* The queue submits only through `quilt_place_tile` and never writes SQL or introduces a bulk mutation protocol.
* Accepted ACKs advance revisions from server data; stale revisions resync and retry within a bounded budget; collision, unauthorized, out-of-bounds, throttled, and resource failures follow the manifest policy.
* Disconnect pauses the queue and reconnect resumes only after cursor and revision validation.

Dependencies:
* Step 3.1 preflight contract
* Existing client socket and cache mutation behavior

## Implementation Phase 4: Canonical Persistence and E2E Verification

<!-- parallelizable: false -->

### Step 4.1: Add server import-shaped placement coverage

Use existing repository and socket contracts to test imported payloads without adding a server bulk endpoint. Cover authorization, expected revisions, collisions, idempotent operation replay, spatial references, patch operations, revision advancement, snapshots, and replay.

Files:
* `apps/server/src/db/repository.postgres.integration.test.ts` or the narrow existing server test surface
* `apps/server/src/index` tests where socket ACK behavior is covered

Success criteria:
* Imported placements exercise the same canonical persistence and replay path as manual placement.
* Repeating an operation ID produces no duplicate durable tile or operation rows.

Dependencies:
* Phase 3 queue contract
* Real Postgres integration environment for persistence assertions

### Step 4.2: Add client and multi-replica E2E import coverage

Create a small deterministic fixture and a bounded larger fixture. Import through the actual client, verify accepted and rejected outcomes, reconnect through another replica, replay from cursors, compare canonical tile IDs, transforms, colors, materials, and revisions, and verify no duplicate operations after retry. Attach manifest and fidelity evidence to test output where the harness supports artifacts.

Files:
* `e2e/alexander-mosaic-import.spec.ts`
* `e2e/support` helpers only when existing authenticated multi-replica fixtures cannot express the target
* `playwright.config.ts` only if a focused project is needed

Success criteria:
* Persistence, replay, reconnect convergence, and bounded submission are demonstrated with executable tests.
* The deterministic fixture meets the agreed fidelity threshold and records skipped or conflicted candidates.

Dependencies:
* Step 4.1 server coverage
* Phase 3 client queue
* Product target and fidelity threshold

### Step 4.3: Validate the canonical import phase

Validation commands:
* `npm run test:client`
* `npm run test:server`
* `npm run build:client`
* `npm run build:server`
* `npm run lint:client`
* `npm run lint:server`
* `npm run test:e2e:multi-replica` with the focused Alexander spec

## Implementation Phase 5: Full Validation and Handoff

<!-- parallelizable: false -->

### Step 5.1: Run full project validation

Execute the offline source, manifest, fidelity, client, server, build, lint, and multi-replica E2E commands. Confirm generated output hashes and ensure no dev servers remain running after validation.

### Step 5.2: Resolve minor validation issues

Fix isolated lint, type, fixture, and threshold issues within the scoped files. Re-run the failing focused command before broad validation.

### Step 5.3: Report blockers and defer agent-owned writes

Record unresolved product or environment blockers. Treat agent-owned writes as a separate follow-up requiring agent identity, patch ownership eligibility, ordinary authenticated socket use, feature flags, audit, checkpoints, bounded retries, and multi-replica tests. Do not expand v1 into that authority change without an explicit product decision.

## Implementation Phase 6: Optional Agent-Owned Write Follow-Up

<!-- parallelizable: false -->

### Step 6.1: Design and implement only after approval

Extend worker and server authority through ordinary authenticated contracts, preserving canonical server authority. Add agent identity and ownership policy, manifest checkpointing, audit and telemetry, disabled-agent behavior, stale revision and collision handling, idempotent retry, transfer, reconnect, and multi-replica coverage.

Files:
* `apps/agent-worker/src/gateway.py`
* `apps/agent-worker/src/tools.py`
* `apps/agent-worker/src/workflow.py`
* `apps/server/src/` agent authorization and assignment surfaces identified after product approval
* `apps/agent-worker/tests/` and relevant E2E tests

Dependencies:
* Explicit product decision that v1 must be fully agent-committed
* Separate authority and threat-model research

## Dependencies

* Existing Node and client/server test toolchains
* Existing authenticated multi-replica E2E environment
* PostgreSQL for persistence integration checks
* Product decisions on target patch, budgets, collision policy, fidelity threshold, and v1 actor

## Success Criteria

* Deterministic generation reproduces identical manifest and fidelity hashes from identical inputs.
* Client preflight rejects invalid manifests before mutation and reports structured reasons.
* Every accepted tile travels through `quilt_place_tile` and canonical server persistence.
* Persistence, idempotent replay, patch history, snapshots, reconnect, and multi-replica convergence pass executable checks.
* Fidelity meets the agreed threshold and documents skipped or conflicted candidates.
* v1 contains no direct SQL import and no agent-only mutation authority unless separately approved.
