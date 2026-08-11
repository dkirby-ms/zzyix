<!-- markdownlint-disable-file -->

# Research: Mosaic Import And Geometry Cleanup

## Scope

Complete all follow-up work after Alexander retirement: remove the orphaned generic mosaic import module, repair stale server geometry parity expectations, and repair stale client lattice and guide tests.

## Evidence

* `apps/client/src/domain/mosaicImport.ts` is referenced only by its dedicated test file.
* Server rectangle bounds use the committed `unit = 0.44`; the failing test still expects the old doubled `0.88` scale.
* The square lattice basis is now `0.54`; the failing client test uses world coordinates that represented lattice `(-2, 1)` under the prior basis.
* The triangle guide test uses a pointer that now resolves to an upward slot after geometry spacing changed, while asserting the downward slot rotation.

## Selected Approach

* Delete the orphaned module and its self-only tests.
* Keep runtime geometry unchanged.
* Derive test coordinates from current pattern bases and template slots instead of stale absolute values.
* Update server bounds expectations to the committed rectangle geometry scale.

## Validation

Run the three previously failing focused test files, then full client and server suites and builds.
