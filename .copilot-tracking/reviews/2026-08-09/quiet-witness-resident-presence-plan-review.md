<!-- markdownlint-disable-file -->
# Quiet Witness Resident Presence Implementation Review

## Review Metadata

* Review date: 2026-08-09
* Related plan: `.copilot-tracking/plans/2026-08-09/quiet-witness-resident-presence-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-08-09/quiet-witness-resident-presence-changes.md`
* Research: `.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md`
* Review scope: Client-only Fantome witness prototype through the completed automated validation scope

## Summary

**Needs Rework.** The client-only fixture and separate render integration meet
their core isolation requirements, and fresh lint, build, client-test, E2E
preflight, and focused Playwright validation pass. The implementation cannot
yet run or evaluate the required moderated study because its study-event
contract cannot capture both conditions or the required participant responses.
Several E2E and App-level assertions also leave required non-mutation evidence
incomplete.

| Severity | Count |
| --- | ---: |
| Critical | 1 |
| Major | 5 |
| Minor | 0 |

## Phase Validation

| Plan phase | Status | Evidence |
| --- | --- | --- |
| 1. Domain gate and fixture contract | Pass | Both gates are required, the fixture is deterministic and client-local, and focused domain coverage is present. See `.copilot-tracking/reviews/rpi/2026-08-09/quiet-witness-resident-presence-plan-001-validation.md`. |
| 2. Render layer and scene integration | Pass | Witness geometry is isolated from tiles, collaborators, selections, and input handling; full client tests freshly pass. See `.copilot-tracking/reviews/rpi/2026-08-09/quiet-witness-resident-presence-plan-002-validation.md`. |
| 3. Local controls, attribution, and study events | Needs Rework | Controls, double gating, detail copy, and bounded event names work. The payload cannot capture study results, and App coverage omits revision, cache, and ownership assertions. See `.copilot-tracking/reviews/rpi/2026-08-09/quiet-witness-resident-presence-plan-003-validation.md`. |
| 4. E2E non-mutation and evaluation protocol | Needs Rework | The multi-user scenario passes, but its snapshots, reload ordering, traffic observation, and study capture do not meet all specified evidence requirements. See `.copilot-tracking/reviews/rpi/2026-08-09/quiet-witness-resident-presence-plan-004-validation.md`. |
| 5. Final validation and moderated study gate | Blocked | Automated checks now have fresh passing evidence. The moderated study and promotion decision are still pending, so shared presence remains deferred. See `.copilot-tracking/reviews/rpi/2026-08-09/quiet-witness-resident-presence-plan-005-validation.md`. |

## Implementation Quality Findings

### Critical

* The study-event contract fixes the condition to `one-signal` and cannot store the required $1$-$7$ ratings, perceived-authorship answer, or unaided-recall response. This prevents the required study from evaluating its release gates. See `.copilot-tracking/reviews/implementation/2026-08-09/quiet-witness-resident-presence-full-quality.md`.

### Major

* Witness geometry is not projected to the nearest toroidal image, so it can fall outside the visible world after a boundary crossing.
* `unaided-notice` is inferred from opening detail instead of captured as an explicit pre-detail response.
* The E2E scenario reloads before witness interactions and narrows its canonical snapshot, omitting required state and cache evidence.
* Network assertions do not cover the complete specified traffic surface.
* The App-level non-mutation test omits revision, cache metrics, and owner-attribution assertions.

## Validation Commands

| Command | Result |
| --- | --- |
| `npm run lint:client` | Pass |
| `npm run build:client` | Pass, with existing Vite configuration and chunk-size warnings |
| `npm run test:client` | Pass: 34 files, 193 passed, 16 skipped |
| `npm run test:e2e:preflight` | Pass |
| `./node_modules/.bin/playwright test e2e/quiet-witness.spec.ts --reporter=line` | Pass: 1 test in 27.5 seconds |
| VS Code diagnostics on changed sources and tests | No errors |
| `git diff --check` | Pass |
| Ports 3001 and 5173 | Free after E2E execution |

## Missing Work And Deviations

* The moderated no-signal versus one-signal study, its result record, and its promotion decision are intentionally incomplete. This blocks promotion to shared resident presence.
* The historical `npx playwright` invocation resolved incorrectly during earlier validation. The verified local runner is `./node_modules/.bin/playwright`.
* The focused E2E scenario passes, but its current assertions are not sufficient to prove every non-mutation property required by the plan.

## Follow-Up Recommendations

### Deferred From Scope

* Keep server-backed shared resident presence deferred until the moderated study clears every research gate and a separate authorization, TTL, audit, reset, and multi-replica contract exists.

### Discovered During Review

* Define a consent-scoped study-result model for `no-signal` and `one-signal`, bounded ratings, unaided notice, and perceived authorship.
* Render witness signals at a verified unoccupied, nearest periodic position and add viewport/non-overlap tests.
* Expand App and E2E snapshots plus post-interaction reload and traffic assertions to the plan's complete canonical-state boundary.

## Overall Status

**Needs Rework.** One Critical and five Major findings require resolution before the prototype can satisfy its full implementation plan. The automated client-only behavior is validated; promotion remains blocked by the incomplete study contract and moderated-study gate.
