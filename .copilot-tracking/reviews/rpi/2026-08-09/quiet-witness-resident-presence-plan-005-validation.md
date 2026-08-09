---
title: Quiet Witness Resident Presence Phase 5 Validation
description: Evidence-based validation of Implementation Phase 5
author: GitHub Copilot
ms.date: 2026-08-09
ms.topic: review
---

## Validation Status

**Partial.** Four required automated commands passed in this validation session. The
required focused Playwright command did not run Playwright, and the moderated study
and promotion decision remain explicitly pending. The prototype must not be promoted
to shared resident presence.

## Scope and Sources

This review validates only Implementation Phase 5 from the following sources:

* Plan: `quiet-witness-resident-presence-plan.instructions.md`, Phase 5 at
	lines 98-115
* Details: `quiet-witness-resident-presence-details.md`, Phase 5 at lines 241-271
* Changes log: `quiet-witness-resident-presence-changes.md`, lines 48-60
* Research: `quiet-witness-resident-presence-research.md`, evaluation gate at
	lines 193-210 and automated verification at lines 212-220
* Current client implementation, test bridge, and `e2e/quiet-witness.spec.ts`

No production source files were modified by this validation.

## Plan Coverage

| Plan item | Status | Evidence |
| --- | --- | --- |
| 5.1: Full client validation | Partial | Fresh runs passed `npm run lint:client`, `npm run build:client`, `npm run test:client` (34 files; 193 passed; 16 skipped), and `npm run test:e2e:preflight`. Build emitted non-failing Vite native-config and chunk-size warnings. The required focused E2E command did not execute Playwright; see Major finding 1. |
| 5.2: Scoped E2E validation | Partial | The intended Playwright test exists at `e2e/quiet-witness.spec.ts:128-198` and covers detail, hide, reset, canonical state, cross-browser isolation, and traffic assertions. No fresh Playwright execution result was obtained. |
| 5.3: Fix minor issues and report blockers | Complete | The changes log records readonly collection compatibility changes and keeps shared presence deferred at lines 26-47 and 48-50. Current lint, build, and client tests pass. |
| 5.4: Moderated study gate | Pending | The plan leaves this unchecked at lines 112-114. No consented participant data, unaided-notice responses, 1-7 ratings, or authorship answers were provided. |
| 5.5: Record study outcome and gate promotion | Pending and blocked | The plan leaves this unchecked at lines 115-117. Research requires no promotion when attribution, discomfort, confusion, or unaided discovery gates fail at lines 193-210. |

## Findings

### Critical

#### C1: The moderated study and promotion gate are incomplete

* **Requirement:** Details steps 5.4 and 5.5 require a counterbalanced no-signal
	versus one-signal study, unaided notice, 1-7 ratings for intrigue, discomfort,
	invisibility, and confusion, a perceived-authorship answer, and a recorded gate
	decision (`.copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md:265-271`).
* **Evidence:** Both corresponding plan checklist entries are unchecked
	(`.copilot-tracking/plans/2026-08-09/quiet-witness-resident-presence-plan.instructions.md:112-117`).
	The changes log likewise says the moderated study is pending and shared presence
	remains deferred (`.copilot-tracking/changes/2026-08-09/quiet-witness-resident-presence-changes.md:48-50`).
* **Impact:** Phase 5 cannot pass and the prototype cannot be promoted to shared
	resident presence. This is a release/promotion blocker, not evidence that the
	client-only implementation mutates artist state.

### Major

#### M1: The claimed focused Playwright validation was not executed by the prescribed command

* **Requirement:** Phase 5 requires
	`npx playwright test e2e/quiet-witness.spec.ts --reporter=line`
	(`.copilot-tracking/plans/2026-08-09/quiet-witness-resident-presence-plan.instructions.md:105-107`).
* **Evidence:** The changes log claims this command passed as `1/1`
	(`.copilot-tracking/changes/2026-08-09/quiet-witness-resident-presence-changes.md:52-58`).
	In this validation session, the exact command returned Vitest output instead:
	`Test Files 1 passed`, `Tests 4 passed`; it did not produce Playwright output or
	execute the multi-user test. The project manifest declares the intended E2E
	launcher as `playwright test` in `package.json:36-40`, while the client test
	script is `vitest run --coverage` in `apps/client/package.json:10-11`.
* **Impact:** The static E2E assertions have not been verified against live
	multi-user behavior in the current environment. The automated Phase 5 record is
	incomplete despite the changes log claim.

### Minor

#### N1: Production build warnings remain untriaged but do not block this phase

* **Evidence:** `npm run build:client` passed but warned that Vite native config
	loading will not support `__dirname` and that two output chunks exceed 500 kB.
* **Impact:** These warnings are outside Quiet Witness correctness and did not
	prevent the build. Track them separately if they become release-policy failures.

## Validation Evidence

### Verified implementation boundaries

* The fixture defaults both gates to `false` and requires both values to be `true`
	before returning signals (`apps/client/src/domain/witnessSignals.ts:13-20`,
	`apps/client/src/domain/witnessSignals.ts:36-47`).
* The renderer receives readonly signals, uses a separate group, and exposes the
	required Fantome attribution plus non-mutation detail copy
	(`apps/client/src/render/ResidentWitnessLayer.tsx:6-7`, `:23-54`).
* App controls render only for the enabled study condition and reset only local
	witness state (`apps/client/src/App.tsx:1643-1674`); the scene receives a separate
	`witnessSignals` prop (`apps/client/src/App.tsx:1689-1695`).
* The test bridge separates canonical state from witness state and exposes only
	test-mode fixture controls (`apps/client/src/test/canvasTestApi.ts:39-93`,
	`:119-156`).
* The E2E source compares author and observer canonical snapshots and checks both
	browser-level and bridge-level relevant mutation traffic
	(`e2e/quiet-witness.spec.ts:86-120`, `:128-198`).

### Fresh automated results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run lint:client` | Passed | Executed from repository root |
| `npm run build:client` | Passed | Non-blocking Vite warnings; see N1 |
| `npm run test:client` | Passed | 34 files, 193 passed, 16 skipped |
| `npm run test:e2e:preflight` | Passed | Playwright Linux dependency preflight completed |
| `npx playwright test e2e/quiet-witness.spec.ts --reporter=line` | Not validated | Exact command invoked Vitest, not Playwright; see M1 |
| `git diff --check` | Passed | No whitespace errors in the current working tree |

The working tree contains the expected Quiet Witness files reported by the changes
log. No related implementation file was found that was modified but absent from
the changes log; this review artifact is the only new validation-only file.

## Coverage Assessment

The automated client scope has fresh evidence for lint, build, unit/component tests,
and E2E dependency readiness: 4 of 5 required execution commands completed. The
source-level E2E test substantially covers the requested non-mutation contract, but
its live multi-user execution is unverified. The human evaluation coverage is 0 of
2 required Phase 5 study/promotion steps because it is correctly awaiting moderated,
consented study participation.

The client-only implementation remains aligned with the research boundary: witness
signals are separate from canonical tile and collaborator state. This does not clear
the promotion gate.

## Pending Validations

* Resolve the `playwright` binary path and obtain a genuine run of
	`e2e/quiet-witness.spec.ts` with Playwright's multi-user output.
* Run the counterbalanced, consented no-signal versus one-signal moderated study.
* Collect unaided notice before detail exposure, four 1-7 construct ratings, and
	the perceived-authorship answer without raw canvas telemetry.
* Record the gate decision against research thresholds and retain the shared-presence
	promotion block unless every gate clears.

## Clarifying Questions

* Which package-manager or PATH configuration should provide the Playwright binary
	in this environment? The direct prescribed command resolves to Vitest output.
* Where will consented moderated-study outputs and the resulting promotion decision
	be recorded for this prototype?