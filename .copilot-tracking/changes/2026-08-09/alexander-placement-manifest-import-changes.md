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

* The manifest contract is schema-v2 and portable. Generated placements contain
  source-local normalized anchors and tile attributes only. They do not contain
  quilt IDs, patch IDs, deployment rectangles, source-to-world transforms,
  world-space positions, or world footprints.
* Import callers dispatch `{ manifest, deployment }`, with an explicit target
  world rectangle and source-to-world transform. `App.tsx` resolves the active
  canonical quilt through the canonical-world descriptor and derives affected
  patch cursors from the live quilt cache before each `quilt_place_tile`
  request. No import-specific SQL, bulk endpoint, or agent write authority was
  added.
* Phase 1 product boundary is recorded as a user or operator-triggered import
  into the active canonical protocol-V2 quilt. The deployment supplies its
  world rectangle and source-to-world transform; the client resolves the quilt
  and derives affected patch ownership and cursors from live runtime state.
* Provisional import defaults are four in-flight placements, two stale-revision
	retries, pause-and-resume cancellation, configured candidate budget, and
	deterministic skip-and-record conflict handling. The release fidelity
	threshold remains an explicit product gate and is represented in the manifest
	contract rather than silently defaulted.
* Phase 7 refreshes queue state from current client refs, removes optimistic
  tiles for retry and terminal rejection outcomes, validates runtime import
  context before mutation, and covers same-patch stale-revision recovery.
* The Alexander E2E path now authenticates into the browser client and invokes
  parser, preflight, and bounded queue behavior. The test no longer shuts down
  Playwright-managed shared replica servers.

### Removed

## Additional or Deviating Changes

* Review-driven corrective work has reopened Phase 7 for queue freshness,
  preflight completeness, generator finalization, browser-path E2E, and
  validated handoff claims.
  * Reason: The 2026-08-09 implementation review identified critical queue and
    preflight correctness defects that invalidate prior completion claims.
* Phase 7 corrected the review findings without expanding v1 authority scope.
  * Queue callbacks now read current state, preflight validates live runtime
    constraints, generated metadata is finalized before provenance is checked,
    and E2E drives the browser path. Replica-A refusal was caused by test-owned
    teardown of shared servers and is fixed by leaving teardown to Playwright.

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
* Phase 7 checks passed: 7 manifest tests, 2 fidelity tests, 20 focused client
  import tests, 13 focused server repository integration tests, client/server
  lint, and client/server builds.
* `npm run test:e2e:multi-replica` passed with 2 tests passed and 1 skipped.
  The browser scenario exercises client parsing, preflight, bounded submission,
  stale recovery, replay, and replica convergence. Ports 3001, 5173, 3201,
  3202, and 4174 were free after validation.

## Release Summary

Phases 1 through 5 and review-driven Phase 7 are complete. The schema-v2
manifest is portable, and the browser import validates live deployment,
topology, ownership, cursor, color, and policy constraints before submitting
canonical placements. Agent-owned writes remain deferred to Phase 6 and require
an explicit product decision plus separate authority, audit, checkpoint, retry,
and multi-replica coverage work. Release deployment values, fidelity threshold,
and ignored-artifact publication remain product or release-process gates.
