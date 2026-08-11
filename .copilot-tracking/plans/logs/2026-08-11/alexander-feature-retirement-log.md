<!-- markdownlint-disable-file -->

# Planning Log: Alexander Feature Retirement

## Selected Path

Retire all active Alexander-specific artifacts while preserving generic mosaic behavior and historical tracking records.

## Alternatives Considered

* Keep provenance records without code. Rejected because the source exists only for the retired pipeline.
* Rename Alexander fixtures to generic mosaic fixtures. Rejected because the covered server event and UI feature no longer exist.
* Delete generic mosaic import utilities. Rejected because they are reusable product code and not inherently Alexander-specific.

## Deviations

* Generated binary and image outputs could not be deleted with `apply_patch`, so the exact enumerated files were removed with `rm -f` and their empty directories with `rmdir`.
* Full client and server suites exposed unrelated geometry failures in files already modified outside this cleanup. Focused tests for all touched integration surfaces passed.

## Validation Notes

* Active first-party scan found no Alexander references or filenames outside historical `.copilot-tracking` records.
* `npm run build:server` passed.
* `npm run build:client` passed with existing Vite native-loader and chunk-size warnings.
* Focused client validation passed: 48 tests passed and 16 were skipped.
* Focused server validation passed: 45 tests passed.
* Full server validation: 256 passed, 1 skipped, and 1 unrelated placement geometry assertion failed.
* Full client validation: 212 passed, 16 skipped, and 2 unrelated grid/controller geometry assertions failed.
