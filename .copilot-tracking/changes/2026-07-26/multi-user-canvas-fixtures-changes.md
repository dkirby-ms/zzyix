<!-- markdownlint-disable-file -->
# Changes Log: Deterministic Multi-User Canvas Fixtures

## Related Plan

* `.copilot-tracking/plans/2026-07-26/multi-user-canvas-fixtures-plan.instructions.md`

## Implementation Date

* 2026-07-26

## Summary of Changes

Implemented a test-only client bridge plus reusable Playwright multi-user helpers so e2e tests can create isolated users on one shared canvas, place tiles deterministically through the real App path, observe authoritative tile state, and synchronize without fixed sleeps.

## Added

* `apps/client/src/test/canvasTestApi.ts`
  * Added a guarded e2e-only window bridge for canvas state inspection and deterministic control.
* `e2e/support/multiUser.ts`
  * Added reusable multi-context session creation, bridge-driven user helpers, state-based polling, and tile assertions.
* `e2e/multi-user-fixtures.spec.ts`
  * Added a focused proof spec covering distinct client identities, shared session joining, deterministic placement, and remote observation.
* `.copilot-tracking/research/2026-07-26/multi-user-canvas-fixtures-research.md`
* `.copilot-tracking/plans/2026-07-26/multi-user-canvas-fixtures-plan.instructions.md`
* `.copilot-tracking/details/2026-07-26/multi-user-canvas-fixtures-details.md`
* `.copilot-tracking/plans/logs/2026-07-26/multi-user-canvas-fixtures-log.md`

## Modified

* `apps/client/src/App.tsx`
  * Registered the test-only bridge from existing App state and exposed deterministic join, selection, pointer, and placement hooks.
* `e2e/support/testState.ts`
  * Extended reset helpers to optionally seed an isolated shared canvas and return the created session ID.
* `playwright.config.ts`
  * Enabled the dedicated client-side e2e bridge flag for Playwright runs.
* `README.md`
  * Documented the new reusable multi-user fixture entry point for future collaboration tests.

## Removed

* None.

## Validation Notes

* Passed: `npm run test --workspace=apps/client -- App.test.tsx`
* Passed: `npm run lint --workspace=apps/client`
* Passed: VS Code diagnostics reported no errors in the edited e2e support files and `playwright.config.ts`
* Blocked by environment: `npx playwright test e2e/multi-user-fixtures.spec.ts --reporter=line`
  * Chromium could not launch because the host is missing `libnspr4`.

## Release Summary

The repo now has a reusable foundation for later sequential and concurrent multi-user canvas scenarios without relying on ad hoc browser setup or sleep-based synchronization.