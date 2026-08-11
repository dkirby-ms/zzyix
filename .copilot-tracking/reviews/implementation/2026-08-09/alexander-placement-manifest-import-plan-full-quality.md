<!-- markdownlint-disable-file -->
# Implementation Quality: Alexander Placement Manifest Import

## Scope

Quality review of the plan, changes log, generator and fidelity scripts, client
manifest preflight and queue integration, server persistence coverage, and
multi-replica E2E coverage.

## Findings

### Critical

* `apps/client/src/App.tsx:1359-1367` captures the initial `quiltCache` in the
  queue's expected-revision callback. Later ACK reconciliation updates React
  state, but the queue keeps using the old callback and retries stale revisions
  with obsolete cursors.
* `apps/client/src/domain/mosaicImport.ts:87-93` omits topology, world bounds,
  ownership, and current patch-cursor state from preflight. Imports can proceed
  to mutation without the plan-required cursor and topology validation.

### Major

* Rejected queue outcomes leave optimistic tiles in the cache. `App.tsx:1368`
  creates optimistic state, but rejection handling in `mosaicImport.ts:272`
  does not remove it.
* Preflight derives placement bounds before validating the shape enum, so an
  unsupported shape can throw instead of producing a structured rejection.
* `scripts/generate-alexander-patch-manifest.mjs:139` calculates the reported
  serialized bytes and artifact hash before writing the final byte count. The
  emitted manifest bytes can differ from the reported provenance hash.
* `e2e/alexander-mosaic-import.spec.ts:80-105` sends direct Socket.IO requests
  rather than exercising the client manifest parser, preflight, bounded queue,
  or deployment binding.
* Supported color and manifest-policy values are not validated in the generator
  or client preflight.
* Reconnect resumes after receiving one patch state, without proving that every
  affected cursor was refreshed.
* Required release deployment inputs and fidelity threshold are not recorded.
* Ignored generated manifest and fidelity-report artifacts are unavailable for
  independent verification of the claimed production run.
* The configured multi-replica suite fails because replica A refuses
  `127.0.0.1:3201` before the reconnect scenario starts.

### Minor

* Generator tests lack missing-input and input-hash mismatch cases.
* Client tests do not cover the App-level revision refresh, invalid topology,
  current cursor availability, or multi-patch reconnect behavior.
* The Phase 2 detail still assigns collision and bounds skips to the generator,
  which conflicts with the approved portable schema-v2 deployment model.

## Validation

| Command | Result |
|---------|--------|
| `npm run test:alexander-patch-manifest` | Passed, 6 tests |
| `npm run test:alexander-patch-fidelity` | Passed, 2 tests |
| `npm run test --workspace=apps/client -- src/domain/mosaicImport.test.ts` | Passed, 11 tests |
| `npm run test:server -- src/db/repository.postgres.integration.test.ts` | Passed, 13 tests |
| `npm run lint:client` | Passed |
| `npm run build:client` | Passed with existing Vite warnings |
| `npm run lint:server` | Passed |
| `npm run build:server` | Passed |
| `npm run test:e2e:multi-replica` | Failed, replica A connection refused at `127.0.0.1:3201` |

## Verdict

Needs Rework. The focused unit and persistence checks are green, but the
client queue cannot reliably import multiple placements on the same patch, and
required preflight and browser-path E2E guarantees are absent.
