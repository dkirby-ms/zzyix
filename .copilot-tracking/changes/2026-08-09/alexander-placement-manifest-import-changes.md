<!-- markdownlint-disable-file -->
# Release Changes: Alexander Placement Manifest Import

**Related Plan**: alexander-placement-manifest-import-plan.instructions.md
**Implementation Date**: 2026-08-09

## Summary

Implementation tracking for deterministic Alexander placement-manifest generation, canonical client import, and validation.

## Changes

### Added

* `scripts/generate-alexander-patch-manifest.mjs` exposes the neutral Phase 1
  generator contract, backed by `scripts/alexander-placement-contract.mjs`, and
  establishes the topology, supported tile/material enums, explicit
  source-to-world mapping, square footprint, and v1 import defaults.
* `scripts/generate-alexander-patch-manifest.test.mjs` verifies enum parity,
	topology wrapping, explicit coordinate mapping, square footprint parity, and
	finite supported placement validation.
* `scripts/score-alexander-patch-fidelity.mjs` rasterizes selected source boxes,
  verifies manifest and normalized-source provenance, and emits threshold evidence
  for color error, edge retention, and retained feature coverage.
* `scripts/score-alexander-patch-fidelity.test.mjs` covers deterministic passing
  evidence, manifest provenance, and a known strict-threshold color failure.

### Modified

* Phase 1 product boundary is recorded as a user or operator-triggered import
  into the canonical protocol-V2 quilt. The canonical quilt ID is supplied by
  the import target, while the operator-selected owned patch, world rectangle,
  and source-to-world transform are required manifest inputs and are never
  inferred at runtime.
* Provisional import defaults are four in-flight placements, two stale-revision
	retries, pause-and-resume cancellation, configured candidate budget, and
	deterministic skip-and-record conflict handling. The release fidelity
	threshold remains an explicit product gate and is represented in the manifest
	contract rather than silently defaulted.

### Removed

## Additional or Deviating Changes

* Geometry starts with `square`, `ceramic`, zero rotation, and no mirroring.
  The neutral contract mirrors the existing client/server enums and square
  footprint; richer shapes remain a later, evidence-driven extension.
* Phase 2 adds stable rank and candidate-ID ordering, explicit candidate and
  placement budgets, deterministic duplicate/collision/bounds skip records,
  source feature-region coverage, and canonical manifest self-hash verification.
* `package.json` exposes manifest generation, manifest tests, fidelity scoring,
  and fidelity tests as explicit commands.
* `apps/client/src/domain/mosaicImport.ts` adds pure manifest parsing,
  preflight, bounded queue execution, retry, cancellation, and reconnect
  pause/resume behavior; `apps/client/src/App.tsx` integrates the queue with
  the existing placement and cache reconciliation path.
* `apps/server/src/db/repository.postgres.integration.test.ts` adds
  import-shaped canonical persistence coverage, and
  `e2e/alexander-mosaic-import.spec.ts` proves bounded import, replay,
  reconnect, and multi-replica convergence.

## Validation

* Source provenance, preprocessing, mosaic-input, manifest, and fidelity tests
  passed.
* Regenerating the manifest twice produced the same output hash:
  `3313069d7e0a44cf11fe261ea6289fe4ce2aa5d70cdfb71e5206f182d1e6d0bf`.
* Rescoring twice produced the same fidelity-report hash:
  `59c15f8cdf1017e0a772402e67a392e4654b5ce230b673afb387ec37de9bfd8d`.
* Client tests passed: 206 passed and 16 skipped. Server tests passed: 261
  passed and 1 skipped. Client/server builds and lint passed.
* The multi-replica Alexander import test passed. The combined run initially
  encountered a transient refusal on replica A during the reconnect spec; the
  focused reconnect rerun passed. No application change was required.
* Post-validation checks found no process listening on ports 3001, 5173, 3201,
  3202, or 3299.

## Release Summary

Phases 1 through 5 are complete. The generated manifest contains 331 accepted
placements and 429 recorded skips with generator self-hash
`b5464f66617046f0254134f4982dfd2576648334e34fd7d8de466af01e55853c`.
The fidelity report passes its configured threshold. Agent-owned writes remain
deferred to Phase 6 and require an explicit product decision plus separate
authority, audit, checkpoint, retry, and multi-replica coverage work.
