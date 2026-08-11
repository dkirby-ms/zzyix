<!-- markdownlint-disable-file -->

# Details: Alexander Feature Retirement

## Context

* Plan: `.copilot-tracking/plans/2026-08-11/alexander-feature-retirement-plan.instructions.md`
* Research: `.copilot-tracking/research/2026-08-11/alexander-feature-retirement-research.md`

## Phase 1: E2E Retirement

* Delete `e2e/alexander-mosaic-import.spec.ts`.
* Delete `e2e/fixtures/alexander-patch-manifest.json`.
* Remove the spec from `test:e2e:multi-replica`.
* Remove `ALEXANDER_PATCH_MANIFEST_PATH` from Playwright server environments.

## Phase 2: Pipeline Retirement

* Delete all Alexander-specific scripts and tests.
* Remove all Alexander-specific root package scripts.
* Delete generated preprocessing and mosaic-input output directories.

## Phase 3: Documentation Retirement

* Delete the Alexander source provenance manifest.
* Delete the dedicated provenance README.
* Search remaining first-party files and remove dangling active references.

## Validation

* Search all first-party non-tracking paths for Alexander references.
* Run `npm run build:server` and `npm run build:client`.
* Run `npm run test:server` and `npm run test:client`.
