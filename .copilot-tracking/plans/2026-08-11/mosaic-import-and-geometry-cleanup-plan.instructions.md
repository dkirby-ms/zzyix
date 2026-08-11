<!-- markdownlint-disable-file -->

# Plan: Mosaic Import And Geometry Cleanup

## User Requests

* Continue all suggested follow-up items.
* Remove the orphaned mosaic import module.
* Repair server placement geometry parity.
* Repair client grid placement tests.

## Implementation Checklist

1. [x] Delete the orphaned mosaic import module and dedicated tests. <!-- parallelizable: true -->
2. [x] Update server bounds parity expectations to current geometry. <!-- parallelizable: true -->
3. [x] Update client lattice and guide tests to derive coordinates from pattern definitions. <!-- parallelizable: true -->
4. [x] Run focused tests for all previously failing files. <!-- parallelizable: false -->
5. [x] Run full client and server tests and builds. <!-- parallelizable: false -->
6. [x] Review fulfillment and record changes. <!-- parallelizable: false -->

## Success Criteria

* No references to `mosaicImport` remain.
* Previously failing geometry, grid, and controller tests pass.
* Full client and server suites pass.
* Client and server builds pass.
