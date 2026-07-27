---
applyTo: '.copilot-tracking/changes/2026-07-26/multi-user-canvas-fixtures-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Deterministic Multi-User Canvas Fixtures

## Overview

Add a test-only client observability bridge plus reusable Playwright multi-user fixtures so tests can create independent users on one isolated canvas, place tiles deterministically, inspect authoritative tile attributes, and synchronize on connection or rendered state without fixed sleeps.

## Objectives

### User Requests

* Create reusable Playwright fixtures and helpers for multiple independent users collaborating on the same shared canvas. Source: issue #91
* Create two or more independent browser contexts representing distinct users. Source: issue #91
* Connect all users to the same isolated shared canvas. Source: issue #91
* Add stable test hooks or abstractions for selecting and placing a tile. Source: issue #91
* Add helpers to inspect tile identity, shape, color, position, and orientation through observable application state. Source: issue #91
* Add synchronization helpers based on connection status, acknowledgements, or rendered state rather than fixed sleeps. Source: issue #91
* Ensure fixture cleanup closes contexts and removes test state. Source: issue #91

### Derived Objectives

* Keep production behavior unchanged unless the dedicated e2e flag enables the client bridge. Derived from: .copilot-tracking/research/2026-07-26/multi-user-canvas-fixtures-research.md
* Route deterministic placement helpers through the existing App placement path instead of introducing test-only server placement behavior. Derived from: .copilot-tracking/research/2026-07-26/multi-user-canvas-fixtures-research.md
* Use `/test/reset` with `createSession` as the canonical isolated-canvas bootstrap primitive. Derived from: .copilot-tracking/research/2026-07-26/multi-user-canvas-fixtures-research.md

## Context Summary

### Project Files

* `apps/client/src/App.tsx` - Owns observable app state and the real placement path.
* `apps/client/src/network/session.ts` - Persists per-user identity and session storage.
* `apps/server/src/index.ts` - Provides test reset and isolated session creation.
* `e2e/support/testState.ts` - Existing server-reset helper surface.
* `e2e/smoke.spec.ts` - Existing baseline Playwright coverage.
* `playwright.config.ts` - Playwright boot config and environment propagation.

### References

* `.copilot-tracking/research/2026-07-26/multi-user-canvas-fixtures-research.md`
* Issue #91 attachment in conversation context

## Implementation Checklist

### [x] Implementation Phase 1: Add a Test-Only Client Bridge

<!-- parallelizable: false -->

* [x] Step 1.1: Extract and register a narrow test-only bridge that exposes authoritative observable state.
* [x] Step 1.2: Add thin control methods for setting active tile state, moving the pointer, and placing tiles through the real App path.
* [x] Step 1.3: Guard bridge registration behind a dedicated Vite env flag enabled only for e2e runs.
* [x] Step 1.4: Validate the touched client slice.

### [x] Implementation Phase 2: Build Reusable Multi-User Playwright Support

<!-- parallelizable: false -->

* [x] Step 2.1: Extend test-state helpers to create an isolated shared session deterministically.
* [x] Step 2.2: Add Playwright helpers and fixtures that create multiple browser contexts, join each user to the shared canvas, and clean up reliably.
* [x] Step 2.3: Add state-based wait helpers and tile-assertion helpers over the client bridge.
* [x] Step 2.4: Validate the focused e2e helper slice.

### [x] Implementation Phase 3: Prove the Fixture Primitives

<!-- parallelizable: false -->

* [x] Step 3.1: Add a focused Playwright spec that proves two users connect to one isolated canvas with distinct identities.
* [x] Step 3.2: Use the new helper layer to place a tile from one user and observe it from the other without fixed sleeps.
* [x] Step 3.3: Confirm cleanup behavior is handled by the fixture lifecycle and server reset support.
* [x] Step 3.4: Run targeted e2e validation.

### [x] Implementation Phase 4: Documentation and Wrap-Up

<!-- parallelizable: false -->

* [x] Step 4.1: Update e2e documentation if the new fixture surface needs discoverability.
* [x] Step 4.2: Record implementation deltas and validation outputs in tracking artifacts.

## Planning Log

See `.copilot-tracking/plans/logs/2026-07-26/multi-user-canvas-fixtures-log.md`.

## Dependencies

* Existing Playwright test harness and webServer config
* Existing App placement flow and authoritative tile state
* Existing server test reset endpoint in e2e test mode

## Success Criteria

* A Playwright test can create at least two isolated browser contexts connected to one shared test canvas.
* The fixture layer exposes distinct `clientId` values per user and separate browser storage state.
* Helpers can place a tile and assert full observable tile attributes.
* Helpers can wait for remote propagation without fixed-duration sleeps.
* The client bridge is test-only and absent from normal production behavior.
* Fixture teardown closes contexts and removes shared server state.