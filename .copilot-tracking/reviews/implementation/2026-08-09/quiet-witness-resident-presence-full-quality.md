<!-- markdownlint-disable-file -->
# Quiet Witness Resident Presence Quality Validation

## Status

Partial. Static diagnostics and the automated client and focused E2E checks pass, but the implementation does not fully meet the study-capture, render-placement, and non-mutation-coverage requirements.

## Findings

### Critical

#### QV-001: The study-event contract cannot capture the required study outcomes

`CanvasWitnessStudyEvent` fixes the condition to `one-signal` and only permits construct identifiers in `apps/client/src/test/canvasTestApi.ts` lines 39-43. `createWitnessStudyEvent` uses the same fixed condition in `apps/client/src/App.tsx` lines 151-159. No signal condition, $1$-$7$ ratings, perceived-authorship answer, or unaided-recall response can be represented.

This conflicts with the evaluation protocol in `.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md` lines 193-210. A consent-scoped result contract must support both conditions and each bounded response before the moderated study can provide promotion evidence.

### Major

#### QV-002: Witness geometry is not projected to the nearest toroidal image

The fixture is anchored at the fixed coordinate in `apps/client/src/domain/witnessSignals.ts` line 30, and the render layer offsets it directly in `apps/client/src/render/ResidentWitnessLayer.tsx` line 32. `MosaicScene` projects canonical scene content to periodic images, but passes witness signals directly through its separate branch in `apps/client/src/render/MosaicScene.tsx` lines 536-546.

The mark can be out of view after a toroidal boundary crossing. Render a nearest periodic image and choose an unoccupied anchor; add viewport and non-overlap coverage.

#### QV-003: Unaided notice is inferred from opening detail rather than captured as a response

`apps/client/src/App.tsx` line 509 records `unaided-notice` when opening the mark detail. That interaction cannot demonstrate an unaided response, and the E2E approved-event list excludes it in `e2e/quiet-witness.spec.ts` line 178. Capture unaided notice through an explicit pre-detail, consented-study response.

#### QV-004: E2E reload and canonical comparisons do not cover the full required sequence and state

The E2E spec reloads before enabling the fixture in `e2e/quiet-witness.spec.ts` lines 140-146, with no reload after detail, hide, reset, or completion. Its comparison excludes `cursorCount` and `snapshotBytes` in `e2e/quiet-witness.spec.ts` line 88, and narrows tile data in the `CanonicalSnapshot` definition at line 12.

Reload after every relevant interaction and compare the full bridge snapshot, including complete tiles, all cache metrics, revision, ownership, collaborator state, and undo state.

#### QV-005: Network assertions observe only part of the specified traffic surface

The bridge observes outgoing Socket.IO events through `socket.onAnyOutgoing` in `apps/client/src/App.tsx` line 1339. The browser observer records HTTP requests and WebSocket `framesent`, but not incoming frames, in `e2e/quiet-witness.spec.ts` line 112.

The plan requires evidence that witness actions do not create placement, deletion, revision, cache, or collaborator-update traffic. Expand the contract to the agreed inbound and outbound signal set, or narrow the requirement in the plan with a rationale.

#### QV-006: The App-level non-mutation test omits required canonical fixture assertions

The App test captures tile count/transforms and remote cursor/selection counts in `apps/client/src/App.test.tsx` lines 473-488. It does not assert revision, cache metrics, or per-tile `placedBy` ownership as required by the Phase 3 detail specification. Extend the test snapshot and assert its stability after hide and reset.

## Verified Checks

| Command or diagnostic | Result |
| --- | --- |
| `npm run lint:client` | Pass |
| `npm run build:client` | Pass, with pre-existing Vite configuration and chunk-size warnings |
| `npm run test:client` | Pass: 34 files, 193 passed, 16 skipped |
| `npm run test:e2e:preflight` | Pass |
| `./node_modules/.bin/playwright test e2e/quiet-witness.spec.ts --reporter=line` | Pass: 1 test in 27.5 seconds |
| VS Code diagnostics for changed source and tests | No errors |
| `git diff --check` | Pass |

## Residual Blocker

The moderated counterbalanced no-signal versus one-signal study and promotion decision remain incomplete in plan Phase 5. Shared resident presence must remain deferred until the study results are collected and the research gates are evaluated.
