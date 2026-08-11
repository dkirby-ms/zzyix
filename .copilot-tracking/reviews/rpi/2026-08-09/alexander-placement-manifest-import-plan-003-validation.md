---
title: Phase 3 Validation: Alexander Placement Manifest Import
ms.date: 2026-08-09
ms.topic: validation
---

## Status

Partial.

Phase 3 provides a pure parser/preflight module, a four-request bounded queue,
and an App integration that emits `quilt_place_tile`. The focused tests and
client build pass. Required topology and cursor preflight are absent, and the
queue uses the cache snapshot captured at import start for every later request.
That prevents expected patch revisions from advancing after ACK reconciliation.

## Scope

Phase 3: Client Parser, Preflight, and Bounded Queue.

* Plan requirements: [alexander-placement-manifest-import-plan.instructions.md](../../../plans/2026-08-09/alexander-placement-manifest-import-plan.instructions.md#L83-L90)
* Detailed acceptance criteria: [alexander-placement-manifest-import-details.md](../../../details/2026-08-09/alexander-placement-manifest-import-details.md#L116-L153)
* Research requirements: [issue-155-alexander-mosaic-remaining-work-research.md](../../../research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md#L258-L259) and [issue-155-alexander-mosaic-remaining-work-research.md](../../../research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md#L311-L314)
* Changes-log claim: [alexander-placement-manifest-import-changes.md](../../../changes/2026-08-09/alexander-placement-manifest-import-changes.md#L62-L64) and [alexander-placement-manifest-import-changes.md](../../../changes/2026-08-09/alexander-placement-manifest-import-changes.md#L75-L77)

## Validated Criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Pure manifest parsing and structured preflight results | Validated | [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L87-L105) declares typed preflight results and reasons. [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L170-L215) validates source, manifest hash, deployment transform, IDs, candidate IDs, finiteness, source coordinates, supported shape/material, footprint, ordering, and budget before exposing accepted placements. |
| Deployment rectangle and transform are explicit | Validated | [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L39-L42) defines the request deployment contract. [App.tsx](../../../../apps/client/src/App.tsx#L1340-L1356) rejects an absent request or unavailable canonical quilt and passes the supplied deployment to preflight. |
| Bounded request window | Validated | [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L4-L6) sets the maximum to four. [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L272-L304) pumps only while `inFlight < maxInFlight`. The focused test asserts four initial requests in [mosaicImport.test.ts](../../../../apps/client/src/domain/mosaicImport.test.ts#L89-L109). |
| Canonical mutation protocol only | Validated | [App.tsx](../../../../apps/client/src/App.tsx#L1368-L1374) builds `QuiltPlaceTileRequest` values and submits only with `socketActionRef.current?.emit('quilt_place_tile', ...)`. No Phase 3 client bulk endpoint or database access was found. |
| ACK cache reconciliation and bounded stale retry state machine | Partially validated | [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L288-L303) records accepted ACKs and pauses stale revisions for at most two retries. [App.tsx](../../../../apps/client/src/App.tsx#L1375-L1383) reconciles ACK revisions into the cache. The revision source defect below prevents this from satisfying the end-to-end requirement. |
| Focused parser and queue tests | Validated with gaps | [mosaicImport.test.ts](../../../../apps/client/src/domain/mosaicImport.test.ts#L36-L86) covers valid, schema, source, budget, provenance, duplicate-ID, non-finite, malformed, and deployment-transform cases. [mosaicImport.test.ts](../../../../apps/client/src/domain/mosaicImport.test.ts#L89-L146) covers bounded ACK completion, stale retry budget, and local pause/resume behavior. No App integration test was found. |

## Findings

### Critical

1. Expected patch revisions remain stale after the first ACK.

	[App.tsx](../../../../apps/client/src/App.tsx#L1359-L1367) creates the queue with callbacks that close over the `quiltCache` value from the render that started the import. The queue invokes that callback for every later window in [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L281-L286). Although accepted ACKs reconcile cache revisions in [App.tsx](../../../../apps/client/src/App.tsx#L1375-L1383), the queue callbacks keep reading the original cache snapshot. Therefore, a later placement that touches a previously changed patch submits an obsolete expected revision, then enters stale-revision retry without a fresh revision source. This violates the detailed requirement that ACKs advance revisions from server data and that stale revisions resync and retry in [alexander-placement-manifest-import-details.md](../../../details/2026-08-09/alexander-placement-manifest-import-details.md#L148-L149), plus the research requirement to reuse expected-patch-revision and ACK reconciliation semantics.

2. Preflight cannot reject invalid topology or unavailable current patch cursors.

	The required preflight context in [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L87-L93) contains only source identity, dimensions, quilt ID, deployment, and optional payload bytes. It has no topology, world bounds, patch ownership, or current cursors. Its target validation only checks finite rectangle/transform values in [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L217-L220), and it returns ready before the queue attempts to derive revisions. The detailed plan explicitly requires topology and current patch cursor availability before network mutation in [alexander-placement-manifest-import-details.md](../../../details/2026-08-09/alexander-placement-manifest-import-details.md#L118-L118); research also requires rejection of out-of-bounds coordinates and missing expected patch revisions in [issue-155-alexander-mosaic-remaining-work-research.md](../../../research/2026-08-09/issue-155-alexander-mosaic-remaining-work-research.md#L258-L258).

### Major

1. Supported color validation and manifest policy handling are missing.

	The manifest exposes `policy.ordering`, `policy.conflict`, and `policy.outOfBounds` as unconstrained strings in [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L28-L35). Preflight checks only supported shape and material in [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L196-L196); it does not validate `tile.color` or any policy value. Queue rejection handling maps server codes to fixed outcomes in [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L259-L304), without consulting the manifest policy. This deviates from the required supported tile attributes and policy-driven collision, bounds, authorization, throttle, and resource behavior in [alexander-placement-manifest-import-details.md](../../../details/2026-08-09/alexander-placement-manifest-import-details.md#L118-L118) and [alexander-placement-manifest-import-details.md](../../../details/2026-08-09/alexander-placement-manifest-import-details.md#L148-L148).

2. Reconnect resumes after one patch state rather than validating every affected cursor and revision.

	[App.tsx](../../../../apps/client/src/App.tsx#L869-L871) clears the global resync flag for each `onQuiltPatchState` payload. The queue then resumes whenever it is paused and that single flag is clear in [App.tsx](../../../../apps/client/src/App.tsx#L1407-L1417). The code does not track the affected patch set for remaining placements, so it cannot establish that all required cursor and revision state has been refreshed. This deviates from the reconnect gate in [alexander-placement-manifest-import-details.md](../../../details/2026-08-09/alexander-placement-manifest-import-details.md#L149-L149).

### Minor

1. Focused tests do not cover the App integration or missing preflight categories.

	The only references to `createMosaicImportQueue` and `preflightMosaicManifest` in client tests are the unit cases in [mosaicImport.test.ts](../../../../apps/client/src/domain/mosaicImport.test.ts#L1-L146). There is no client integration test for `zzyix:mosaic-import`, cache-refreshed expected revisions, topology/world bounds, current cursors, color, policy, or multi-patch reconnect. The changes log reports 11 focused client tests, which is accurate for this file, but they do not demonstrate the required integration behavior.

## Coverage Assessment

Implementation coverage is partial. The parser, manifest hash verification,
finite transform checks, duplicate detection, shape/material validation,
bounded generic queue, ACK cache reconciliation, and protocol reuse are
present. Required runtime validation of topology and current cursors is missing,
and stale retry cannot consume reconciled revisions because it uses the initial
cache closure. Consequently, Phase 3 cannot be accepted as complete.

## Validation Commands

| Command | Result |
| --- | --- |
| `cd apps/client && npx vitest run src/domain/mosaicImport.test.ts --coverage.enabled=false` | Passed: 1 test file, 11 tests |
| `npm run build:client` | Passed: TypeScript build and Vite production build completed. Existing Vite native-config and chunk-size warnings were emitted. |
| `get_errors` on this validation report after its initial creation | Passed: no diagnostics |

An earlier attempted command, `npm run test --workspace=apps/client -- src/domain/mosaicImport.test.ts`, was parsed as the root workspace fan-out and began the server suite. It was interrupted and is excluded from validation evidence.

## Clarifying Questions

* Which palette or color contract should preflight enforce: a fixed Alexander palette, a provenance-hashed palette list, or a validated CSS-color format?
* Should cancellation be terminal? The current `cancel()` state can be resumed because [mosaicImport.ts](../../../../apps/client/src/domain/mosaicImport.ts#L312-L314) does not reject `cancelled` status; the plan calls for deterministic resume and stop behavior but does not define that distinction.

## Recommended Next Validations

* Add an App-level queue test proving that the second placement reads the revision reconciled from the first ACK.
* Add preflight tests for topology/world bounds, affected patch cursor availability, supported colors, invalid policy values, and a manifest policy outcome for every mapped rejection code.
* Add a multi-patch reconnect test that withholds one affected patch state and verifies the queue remains paused.
