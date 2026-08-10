---
title: Alexander Placement Manifest Import Phase 1 Validation
description: Evidence-based validation of Phase 1 product contract and target geometry
ms.date: 2026-08-09
ms.topic: validation
---
<!-- markdownlint-disable-file -->

## Validation Status

Partial.

The Phase 1 engineering contract, topology mapping, geometry policy, runtime
deployment binding, and focused tests are implemented. Release-critical product
inputs remain unresolved, and the placement contract does not validate emitted
tile colors.

## Scope

Phase 1: Product Contract and Target Geometry. Validation compared the Phase 1
checklist and detailed criteria with the completed changes log, the primary
research handoff, the planning log, implementation sources, and focused tests.

The plan's product-decision revision is controlling: the manifest is portable
and source-local; an import operation provides the deployment rectangle and
transform. This supersedes the earlier detail wording that implied deployment
data would be embedded in the manifest.

## Requirement Coverage

| Plan item | Status | Verified evidence |
|------------|--------|-------------------|
| Step 1.1: Record a user/operator v1 boundary and conservative defaults | Validated | `scripts/alexander-placement-contract.mjs:17-31` defines the actor, candidate-budget marker, four in-flight limit, two stale-revision retries, pause/resume cancellation, deterministic skip-and-record policy, and square/ceramic/zero-rotation/no-mirror geometry. The same defaults are represented in `apps/client/src/domain/mosaicImport.ts:5-6` and exercised by `apps/client/src/domain/mosaicImport.test.ts:76-116`. |
| Step 1.1: Resolve canonical quilt, target rectangle, transform, ownership, and cursors without generator-side identity | Validated as revised; release input remains open | `scripts/alexander-placement-contract.mjs:33-40` requires the canonical quilt from entry, an explicit per-operation rectangle and transform, and live cache-derived cursors and ownership. `apps/client/src/App.tsx:1340-1356` rejects absent deployment data and requires a ready canonical V2 quilt. `apps/client/src/domain/mosaicImport.ts:199-203` derives bound positions only from the supplied deployment. `scripts/generate-alexander-patch-manifest.test.mjs:95-150` proves the source manifest contains no quilt ID, patch ID, target rectangle, world position, or footprint. |
| Step 1.2: Mirror client/server supported tile contracts | Validated | `scripts/alexander-placement-contract.mjs:10-15` lists the eight supported shapes and three materials. These match `apps/client/src/domain/tileGeometry.ts:4-17` and `apps/server/src/contracts.ts:34-47`. The parity test at `scripts/generate-alexander-patch-manifest.test.mjs:21-39` reads both files and verifies every enum member. |
| Step 1.2: Use finite canonical topology and wrapping | Validated | `scripts/alexander-placement-contract.mjs:1-8` encodes the 32 by 32, 31.2 by 20.4 topology. `scripts/alexander-placement-contract.mjs:57-69` positive-modulo wraps both axes. This matches the authoritative decision in `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:50-62`; `scripts/generate-alexander-patch-manifest.test.mjs:41-51` verifies an edge-crossing coordinate. |
| Step 1.2: Maintain square footprint parity and reject invalid placement geometry | Validated except color validation | `scripts/alexander-placement-contract.mjs:111-148` derives a square footprint using the client unit size and rejects unsupported shapes, materials, and non-finite transforms. `scripts/generate-alexander-patch-manifest.test.mjs:66-93` verifies the 0.88-unit square bounds and rejection cases. Runtime preflight re-derives the footprint and rejects out-of-rectangle results in `apps/client/src/domain/mosaicImport.ts:159-177`. |
| Research constraint: retain canonical import rather than a new mutation surface | Validated | The research selects a deterministic manifest plus existing `quilt_place_tile` flow in `.copilot-tracking/research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md:211-236`. `apps/client/src/App.tsx:1363-1374` builds ordinary placement requests and emits `quilt_place_tile`; the changes log states no bulk endpoint, SQL path, or agent write authority was added. |

## Findings

### Major

* The exact release deployment rectangle, source-to-world transform, patch set,
	and fidelity threshold have not been supplied or recorded. Phase 1 requires
	these to be resolved before release in
	`.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md:18-37`.
	The planning log explicitly retains them as release gates in
	`.copilot-tracking/plans/logs/2026-08-09/alexander-placement-manifest-import-log.md:17-34`
	and `:64-69`. The implementation correctly refuses missing deployment data
	(`apps/client/src/App.tsx:1340-1356`), but it cannot produce a release-ready
	import until product provides and approves those values.

* Emitted and imported tile colors are not validated as supported values. The
	generator copies `palette.hex` into each placement at
	`scripts/generate-alexander-patch-manifest.mjs:111-119`, while
	`assertSupportedPlacement` validates only shape, material, and numeric
	transforms at `scripts/alexander-placement-contract.mjs:145-154`. Runtime
	preflight checks shapes and materials, but not `tile.color`, at
	`apps/client/src/domain/mosaicImport.ts:159-168`; the focused tests contain
	no invalid-color case (`apps/client/src/domain/mosaicImport.test.ts:36-74`).
	This does not meet the Phase 1 criterion that every emitted placement use a
	supported color. Add a defined color format or palette-membership check in
	generation and preflight, then add rejection coverage.

### Minor

* None.

## Approved Deviations

The plan's product-decision revision intentionally replaces a manifest-bound
target with deployment-time binding. The planning log documents the portable
schema-v2 model and live runtime derivation in
`.copilot-tracking/plans/logs/2026-08-09/alexander-placement-manifest-import-log.md:17-38`.
The changes log records the same decision. This is an approved design revision,
not a validation finding.

## Coverage Assessment

Four of five assessed Phase 1 criteria are validated. The actor boundary,
default operational limits, portable deployment contract, enum parity, finite
toroidal topology, explicit mapping, square footprint parity, and pre-mutation
boundary checks are evidenced in source and focused tests. The phase is partial
because release inputs are intentionally unresolved and color validity is not
enforced.

## Validation Commands

```text
npm run test:alexander-patch-manifest
Result: passed, 6 tests

npm run test --workspace=apps/client -- src/domain/mosaicImport.test.ts
Result: passed, 11 tests
```

## Clarifying Questions

* Which owned patch or patch set, deployment rectangle, source-to-world
	transform, and fidelity threshold are approved for the first release?
* Is a supported color any valid CSS hex value, or must it be a member of the
	manifest's provenance-tracked palette?

## Next Validations

* Re-run the two focused suites after adding color validation and its negative
	tests.
* Validate a manifest against the product-approved deployment rectangle,
	transform, patch ownership, and fidelity threshold.
* Execute the later-phase server persistence, replay, reconnect, and
	multi-replica tests after the release inputs are selected.