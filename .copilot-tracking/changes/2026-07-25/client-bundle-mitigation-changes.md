<!-- markdownlint-disable-file -->
# Release Changes: Client Bundle Mitigation and Gate Closure

**Related Plan**: client-bundle-mitigation-plan.instructions.md
**Implementation Date**: 2026-07-25

## Summary

Implemented low-risk runtime bundle mitigation plus conditional canvas lazy-loading, validated build/test/lint, and recorded gate results with explicit deferred scope.

## Changes

### Added

* apps/client/src/ui/CanvasLoadingFallback.tsx - Added suspense fallback UI for lazy-loaded canvas stack.
* apps/client/src/ui/CanvasLoadingFallback.css - Added loading fallback styling.

### Modified

* apps/client/src/App.tsx - Removed root toast provider wiring and introduced `React.lazy` + `Suspense` split for `MosaicScene`.
* .copilot-tracking/plans/2026-07-25/client-bundle-mitigation-plan.instructions.md - Marked completed steps and conditional execution note for Step 3.1.
* .copilot-tracking/plans/logs/2026-07-25/client-bundle-mitigation-log.md - Recorded deviations and follow-on work.
* .copilot-tracking/changes/2026-07-25/client-bundle-mitigation-changes.md - Consolidated measured outcomes and deferred scope.

### Removed

* None yet.

## Additional or Deviating Changes

* Recorded a fresh verification baseline from current build artifacts to support deterministic delta tracking.
* Phase 3.1 executed as runtime-surface verification only: optional primitive modules in plan scope were not imported by active runtime paths, so no source removal was appropriate.

## Phase 1 Evidence

### Baseline Build Totals and Asset Sizes

* Command evidence:
	* `cd apps/client && ls -lh dist/assets`
	* `cd apps/client && wc -c dist/assets/*`
* Observed assets:
	* `dist/assets/index-DABnUy-K.css`: 15037 bytes
	* `dist/assets/index-DRe7ugTG.js`: 1573063 bytes
	* Total raw assets: 1588100 bytes
* Inherited baseline reference from plan context: 1587574 bytes
* Delta between observed verification baseline and inherited baseline: +526 bytes

### Runtime Import Evidence Captured

* Root runtime imports in `apps/client/src/App.tsx` include:
	* `./render/MosaicScene`
	* `./ui/primitives/Toast`
	* `./ui/primitives/Tooltip`
* Heavy render stack imports in `apps/client/src/render/MosaicScene.tsx` include:
	* `@react-three/fiber`
	* `@react-three/drei`
	* `three`

### Metric Default for Implementation-Time Gate

* Default metric used for this implementation cycle: total raw bytes from `wc -c dist/assets/*`.
* Interim pass target: reduce at least 100000 bytes from inherited baseline (1587574 bytes).
* Final inherited gate reference retained: <= 30000 byte delta against pre-UX baseline.
* Metric ambiguity remains open and tracked in DR-01.

## Implementation Outcomes

### Phase 2 and Phase 3 Mitigations

* Removed app-root toast runtime wiring from `apps/client/src/App.tsx`.
* Applied lazy-loading boundary for `MosaicScene` using `React.lazy` and `Suspense`.
* Added explicit canvas loading fallback UI during deferred chunk load.
* Executed WI-05 icon adapter A/B experiment:
	* Variant A (normal adapter): total raw bytes 1569001
	* Variant B (adapter detached from `lucide-react`): total raw bytes 1569001
	* Experiment result: 0-byte delta, icon adapter currently non-contributor.

### Validation Status

* `npm run lint --workspace=apps/client` - passed
* `npm run test --workspace=apps/client -- --run` - passed (54 tests)
* `npm run build --workspace=apps/client` - passed

### Bundle Delta Reporting

* Metric used: total raw bytes from `wc -c dist/assets/*`
* Inherited baseline total assets: 1587574 bytes
* Final total assets after implementation: 1569001 bytes
* Net delta vs inherited baseline: -18573 bytes
* Interim mitigation target (>=100000 bytes reduction): not met

Gzip-aware build output after implementation:

* `dist/assets/index-CNS0gPrd.js`: 533.43 kB raw, 163.67 kB gzip
* `dist/assets/MosaicScene-MCBM82wc.js`: 1021.24 kB raw, 273.01 kB gzip
* `dist/assets/index-kmlmpeOW.css`: 14.32 kB raw, 3.81 kB gzip

Gate interpretation:

* Raw-total interim pass threshold remains unmet.
* Initial-route payload improved materially due to chunk split, but final gate contract remains ambiguous (DR-01).

## Deferred Scope and Ownership

* Defer canonical gate contract definition (raw/gzip/initial-route).
	* Rationale: owner clarification unavailable in current cycle.
	* Suggested owner: product/engineering lead for performance governance.
* Defer CI enforcement budget until metric contract is finalized.
	* Rationale: current ambiguity risks incorrect pipeline gating.
	* Suggested owner: build/release engineering.
* Defer deeper `MosaicScene` chunk attribution optimization.
	* Rationale: requires dedicated package-level attribution run and potential rendering-scope refactors.
	* Suggested owner: client performance maintainer.

## Release Summary

Files affected: 5 (2 added, 3 modified, 0 removed).

Created:

* `apps/client/src/ui/CanvasLoadingFallback.tsx` - suspense fallback component.
* `apps/client/src/ui/CanvasLoadingFallback.css` - fallback visual styling.

Modified:

* `apps/client/src/App.tsx` - toast runtime wiring removal and lazy-loaded canvas boundary.
* `.copilot-tracking/plans/2026-07-25/client-bundle-mitigation-plan.instructions.md` - completed checklist with conditional notes.
* `.copilot-tracking/plans/logs/2026-07-25/client-bundle-mitigation-log.md` - deviations and follow-on entries.

No dependency, infrastructure, or deployment configuration changes were required.
