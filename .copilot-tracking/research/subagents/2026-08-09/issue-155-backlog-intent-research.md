---
title: Issue 155 Backlog Intent Research
description: Product intent, architecture constraints, and backlog evidence for autonomous historical mosaic recreation
author: GitHub Copilot
ms.date: 2026-08-09
ms.topic: research
---

## Scope

* #162: Parse and preflight mosaic import payloads
* #163: Import mosaic placements through bounded revision-safe windows
* #164: Verify mosaic imports use canonical persistence and replay path
* #165: Cover deterministic import retries, conflicts, and reconnect convergence
* #166: Enforce visual fidelity acceptance for Alexander patch
* #167: Run final validation and capture Alexander patch handoff

Primary evidence:

* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/handoff.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/handoff-logs.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/issues-plan.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/issue-analysis.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/planning-log.md`

The prior review trail says the preprocessing slice passed, but broader issue 155 work remains deferred. `.copilot-tracking/reviews/2026-08-07/alexander-mosaic-patch-plan-review.md` states that issue #159 passed with follow-on work assigned, while #160 through #164 own patch-compatible tessera generation, fidelity reports, importer preflight, revision-safe import windows, and persistence/replay verification. `.copilot-tracking/reviews/rpi/2026-08-07/alexander-mosaic-patch-plan-001-validation.md` independently concludes that the implementation is partial and cannot be reported complete until patch payload generation, client import, persistence/replay verification, fidelity evidence, and end-to-end acceptance are implemented.

No persistent creation script remains in `scripts/` for creating these GitHub issues. Current `scripts/` contains Alexander provenance, preprocessing, input generation, and tests, but not `scripts/create-alexander-mosaic-issues.mjs`. The terminal context also showed `test ! -e scripts/create-alexander-mosaic-issues.mjs && echo 'temporary creation script removed'`, confirming a temporary creation script was removed.

## Current Implementation Evidence

Current source/provenance work exists:

* `offline/reference/alexander-source-license-records.json` records the Alexander Mosaic artwork, House of the Faun origin, public-domain status, Wikimedia Commons source URL, original URL, dimensions, checksum, crop, output recipe, retention targets, feature regions, preprocessing artifact names, and mosaic input artifact names.
* `offline/reference/README.md` explains verification, live checksum validation, deterministic preprocessing, and downstream palette/tile-candidate input generation.
* `package.json` exposes `verify:alexander-source`, `preprocess:alexander-source`, `test:preprocess-alexander-source`, `generate:alexander-mosaic-inputs`, and `test:alexander-mosaic-inputs`.

Current preprocessing and candidate generation exist:

* `scripts/preprocess-alexander-source.mjs` implements deterministic source decoding, CIELAB conversion, luminance normalization, LAB bilateral denoising, saliency and edge masks, and retention-target validation for face, weapon, armour, and contour.
* `scripts/generate-alexander-mosaic-inputs.mjs` reads preprocessing artifacts, extracts a weighted LAB palette, ranks candidate cells by edge density, saliency, and contrast, and writes palette/candidate artifacts.
* `scripts/preprocess-alexander-source.test.mjs` and `scripts/generate-alexander-mosaic-inputs.test.mjs` cover determinism, expected artifact shape, palette constraints, ranked candidates, and edge-bearing cell inclusion.
* `offline/output/alexander-preprocessed/` currently contains generated normalized, LAB, luminance, denoised preview, saliency, edge, and preprocessing config artifacts.
* `offline/output/alexander-mosaic-inputs/` currently contains generated palette, tile-candidate, and input config artifacts.
* `.gitignore` excludes `/offline/output/`, so these generated artifacts are local reproducible evidence rather than tracked source.

Current missing implementation surfaces are also explicit:

* No `apps/client/src/**/mosaicImport*` file exists.
* No `e2e/*mosaic*` test exists.
* No `offline/output/patch-manifest.json` or generated patch payload was found in tracked file search.
* `scripts/generate-alexander-mosaic-inputs.mjs` emits palette and ranked cell candidates, not app-supported tile placements or a patch payload.
* No machine-readable Alexander patch fidelity scorer was found at the planned location.

## Repository Conventions And Architecture Constraints

The canonical quilt is the central implementation boundary. `docs/canonical-quilt-data-storage.md` states that the quilt is one finite, wrapped world stored in PostgreSQL, not one large image or JSON document. It stores each tile once, indexes it by patch/chunk, and records affected patch history independently. The browser loads nearby durable world data and renders translated periodic images when crossing edges.

The finite toroidal topology decision in `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` fixes the supported product around one canonical protocol-V2 toroidal quilt with 32 patch rows, 32 patch columns, patch size 31.2 by 20.4 world units, half-open canonical coordinates, and patch boundaries as ownership and transaction surfaces. It also says periodic display must not create additional persisted content.

The existing client placement path is the intended import boundary. `apps/client/src/App.tsx` defines `CANONICAL_MUTATION_EVENT_NAMES` including `quilt_place_tile`, computes expected patch revisions from the local quilt cache, and uses `placeFromState` to emit `quilt_place_tile` with `quiltId`, `operationId`, `expectedPatchRevisions`, and tile payload. Successful ACKs reconcile patch revisions and apply placements to cache; rejected ACKs clear optimistic state and pulse invalid feedback.

The existing server placement path must remain authoritative. `apps/server/src/index.ts` validates `QuiltPlaceTileRequest` payloads, rejects disabled or malformed mutations, calls `persistQuiltTilePlacement`, maps unauthorized/stale/collision failures to ACK codes, and broadcasts accepted patch events. `apps/server/src/db/repository.ts` canonicalizes wrapped positions, derives affected patches, locks patches, verifies patch ownership and revision preconditions, checks collision validity, writes canonical tile state, and records patch operations in one transaction.

The server currently restricts canonical placement to active human principals in `persistQuiltTilePlacement`: the locked-patch authorization check requires `principal?.kind === 'human'`, active principal status, active patch state, and owner match. This is a current-code blocker for autonomous agent-owned mutation even though the resident-agent architecture approves future agent principals.

The agent architecture must not become a shortcut around authority. `docs/decisions/2026-08-07-resident-agent-architecture.md` says resident agents should act as ordinary authenticated API clients and preserve server authority for ownership, validation, revisions, idempotency, ordering, and transactions. It allows deterministic worker behavior for candidate operations, but model output is not approved for placement, deletion, color selection, authorization, retry, or collision decisions.

`docs/fantome-resident-agent-architecture.md` further narrows the current Mosaic Agents MVP: the Python Microsoft Agent Framework worker uses read-only tools and structured proposals, with any future canvas mutation required to pass through the same server contracts used by humans. `apps/agent-worker/README.md` describes the implemented worker as a durable, read-only control-plane worker that reads authorized server state, creates observation-only proposals, and does not mutate canonical quilt state.

The supported tile contract constrains generated output. `apps/client/src/domain/tileGeometry.ts` currently supports `square`, `triangle`, `rectangle`, `l-shape`, `large-square`, `circle`, `right-triangle`, and `large-right-triangle`; materials are `ceramic`, `glass`, and `stone`. Client and server placement solvers validate geometry and bounds. Server protocol limits include `QUILT_V2_MAX_SNAPSHOT_TILES` defaulting to 2,000 and `QUILT_V2_MAX_PAYLOAD_BYTES` defaulting to 256 KiB in `apps/server/src/index.ts`.

Testing conventions are split by surface:

* Root `npm test` runs workspace tests.
* Client tests use Vitest and Testing Library through `apps/client/package.json`.
* Server tests use Vitest through `apps/server/package.json`.
* Script tests use Node's built-in test runner from root scripts.
* Playwright end-to-end tests run through `playwright.config.ts`, with ports 3199, 3101, and 4173 for test OIDC, server, and client.
* Agent worker tests use pytest from `apps/agent-worker/pyproject.toml`.

## Inferred Acceptance Criteria

Issue 155 can be considered complete only when both the product behavior and architecture boundaries are satisfied.

Functional acceptance criteria:

* A famous ancient mosaic recreation flow exists inside the app, initially targeting the Alexander Mosaic.
* The selected source image and all generated working artifacts are reproducible from a manifest with source URL, license, attribution, retrieval date, crop, checksum, and generator configuration.
* Generated output becomes app-supported tile placements, not only palette colors or candidate cells.
* Generated placements use only supported shapes, materials, colors, transforms, and topology-valid coordinates.
* The first version imports through the existing `quilt_place_tile` protocol and does not introduce direct SQL writes or a new mutation event.
* Imports use expected patch revisions, bounded in-flight windows, deterministic retry or skip behavior, and observable ACK, timeout, stale revision, and conflict outcomes.
* Imported tiles persist transactionally, append patch operations, advance patch revisions monotonically, and replay identically after reconnect.
* Autonomous operation, if performed by a resident agent, uses a first-class active agent principal and the same server authority path as humans. It must not rely on model output as mutation authority.

Fidelity and evidence criteria:

* The Alexander recreation preserves recognizability of the selected benchmark, including face, weapon, armour/contour, and other agreed salient regions for the chosen source.
* A machine-readable fidelity report records luminance MS-SSIM, edge F1, directional divergence, silhouette IoU, weighted score, tile count, and conflict count.
* The intended weighted formula is 0.30 MS-SSIM_L + 0.25 EdgeF1 + 0.25 (1 - D_theta) + 0.20 SilhouetteIoU.
* Thresholds and failure reasons are machine-readable and release-blocking.
* A reviewer can reproduce the score from the manifest, source checksum, generated payload, and scoring command.
* The first benchmark pack receives explicit human visual QA.

Regression and quality criteria:

* Malformed payloads fail client preflight validation without partial writes.
* Unit tests cover deterministic generation, payload validation, queue behavior, stale revision retry, conflict skipping, ACK reconciliation, and payload budget handling.
* Server tests cover socket guards, repository persistence, patch operation append, snapshots, and replay for imported placements.
* End-to-end tests prove a bounded patch imports to the same final state on a clean client and after reconnect.
* Existing manual placement, collaboration, ownership, reconnect, and smoke tests remain green.
* Final validation runs lint, build, unit tests, focused end-to-end tests, fidelity checks, and process cleanup checks.

## Planning-Ready Remaining Work Themes

### Theme 1: Close Source-Pack And Manifest Contract

Evidence suggests #157 and part of #159 are effectively implemented for the selected close-up source, while #158 remains open as the broader patch manifest/runtime contract. This theme should close any mismatch between current local artifacts and GitHub issue state, then define the versioned patch manifest that downstream generator and importer work consume.

Scope:

* Confirm whether #157 and #159 are complete in GitHub state.
* Decide whether the selected Alexander close-up remains the v1 target or whether full-scene horse retention is required.
* Define patch manifest schema and validation fixtures.
* Carry current feature-region metadata into the patch-generation contract.

### Theme 2: Generate Patch-Compatible Tessera Placements

Current candidate generation stops before app-supported placements. #160 is the natural planning unit for converting palette/candidate outputs into deterministic tile placement payloads.

Scope:

* Generate fixed-grid baseline placements inside the canonical patch topology.
* Apply saliency-driven density or orientation refinement without illegal overlap.
* Use deterministic conflict resolution.
* Enforce supported shape/material/color/transform contracts.
* Stay within snapshot, payload, tile-count, and performance budgets.

### Theme 3: Add Fidelity Scoring And Visual Acceptance

#161 and #166 can be planned as a pipeline plus acceptance harness. The scoring should run before app import acceptance, and the first benchmark should include human visual QA.

Scope:

* Rasterize or render generated payloads for comparison.
* Compute weighted fidelity metrics and release-blocking thresholds.
* Record machine-readable reports under a reproducible output path.
* Add a decision record if the benchmark becomes a durable product contract.

### Theme 4: Build Client Import Preflight And Revision-Safe Queue

#162 and #163 should remain coupled but separable. The parser/preflight module can land before socket orchestration. The queue must reuse the existing placement path.

Scope:

* Add an independently tested client domain module for parsing and validating mosaic import payloads.
* Keep import state separate from manual placement state.
* Emit `quilt_place_tile` with expected patch revisions and operation IDs.
* Bound in-flight work, retry stale revisions, skip deterministic conflicts, and report outcomes.

### Theme 5: Verify Server Persistence, Replay, And Reconnect

#164 and #165 cover this theme. The first version should avoid server schema changes unless the import contract truly requires provenance metadata in operation payloads.

Scope:

* Add focused server tests for socket guards, `persistQuiltTilePlacement`, patch operations, snapshot/replay, and monotonic revisions.
* Add E2E coverage proving clean import and reconnect convergence.
* Preserve existing manual placement behavior.
* Validate payload budgets and rejected imports.

### Theme 6: Resolve Autonomy And Agent Mutation Boundary

Issue 155 says "autonomously", but the current agent worker is read-only and the current server placement transaction requires human principals. This should be an explicit planning theme, not an incidental implementation detail.

Scope:

* Decide whether v1 "autonomous" means a human-triggered deterministic importer, a resident-agent-triggered proposal, or actual agent-owned placement.
* If actual agent placement is required, coordinate with the agent-principal mutation roadmap from `docs/decisions/2026-08-07-resident-agent-architecture.md` and `docs/fantome-resident-agent-architecture.md`.
* Ensure agent-generated canvas actions remain deterministic and pass through server authority.
* Keep Foundry/model output limited to context, narration, or proposals unless a future ADR approves mutation proposal expansion.

### Theme 7: Final Validation And Handoff

#167 is still useful as the closing quality gate.

Scope:

* Run root lint, build, unit tests, focused script tests, focused Playwright import tests, and fidelity threshold checks.
* Confirm no development/test servers remain on the configured ports after validation.
* Capture generated artifact paths, validation status, deviations, and residual risks.
* Add the missing `.copilot-tracking/changes/2026-08-06/alexander-mosaic-patch-changes.md` or a successor changes log for traceability.

## Evidence Log

Key source files and artifacts reviewed:

* `README.md`
* `apps/client/PRODUCT.md`
* `apps/client/DESIGN.md`
* `apps/client/README.md`
* `CHANGELOG.md`
* `package.json`
* `apps/client/package.json`
* `apps/server/package.json`
* `apps/agent-worker/README.md`
* `apps/agent-worker/pyproject.toml`
* `playwright.config.ts`
* `.gitignore`
* `docs/canonical-quilt-data-storage.md`
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`
* `docs/decisions/2026-08-07-resident-agent-architecture.md`
* `docs/fantome-resident-agent-architecture.md`
* `docs/decisions/2026-07-15-deployment-architecture-v01.md`
* `offline/reference/alexander-source-license-records.json`
* `offline/reference/README.md`
* `scripts/preprocess-alexander-source.mjs`
* `scripts/generate-alexander-mosaic-inputs.mjs`
* `scripts/preprocess-alexander-source.test.mjs`
* `scripts/generate-alexander-mosaic-inputs.test.mjs`
* `apps/client/src/App.tsx`
* `apps/client/src/domain/tileGeometry.ts`
* `apps/client/src/domain/placementSolver.ts`
* `apps/server/src/index.ts`
* `apps/server/src/contracts.ts`
* `apps/server/src/db/repository.ts`
* `apps/server/src/db/schema.ts`
* `.copilot-tracking/research/2026-08-06/alexander-mosaic-patch-research.md`
* `.copilot-tracking/plans/2026-08-06/alexander-mosaic-patch-plan.instructions.md`
* `.copilot-tracking/details/2026-08-06/alexander-mosaic-patch-details.md`
* `.copilot-tracking/reviews/2026-08-07/alexander-mosaic-patch-plan-review.md`
* `.copilot-tracking/reviews/rpi/2026-08-07/alexander-mosaic-patch-plan-001-validation.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/issue-analysis.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/issues-plan.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/handoff.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/handoff-logs.md`
* `.copilot-tracking/github-issues/discovery/alexander-mosaic-patch/planning-log.md`
* `.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issue-analysis.md`
* `.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md`

Generated local artifact directories observed:

* `offline/output/alexander-preprocessed/`
* `offline/output/alexander-mosaic-inputs/`

Negative evidence observed:

* No `apps/client/src/**/mosaicImport*` file found.
* No `e2e/*mosaic*` test found.
* No `scripts/create-alexander-mosaic-issues.mjs` found.
* No tracked patch manifest or app-ready placement payload found.

## Recommended Next Research Not Completed

* Query GitHub issue state for #155 through #167 to confirm which child issues are open, closed, linked, labeled, and assigned. Local artifacts say they were created, but this research did not fetch live GitHub state.
* Compare branch `agent-alex` against `main` to isolate exactly which Alexander artifacts are branch-only and which are already on default branch.
* Inspect ignored generated JSON contents under `offline/output/` in detail to record exact palette size, candidate count, checksums, and current feature-retention metrics in a release handoff.
* Run the focused Alexander script checks if implementation planning needs fresh validation evidence: `npm run verify:alexander-source`, `npm run test:preprocess-alexander-source`, and `npm run test:alexander-mosaic-inputs`.
* Research whether issue #159 was formally closed and whether #157/#158 were updated after the preprocessing review.

## Clarifying Questions

* Does issue 155 require the first shippable version to be fully agent-triggered, or is a deterministic human-triggered importer acceptable as the first autonomous-generation milestone?
* Should the initial Alexander target remain the close-up of Alexander, or must v1 use a full-scene source that includes horse retention?
* Should imported historical mosaics occupy an agent-owned patch, a human-owned patch selected by the user, a special benchmark patch, or a separate review/staging area before committing to the canonical quilt?
* Should provenance metadata be preserved only in offline manifests, or must imported tile operations also carry source/generator metadata in durable patch history?

## Status

Complete for local repository research. Live GitHub issue state and branch-diff verification were not performed in this pass.
