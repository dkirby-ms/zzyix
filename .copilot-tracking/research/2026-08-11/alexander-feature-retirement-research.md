<!-- markdownlint-disable-file -->

# Research: Alexander Feature Retirement

## Scope

Retire the remaining Alexander-specific E2E coverage, offline generation pipeline, generated artifacts, provenance records, and user-facing documentation after the client and server runtime feature was removed.

## User Requests

* Continue all suggested cleanup work.
* Remove Alexander E2E specs.
* Purge the legacy offline pipeline.
* Remove or rename remaining related documentation and user-facing copy.

## Evidence Log

* `e2e/alexander-mosaic-import.spec.ts` and `e2e/fixtures/alexander-patch-manifest.json` cover the retired socket import flow.
* `playwright.multi-replica.config.ts` injects `ALEXANDER_PATCH_MANIFEST_PATH` for that flow.
* Root `package.json` still exposes verification, preprocessing, manifest generation, fidelity scoring, preview rendering, and tests for Alexander artifacts.
* `scripts/` contains Alexander-specific preprocessing, placement contract, manifest, scoring, preview, provenance, and test files.
* `offline/output/alexander-preprocessed/` and `offline/output/alexander-mosaic-inputs/` contain local generated artifacts.
* `offline/reference/alexander-source-license-records.json` and `offline/reference/README.md` document only the retired benchmark source.
* Generic `apps/client/src/domain/mosaicImport.ts` remains independent and is retained.
* Third-party dependency metadata mentioning people named Alexander is unrelated and excluded.

## Selected Approach

Delete the complete Alexander-specific feature surface and remove all direct configuration references. Preserve generic mosaic terminology and utilities used by the core product. Historical `.copilot-tracking` records remain as workflow history.

## Validation

* Search non-tracking first-party files for `Alexander`, `alexander`, and `ALEXANDER`.
* Build client and server.
* Run client and server test suites.
* Confirm package scripts and multi-replica Playwright configuration no longer reference removed files.
