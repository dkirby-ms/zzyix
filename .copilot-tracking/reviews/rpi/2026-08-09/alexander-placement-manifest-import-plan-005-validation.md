---
title: Alexander Placement Manifest Import Phase 5 Validation
description: Evidence-based RPI validation of Full Validation and Handoff for the Alexander placement manifest import plan
ms.date: 2026-08-09
ms.topic: validation
---

## Status

**Failed**. The generated artifact pipeline and focused import-domain validation
pass, but the client queue retains the cache state captured when the import
starts. It cannot derive refreshed patch revisions after an acknowledgement or
resynchronization, so a normal multi-placement import can exhaust stale-revision
retries instead of completing.

## Scope

Validated Phase 5, Full Validation and Handoff, from
`alexander-placement-manifest-import-plan.instructions.md`. The detailed phase
requirements are at
`.copilot-tracking/details/2026-08-09/alexander-placement-manifest-import-details.md:208-218`:
full validation and cleanup, scoped repair and focused reruns, and a separate,
decision-gated agent-write handoff.

## Requirement Coverage

* **Full validation and generated artifacts: Partial.** Source provenance,
  preprocessing, mosaic-input generation, manifest generation, manifest tests,
  fidelity scoring, fidelity tests, focused client tests, and the client build
  completed successfully. The generated manifest has 760 placements and zero
  generator-side skips. The current manifest content hash is
  `f68f75578ff6f67011eef641e2918c77619f1016361380f10d6f49cdb7cdd6d0`.
  The fidelity report passed color error (`0.13085087634411408 <= 0.35`), edge
  retention (`0.9835353881931339 >= 0.25`), and all four feature-coverage
  checks (`>= 0.05`).
* **Canonical persistence, replay, authorization, and protocol reconnect:
  Partially evidenced.** The server integration test covers import-shaped
  persistence, idempotency, unauthorized, stale-revision, collision, snapshot,
  and reconstructed-state behavior at
  `apps/server/src/db/repository.postgres.integration.test.ts:175-243`. The
  multi-replica fixture exercises direct socket requests, replay, and reconnect
  at `e2e/alexander-mosaic-import.spec.ts:105-194`.
* **Actual client-import lifecycle: Failed.** The application binds import
  placements through `startMosaicImport` at `apps/client/src/App.tsx:1340-1396`,
  but the queue reads stale patch revisions after the initial render. See the
  Critical finding.
* **Agent-owned write deferral: Validated.** The worker gateway fixes its safe
  action to `observe` at `apps/agent-worker/src/gateway.py:17` and emits only
  that action at `apps/agent-worker/src/gateway.py:43-46`. No worker mutation
  path or import-specific server mutation endpoint was found. This matches the
  Phase 5 requirement to defer agent-owned writes.

## Findings

### Critical

* **The client import queue never refreshes its captured quilt cache after an
  acknowledgement or resynchronization.**

  `startMosaicImport` constructs `createMosaicImportQueue` with
  `getExpectedPatchRevisions`, which reads the render-time `quiltCache` closure
  at `apps/client/src/App.tsx:1359-1367`. A successful ACK updates React state
  through `setQuiltCache` at `apps/client/src/App.tsx:1376-1384`, while a stale
  revision requests a subscription refresh at
  `apps/client/src/App.tsx:1387-1390`. Neither action replaces the callbacks
  retained by the existing queue. On `resume`, the queue invokes the original
  callback again at `apps/client/src/domain/mosaicImport.ts:279-305` and
  `apps/client/src/domain/mosaicImport.ts:309-314`.

  With the intended four in-flight requests, placements affecting the same
  patch initially share an expected revision. After the first durable write,
  later requests can receive `STALE_REVISION`. Resuming reuses the original
  revision map, repeats that rejection, and after the two retries configured at
  `apps/client/src/domain/mosaicImport.ts:272-276`, records an outcome instead
  of completing the placement. This violates the planned bounded,
  ACK-driven, resumable import and the success criterion requiring committed
  placements to persist and replay.

  Required repair: make queue callbacks read current cache and topology through
  refs, or rebuild the queue only after resync while preserving its state.
  Add an integration test that imports at least two placements in one patch,
  forces a stale revision, refreshes the cursor, and proves the resumed request
  carries the new revision.

### Major

* **The multi-replica E2E test does not invoke the client manifest parser,
  preflight, queue, or browser integration.**

  The fixture builds its own `place` helper and directly emits
  `quilt_place_tile` at `e2e/alexander-mosaic-import.spec.ts:80-103`; the test
  then sends manually defined placement objects at
  `e2e/alexander-mosaic-import.spec.ts:122-161`. It validates the canonical
  socket protocol well, but it cannot observe the client cache lifecycle in the
  Critical finding. `apps/client/src/domain/mosaicImport.test.ts:87-148` also
  tests a queue with a constant synthetic revision provider, so it does not
  model a cache refresh.

  Required repair: retain the protocol E2E test and add browser-level coverage
  that dispatches `zzyix:mosaic-import` with a generated manifest and an
  explicit deployment. Assert the app sends refreshed revisions after a stale
  response and that the final cache and reconnect state converge.

### Minor

* **The full server suite could not be validated in this session.**

  `npm run test:server` was interrupted with exit `130` before test results were
  emitted. The direct integration-test retry was also interrupted with exit
  `130`. This does not establish a repository failure, but it leaves the Phase
  5 full-suite claim unverified. Re-run in an isolated terminal with the
  PostgreSQL test prerequisites available.

## Deviations

* The changes log reports that the multi-replica Alexander import test proves
  bounded import, replay, reconnect, and convergence. The verified E2E source
  proves those canonical protocol properties for direct socket requests, not
  for the client import queue.
* The changes log records full client and server validation as passed. In this
  validation session, focused client import tests passed, while the full server
  suite was interrupted and is therefore not counted as passing evidence.

## Validation Commands

Passed:

```text
npm run verify:alexander-source
npm run test:preprocess-alexander-source
npm run test:alexander-mosaic-inputs
npm run generate:alexander-patch-manifest
npm run test:alexander-patch-manifest
npm run score:alexander-patch-fidelity
npm run test:alexander-patch-fidelity
npm run test:client
npm run build:client
```

`npm run test:client` ran 11 focused `mosaicImport` tests successfully. The
client build completed successfully with Vite warnings about future native
config loading and chunks exceeding 500 kB. These warnings do not affect the
Phase 5 finding.

Interrupted and not counted as passes:

```text
npm run test:server
npm run test --workspace=apps/server -- src/db/repository.postgres.integration.test.ts
```

The combined validation loop was interrupted during its client-test step, so
its remaining build, lint, and multi-replica commands are not counted as
executed evidence. A concurrent-terminal collision also made subsequent
parallel command output unreliable; those results are excluded from this
assessment.

## Recommended Next Validations

* Repair the stale-cache callback lifecycle and run the new same-patch
  stale-revision/resume regression test.
* Run `npm run test:client`, `npm run test:server`, `npm run build:client`,
  `npm run build:server`, `npm run lint:client`, and `npm run lint:server` in
  isolated terminals.
* Run `npm run test:e2e:multi-replica` after the client-driven import E2E path
  exists and verify process cleanup on ports `3001` and `5173`.
* Re-check generated manifest and fidelity report hashes after the repair.

## Clarifying Questions

None. The required behavior and the queue defect are determinable from the
plan, changes log, repository source, and focused validation evidence.