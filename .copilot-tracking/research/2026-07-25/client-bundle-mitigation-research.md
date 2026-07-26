<!-- markdownlint-disable-file -->
# Task Research: Client Bundle Mitigation and Gate Closure

## Scope

Define an implementation-ready path to address unresolved bundle-size blocker DD-04 and follow-on items WI-04 and WI-05 from .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md.

## Context Sources

* .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md
* .copilot-tracking/research/subagents/2026-07-25/client-bundle-mitigation-research.md
* apps/client/package.json
* apps/client/vite.config.ts
* apps/client/src/App.tsx
* apps/client/src/render/MosaicScene.tsx

## Baseline Findings

* Current client build emits a dominant JS bundle around 1.57 MB raw with a small CSS asset.
* Build configuration does not currently define explicit rollup chunking or manual chunk strategy.
* The heaviest always-loaded runtime path is the 3D render stack imported through MosaicScene.
* Runtime usage of UI primitives is narrow compared to wrapper surface implemented in the previous UX task.
* The icon adapter likely has low or zero runtime impact today and must be measured rather than assumed.

## Candidate Implementation Paths

### Path A: Remove unused runtime primitive wiring and run icon A/B experiment

* Remove app-root toast runtime plumbing if no active toast flow exists.
* Keep tooltip path because it is actively used in status error detail UX.
* Run WI-05 experiment by comparing build totals with and without icon adapter dependency surface.

Risk profile:
* Low functional risk.
* Low migration cost.
* Expected byte reduction may be modest.

### Path B: Lazy-load canvas rendering boundary

* Split canvas-mode stack behind React lazy import boundary.
* Keep lobby path in initial chunk and defer 3D stack until canvas mode is entered.

Risk profile:
* Medium risk due to loading-state and mode-transition handling.
* Strong potential improvement for initial-load performance.
* May not reduce total emitted bytes unless gate metric is changed from total output to initial-route payload.

### Path C: Narrow primitive surface to currently used runtime primitives

* Move unused primitive wrappers out of active runtime/import path or remove if not near-term required.
* Add import policy guidance to avoid root-level growth from optional primitives.

Risk profile:
* Low to medium risk depending on near-term feature roadmap.
* Helps avoid future overhead creep.

## Recommended Sequence

1. Execute Path A first because it is the lowest-risk and directly tied to WI-05 evidence collection.
2. Execute Path C second if Path A does not satisfy gate objective.
3. Execute Path B third if gate objective includes initial-load performance and remaining gap justifies code splitting.

## Measurement and Validation

Validation commands:

* npm run lint --workspace=apps/client
* npm run test --workspace=apps/client -- --run
* npm run build --workspace=apps/client
* cd apps/client && wc -c dist/assets/*
* cd apps/client && ls -lh dist/assets

Tracking outputs:

* Record before/after totals for raw bytes and gzip where available.
* Record per-phase delta and cumulative delta against current baseline.

## Open Decisions

* Gate metric definition remains ambiguous: total raw output bytes vs total gzip bytes vs initial-route payload.
* Plan default for implementation: use total raw dist asset bytes until owner clarifies otherwise.

## Planning Readiness

Research is sufficient to create a focused implementation plan for a new follow-on task that closes DD-04 through incremental low-risk steps and explicit measurement gates.