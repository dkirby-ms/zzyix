<!-- markdownlint-disable-file -->
# Release Changes: Quiet Witness Resident Presence

**Related Plan**: quiet-witness-resident-presence-plan.instructions.md
**Implementation Date**: 2026-08-09

## Summary

Implementation in progress for the consent-scoped, client-only Fantome witness prototype.

## Changes

### Added

* apps/client/src/domain/witnessSignals.ts - Client-only Fantome witness signal contract, gated deterministic fixture source, and reset helper
* apps/client/src/domain/witnessSignals.test.ts - Domain coverage for gates, deterministic fixture reset, and canonical-domain import separation
* apps/client/src/render/ResidentWitnessLayer.tsx - Isolated static Three Fiber witness geometry and accessible Fantome detail affordance
* apps/client/src/render/ResidentWitnessLayer.test.tsx - Render, label, callback, and immutable-input component coverage
* e2e/quiet-witness.spec.ts - Multi-user witness visibility, attribution, reset, reload, non-mutation, and study event coverage

### Modified

* .copilot-tracking/plans/2026-08-09/quiet-witness-resident-presence-plan.instructions.md - Marked Implementation Phase 1 complete
* apps/client/src/render/MosaicScene.tsx - Optional readonly witness render props in a separate scene branch
* apps/client/src/render/MosaicScene.test.tsx - Witness rendering and canonical prop non-mutation coverage
* apps/client/src/App.tsx - Double-gated local witness controls, attribution dialog, reset behavior, and study-safe event capture
* apps/client/src/App.test.tsx - Gate, accessibility, non-mutation, and study event payload coverage
* apps/client/src/test/canvasTestApi.ts - Test-only witness fixture gates, sanitized snapshots, and canonical mutation observer
* apps/client/src/domain/placementSolver.ts - Accept readonly settled tile collections required by render-only witness integration
* apps/client/src/render/gridOverlayGeometry.ts - Accept readonly tile collections without changing overlay behavior
* apps/client/src/render/periodicImages.ts - Accept readonly tile collections and resolve witness marks to the nearest visible periodic image while avoiding occupied anchors
* apps/client/src/domain/witnessSignals.ts - Support no-signal and one-signal study conditions
* apps/client/src/domain/witnessSignals.test.ts - Cover study condition gating and response-contract boundaries
* apps/client/src/App.tsx - Capture explicit pre-detail notice responses, bounded ratings, perceived authorship, and expanded canonical test evidence
* apps/client/src/App.test.tsx - Verify bounded study responses and expanded non-mutation state
* apps/client/src/render/periodicImages.test.ts - Cover nearest periodic witness positioning and occupied-anchor avoidance
* apps/client/src/test/canvasTestApi.ts - Expose expanded canonical and witness-only snapshots for test validation
* e2e/quiet-witness.spec.ts - Cover both study conditions, explicit pre-detail notice, bounded responses, complete state snapshots, and post-reload traffic boundaries

### Removed

* No files removed yet

## Additional or Deviating Changes

* Fixed a local E2E readiness race in `e2e/support/multiUser.ts`
	* A socket could report `connected` before the initial canonical patch cache was populated, causing `placeTileAtWithAck` to reject because patch IDs or revisions were unavailable.
	* Multi-user test readiness now requires both `connected` status and at least one retained canonical patch.
	* The previously failing sequential-placement test passed in five consecutive isolated runs and the complete seven-test multi-user suite.

* Used a client-relative Vitest invocation for the Phase 1 focused test
	* The prescribed root-relative path is evaluated after the script changes into apps/client and cannot discover the test file
* Used a client-relative Vitest invocation for the Phase 2 focused render tests
	* The same root-relative path routing mismatch prevents the prescribed command from discovering client test files
* Used a client-relative Vitest invocation for the Phase 3 focused App tests
	* The same root-relative path routing mismatch prevents the prescribed command from discovering client test files
* Validated reload against rehydrated local cache and undo baselines
	* Reload naturally recreates local undo and cache subscriptions, so only durable tile, ownership, and revision values are compared across reload while local metrics are compared after rehydration
* Reworked the study contract after review identified that a one-signal-only event payload could not support the required counterbalanced evaluation.
	* The revised payload uses finite conditions, bounded 1-7 ratings, finite authorship answers, and explicit noticed/not-noticed responses without raw canvas or arbitrary free-text telemetry.
* Reworked witness positioning after review identified that a fixed canonical anchor could fall outside the visible toroidal image.
	* Witness display signals now select the nearest periodic image and move to a deterministic clear candidate when artist tile anchors would overlap.
* Expanded App and E2E evidence after review identified incomplete owner, revision, cache, undo, and traffic assertions.
	* Reload comparisons distinguish durable canonical state from expected local cache and undo rehydration while retaining mutation-traffic checks.

## Release Summary

Implementation is code-complete through automated validation and review remediation. The moderated study gate remains pending, so shared resident presence is still deferred.

## Validation

* `npm run lint:client` passed
* `npm run build:client` passed with existing Vite chunk-size warnings
* `npm run test:client` passed: 34 files, 194 passed, 16 skipped
* `npm run test:e2e:preflight` passed
* `npx playwright test e2e/quiet-witness.spec.ts --reporter=line` passed: 1/1
* `git diff --check` passed
* Editor diagnostics reported no errors in touched source and test files
* Ports 3001, 5173, 3101, and 4173 verified free after validation
* Focused review-remediation tests passed: 4 files, 42 passed, 16 skipped
* Review-remediation client lint and build passed
* Review-remediation focused Playwright test passed: 1/1
* `npx playwright test e2e/multi-user-fixtures.spec.ts --reporter=line` passed: 7/7
* The previously failing sequential-placement test passed in five consecutive runs
* `npm run lint:client` passed after the E2E readiness fix