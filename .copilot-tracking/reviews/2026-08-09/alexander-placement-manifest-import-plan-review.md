<!-- markdownlint-disable-file -->
# Implementation Review: Alexander Placement Manifest Import

## Review Metadata

* Review date: 2026-08-09
* Related plan: `.copilot-tracking/plans/2026-08-09/alexander-placement-manifest-import-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-08-09/alexander-placement-manifest-import-changes.md`
* Research: `.copilot-tracking/research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md`
* Review scope: Phases 1 through 5; Phase 6 is explicitly deferred.
* Review state: Complete

## Validation Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Major    | 9 |
| Minor    | 3 |

## Phase Validation

| Phase | Status | Evidence |
|-------|--------|----------|
| 1. Product Contract and Target Geometry | Partial | Portable schema-v2 deployment binding, geometry parity, topology wrapping, and focused tests are present. Release deployment inputs and color validation are unresolved. |
| 2. Deterministic Manifest and Fidelity Artifacts | Partial | Generator and scorer tests pass, but generated release artifacts are unavailable and their production-run claims cannot be independently verified. |
| 3. Client Parser, Preflight, and Bounded Queue | Needs rework | The queue uses a stale cache closure for expected revisions; preflight lacks topology and current-cursor checks. |
| 4. Canonical Persistence and E2E Verification | Partial | Import-shaped server persistence test passes. E2E bypasses the client queue, and the configured multi-replica suite is not green. |
| 5. Full Validation and Handoff | Needs rework | Agent-write deferral is preserved, but the stale-revision defect prevents a reliable multi-placement import. |

Detailed phase evidence is in `.copilot-tracking/reviews/rpi/2026-08-09/`.

## Implementation Quality

The full-quality assessment is recorded in
`.copilot-tracking/reviews/implementation/2026-08-09/alexander-placement-manifest-import-plan-full-quality.md`.

### Critical Findings

* `apps/client/src/App.tsx:1359-1367` closes the queue's expected-revision
	callback over the cache at import start. ACK and resync updates are therefore
	not available to subsequent requests, so same-patch imports can exhaust the
	stale-revision retry budget.
* `apps/client/src/domain/mosaicImport.ts:87-93` does not receive topology,
	world-bounds, ownership, or current cursor state. Preflight cannot reject
	missing cursor or invalid topology conditions before mutation.

### Major Findings

* Optimistic tiles are not removed after rejected queue outcomes.
* Unsupported shapes can throw while preflight derives bounds instead of
	returning structured rejection results.
* The generator reports a serialized byte count and artifact hash calculated
	before the final byte count is written to the manifest.
* The E2E fixture emits raw Socket.IO placements and does not test manifest
	parsing, queueing, deployment binding, or client cache reconciliation.
* Color and manifest-policy validation are absent.
* Reconnect can resume after one patch state without validating every affected
	cursor.
* Release deployment rectangle, transform, patch set, and fidelity threshold
	remain unrecorded.
* Generated manifest and fidelity-report outputs are ignored and unavailable
	for review of the claimed 760-placement production run.
* The configured multi-replica suite fails before the reconnect test because
	replica A refuses `127.0.0.1:3201`.

### Minor Findings

* Generator tests omit missing-input and input-hash mismatch cases.
* Client tests omit App-level revision refresh, cursor availability, topology,
	and multi-patch reconnect coverage.
* Phase 2 details retain generator-side collision and bounds work despite the
	approved portable deployment model assigning those checks to runtime.

## Validation Commands

| Command | Result |
|---------|--------|
| `npm run test:alexander-patch-manifest` | Passed, 6 tests |
| `npm run test:alexander-patch-fidelity` | Passed, 2 tests |
| `npm run test --workspace=apps/client -- src/domain/mosaicImport.test.ts` | Passed, 11 tests |
| `npm run test:server -- src/db/repository.postgres.integration.test.ts` | Passed, 13 tests |
| `npm run lint:client` | Passed |
| `npm run build:client` | Passed with existing Vite configuration and chunk-size warnings |
| `npm run lint:server` | Passed |
| `npm run build:server` | Passed |
| `npm run test:e2e:multi-replica` | Failed: replica A refused `127.0.0.1:3201`; Alexander direct-protocol spec passed |
| Diagnostics for reviewed sources and review records | Passed |

Ports `3001` and `5173` remained occupied by pre-existing processes throughout
the review. The review did not start or leave any additional listener.

## Missing Work and Deviations

* The changes log claim that the E2E test proves bounded client import is not
	supported: the test directly emits protocol requests.
* The changes log claim of a verified production manifest, report, and hashes
	cannot be reproduced from the current ignored-output workspace state.
* Agent-owned writes remain correctly deferred as Phase 6 and are not a
	finding against this implementation.

## Follow-Up Recommendations

### Rework Required

1. Make queue callbacks read current cache and topology state through refs or a
	 queue state refresh API. Add a same-patch stale-revision resume test.
2. Extend preflight with topology, world bounds, ownership, current cursors,
	 color, and policy validation. Validate shape before calculating bounds.
3. Remove optimistic tiles for rejected operations and correct final-manifest
	 byte and hash calculation.
4. Add a browser E2E path that dispatches a manifest with deployment data and
	 verifies bounded queueing, stale recovery, replay, and reconnect.
5. Repair replica-A startup reliability and rerun the configured multi-replica
	 command.

### Deferred From Scope

* Agent-owned writes, authority, auditing, checkpoints, and multi-replica
	coverage remain Phase 6 work pending explicit product approval.

### Product Decisions Needed

* Approve the release patch set, deployment rectangle, source-to-world
	transform, fidelity threshold, and color contract.
* Choose a durable publication mechanism for ignored generated run evidence.

## Overall Status

Needs Rework. Critical queue and preflight correctness gaps block acceptance;
the focused generator, fidelity, persistence, lint, and build checks passing do
not mitigate those runtime failures.
