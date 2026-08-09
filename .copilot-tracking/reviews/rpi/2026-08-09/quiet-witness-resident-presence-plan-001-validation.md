---
title: Quiet Witness Resident Presence Phase 1 Validation
description: Evidence-based validation of the Phase 1 domain gate and fixture contract.
ms.date: 2026-08-09
ms.topic: validation
---

## Scope and Outcome

Status: **Passed**

This review covers only Implementation Phase 1, the domain gate and fixture
contract. It compares the implementation plan, planning log, change log,
research, details, `witnessSignals` implementation, and focused domain test.
No production code was edited during validation.

## Requirement Coverage

| Plan item | Required behavior | Verified evidence | Result |
|-----------|-------------------|-------------------|--------|
| Step 1.1 | Client-only `WitnessSignal` with `fantome` and `prototype-fixture` discriminators, deterministic fixture data, combined gates, and reset | The type defines the required fields in `apps/client/src/domain/witnessSignals.ts` lines 1-16. Default gates are both false at lines 18-21. The frozen deterministic fixture is at lines 23-34, the combined `&&` gate is at lines 36-38, and reset delegates only to the gated fixture source at lines 40-47. | Complete |
| Step 1.1 | No connection to tiles, collaborators, transport, patch operations, undo, replay, or cache | `apps/client/src/domain/witnessSignals.ts` lines 1-47 contains no imports or external side effects. The module exposes only the signal contract, gates, fixture source, and reset helper. This matches the separation required by the research at `.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md` lines 111-124 and 132-136. | Complete |
| Step 1.2 | Default-off, feature-only false, consent-only false, combined-gate true, deterministic output, reset, and import-separation tests | `apps/client/src/domain/witnessSignals.test.ts` lines 16-24 cover default and single-gate cases; lines 26-38 cover the combined gate and exact fixture; lines 40-46 cover deterministic reset; lines 48-51 prohibit canonical, collaboration, transport, and history imports. | Complete |
| Step 1.3 | Focused client test and client lint validation | `npx vitest run src/domain/witnessSignals.test.ts --coverage=false` passed with 1 test file and 4 tests. `npm run lint:client` completed without diagnostics. Editor diagnostics report no errors for either Phase 1 file. | Complete |

The implementation matches the Phase 1 details at
`.copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md`
lines 12-26 and 35-58. The change log lists precisely the two Phase 1 files at
`.copilot-tracking/changes/2026-08-09/quiet-witness-resident-presence-changes.md`
lines 15-16. No additional changed domain file was identified as part of the
Phase 1 contract.

## Change-Log Reconciliation

The planning log records the client-relative focused Vitest route as DD-03 at
`.copilot-tracking/plans/logs/2026-08-09/quiet-witness-resident-presence-log.md`
lines 33-36. The prescribed root command was interrupted before reporting test
results with exit code 130. The equivalent client-relative test completed and
passed. This is a command-routing deviation, not a functional deviation from
the Phase 1 requirement to run focused domain tests.

## Findings

### Critical

None.

### Major

None.

### Minor

None.

## Coverage Assessment

Phase 1 implementation coverage is complete. The domain type and fixture are
strictly client-local, both gates are necessary for any signal to be returned,
and reset has no canonical-state dependency or side effect. The test suite
exercises every gate combination required by the details document and verifies
the source-level import boundary.

The research requirement that hide and reset leave artist state unchanged is
satisfied at this phase by the absence of canonical-domain imports and the
pure reset implementation. Full cross-domain mutation assertions belong to the
later App and E2E phases and were not used to expand the Phase 1 scope.

## Clarifying Questions

None for Phase 1.

## Recommended Next Validations

* Validate Phase 2 render-layer isolation from tiles, owner boundaries,
	collaborators, selection, camera, and minimap paths.
* Validate Phase 3 local controls, accessible attribution, and study-safe event
	payloads.
* Validate Phase 4 browser-level canonical-state and network non-mutation
	assertions.