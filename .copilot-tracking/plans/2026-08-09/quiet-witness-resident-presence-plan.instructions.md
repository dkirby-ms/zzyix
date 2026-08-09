---
applyTo: '.copilot-tracking/changes/2026-08-09/quiet-witness-resident-presence-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Quiet Witness Resident Presence

## Overview

Prototype a feature-flagged, consent-scoped client-only Fantome witness layer that renders subtle, attributable, resettable resident-presence signals without mutating artist-owned mosaic state.

## Objectives

### User Requirements

* Prototype quiet, discoverable resident-presence signals — Source: GitHub issue #176 summarized in .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 4-7, 11-15)
* Preserve artist tiles, ownership, revisions, and collaboration state — Source: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 11-15, 132-136)
* Make Fantome authorship and non-mutating observer role explicit — Source: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 13, 140-145, 158-164)
* Record intrigue, discomfort, invisibility, confusion, and perceived authorship during testing — Source: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 14, 193-210)
* Provide controls to hide or reset witness behavior independently of artist work — Source: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 15, 132-145)

### Derived Objectives

* Keep witness signals out of tile, collaborator, patch-operation, socket, undo, replay, and cache domains — Derived from the canonical state boundary in .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 87-96, 122-124)
* Require both a prototype feature gate and explicit consented-study gate before rendering any fixture signal — Derived from the consent-scoped prototype contract in .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 122-124, 162-164)
* Use accessible labels and concise detail copy as acceptance evidence, not visual styling alone — Derived from attribution requirements in .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 100-107, 140-145, 160-161)
* Defer server-backed shared resident signals until consent, authorization, TTL, reset, audit, and multi-replica contracts exist — Derived from shared-presence gaps in .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 93-96, 180-181, 225-233)

## Context Summary

### Project Files

* apps/client/src/domain/witnessSignals.ts - New client-only type, feature/consent gating, deterministic prototype fixture source, and reset helpers.
* apps/client/src/render/ResidentWitnessLayer.tsx - New non-mutating presentational Three Fiber layer for static Fantome witness glyphs.
* apps/client/src/render/MosaicScene.tsx - Existing mosaic scene receives witness signals as a pass-through render prop without merging them into tiles, owner boundaries, remote cursors, minimap, or selection.
* apps/client/src/App.tsx - Existing application shell owns local witness visibility, detail state, reset state, and study-condition event recording.
* apps/client/src/App.test.tsx - Existing React test surface for local controls, accessible detail, and gate behavior.
* apps/client/src/render/MosaicScene.test.tsx - Existing scene rendering test surface for separate witness geometry and non-overlap/non-mutation assertions.
* apps/client/src/test/canvasTestApi.ts - Existing test bridge can expose fixture state and canonical state checks only for E2E validation.
* e2e/quiet-witness.spec.ts - New Playwright spec proving hide/reset/reload do not mutate canonical mosaic state or remote collaborator state.

### References

* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md - Primary research selecting the client-only prototype and deferring shared TTL presence.
* package.json - Root scripts provide `npm run lint:client`, `npm run build:client`, `npm run test:client`, and Playwright commands.
* apps/client/package.json - Client package uses React 19, Three Fiber, Vitest, Vite, and oxlint.

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md - Markdown conventions for tracking files; task-planner mode requires `<!-- markdownlint-disable-file -->` for .copilot-tracking files.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md - Writing style conventions for clear planning artifacts.

## Implementation Checklist

### [x] Implementation Phase 1: Domain Gate and Fixture Contract

<!-- parallelizable: false -->

* [x] Step 1.1: Create the client-only witness signal contract and deterministic gated fixture source.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 12-34)
* [x] Step 1.2: Add focused domain tests for the combined feature and consent gate, reset behavior, and canonical model separation.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 36-51)
* [x] Step 1.3: Validate phase changes with scoped client tests.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 52-58)

### [x] Implementation Phase 2: Render Layer and Scene Integration

<!-- parallelizable: false -->

* [x] Step 2.1: Add `ResidentWitnessLayer` as a static, non-interactive, accessible render-only scene layer.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 64-86)
* [x] Step 2.2: Add `witnessSignals` and witness detail callbacks to `MosaicScene` without touching tile, owner, cursor, minimap, or selection code paths.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 88-106)
* [x] Step 2.3: Validate scene rendering and non-mutation assumptions with component tests.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 108-114)

### [x] Implementation Phase 3: Local Controls, Detail Copy, and Study Events

<!-- parallelizable: false -->

* [x] Step 3.1: Add local witness visibility, reset, detail, and study-condition event state in `App.tsx`.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 120-143)
* [x] Step 3.2: Add App-level tests for controls, keyboard detail access, attribution copy, and unchanged collaborator/canonical state.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 145-161)
* [x] Step 3.3: Validate App changes with focused client tests.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 163-169)

### [x] Implementation Phase 4: E2E Non-Mutation and Evaluation Protocol

<!-- parallelizable: false -->

* [x] Step 4.1: Extend the test-only canvas bridge only as needed for witness fixture seeding and canonical state inspection.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 175-196)
* [x] Step 4.2: Add `e2e/quiet-witness.spec.ts` for one-browser fixture visibility and cross-browser non-mutation assertions.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 198-215)
* [x] Step 4.3: Add a minimal study-result capture path for the required constructs without product telemetry or raw canvas content.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 217-239)

### [ ] Implementation Phase 5: Final Validation

<!-- parallelizable: false -->

* [x] Step 5.1: Run full client validation.
  * Execute `npm run lint:client`.
  * Execute `npm run build:client`.
  * Execute `npm run test:client`.
* [x] Step 5.2: Run scoped E2E validation.
  * Execute `npm run test:e2e:preflight`.
  * Execute `npx playwright test e2e/quiet-witness.spec.ts --reporter=line`.
* [x] Step 5.3: Fix minor validation issues and report blockers.
  * Apply small isolated fixes discovered by validation.
  * Report any issue requiring server-backed shared presence, authorization design, or product-policy decisions as follow-on work.
  * Review remediation completed: study conditions and bounded responses support both no-signal and one-signal evaluation; witness placement uses the nearest visible periodic image; App and E2E evidence covers owner attribution, revision, cache, undo, collaborator, and mutation traffic boundaries.
* [ ] Step 5.4: Run the moderated no-signal versus one-signal study gate after code validation passes.
  * Collect unaided notice, 1-7 construct ratings, and perceived-authorship answers without raw canvas telemetry.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 265-267)
* [ ] Step 5.5: Record the study gate outcome and block promotion if attribution, discomfort, confusion, or invisibility gates fail.
  * Keep shared resident signal work deferred unless the prototype clears the study gate.
  * Details: .copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md (Lines 269-271)

## Planning Log

See `.copilot-tracking/plans/logs/2026-08-09/quiet-witness-resident-presence-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* React 19 and Three Fiber in apps/client/package.json.
* Existing client Vitest and React Testing Library setup.
* Existing Playwright E2E infrastructure and multi-user fixtures.
* Local environment capable of running client build, Vitest, and Chromium Playwright tests.
* Product study configuration that explicitly enables the prototype feature and consented-study gate.
* Scheduled study participants for the moderated no-signal versus one-signal evaluation gate.

## Success Criteria

* Witness signals render only when both prototype feature and consented-study gates are enabled — Traces to: research Lines 122-124 and 162-164.
* Rendered marks are clearly attributable to Fantome and state that the prototype did not change the mosaic — Traces to: research Lines 140-145 and 160-161.
* Hide and reset controls affect only witness fixture state and local display preference — Traces to: research Lines 132-145.
* Unit and E2E tests prove tile arrays, `placedBy`, revisions, cache, undo, collaborator count, server traffic, and owner attribution remain unchanged — Traces to: research Lines 132-136 and 214-220.
* The moderated study records intrigue, discomfort, invisibility, confusion, and perceived authorship without raw canvas content or unapproved free-text telemetry — Traces to: research Lines 193-210 and 165-167.
* Server-backed shared resident signals remain deferred and documented until the future presence contract exists — Traces to: research Lines 93-96 and 225-233.