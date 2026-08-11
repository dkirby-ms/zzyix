<!-- markdownlint-disable-file -->

# Changes: Alexander Feature Retirement

## Related Plan

`.copilot-tracking/plans/2026-08-11/alexander-feature-retirement-plan.instructions.md`

## Implementation Date

2026-08-11

## Summary

Removed the complete active Alexander-specific feature surface after runtime support was retired.

## Removed

* Alexander client placement helpers and tests
* Alexander client UI controls, state, and styling
* Alexander E2E import spec and local fixture
* Alexander preprocessing, manifest generation, scoring, preview, provenance, and script tests
* Alexander generated offline artifacts and output directories
* Alexander provenance manifest and dedicated README
* Alexander package scripts and multi-replica E2E invocation

## Modified

* `package.json`
* `playwright.multi-replica.config.ts`
* Client app and palette files involved in runtime removal
* Generic mosaic import test fixture naming

## Validation

* Client and server builds passed.
* Focused client tests passed: 48 passed, 16 skipped.
* Focused server tests passed: 45 passed.
* Active first-party scan found no remaining Alexander references or filenames.
