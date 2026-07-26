---
title: Client Bundle Mitigation Research
description: Actionable low-risk options to mitigate client bundle size for unresolved DD-04 / WI-04 / WI-05 gate
ms.date: 2026-07-25
ms.topic: troubleshooting
status: Complete
---

## Scope

Research task: identify actionable, low-risk bundle-size mitigation options for the client in `/home/saitcho/zzyix`, focused on unresolved gate items from `.copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md`:

* DD-04: Bundle-size acceptance threshold not met
* WI-04: Reduce UI bundle overhead from primitives/icons
* WI-05: Define and run a measurable icon adapter experiment

## Questions Investigated

1. What is the current client bundling setup and measured build output?
2. Which dependencies/import patterns are top likely contributors?
3. What low-risk mitigation paths can be implemented with minimal regression risk?
4. Which files are most likely to change and how should validation be run?
5. How should recommendations map to WI-04 and WI-05?

## Evidence Collected

### Build and bundling setup

* Bundler/tooling:
  * `apps/client/package.json`
    * `build`: `tsc -b && vite build`
    * `dev`: `vite`
  * `apps/client/vite.config.ts`
    * no custom `build.rollupOptions`
    * no manual chunking strategy
    * no visualizer/analyzer plugin configured
* Current production build output (`npm run build --workspace=apps/client`):
  * `dist/assets/index-DRe7ugTG.js`: 1,573,063 bytes (gzip 442.38 KB)
  * `dist/assets/index-DABnUy-K.css`: 15,037 bytes (gzip 3.89 KB)
  * total assets measured via `wc -c`: 1,588,100 bytes
* Existing gate log reference:
  * `.copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md`
  * documents +411,138 byte delta versus prior baseline (1,176,436 -> 1,587,574)

### Runtime import/contributor evidence

* Heavy always-imported render stack:
  * `apps/client/src/App.tsx` imports `./render/MosaicScene`
  * `apps/client/src/render/MosaicScene.tsx` imports:
    * `@react-three/fiber`
    * `@react-three/drei` (`OrbitControls`)
    * `three`
* Current primitive usage in runtime path:
  * `apps/client/src/App.tsx` imports `ToastProvider`, `ToastViewport`, `TooltipProvider`
  * `apps/client/src/ui/StatusIndicator.tsx` imports tooltip primitives
  * No runtime imports found for `AlertDialog`, `Dialog`, `Tabs`, `ToggleGroup`, `VisuallyHidden` wrappers
* Icon usage:
  * `apps/client/src/ui/icons/index.ts` re-exports lucide icons
  * No runtime imports found from `ui/icons` in `apps/client/src/**`
  * implication: current `lucide-react` impact may be near-zero in production bundle today (verify with WI-05 experiment)
* Static assets are small and unlikely primary contributors:
  * `apps/client/src/assets/*` and `apps/client/public/*` are tens of KB total, not hundreds

## Top Likely Contributors (ranked)

1. 3D runtime stack loaded in main chunk (`three`, `@react-three/fiber`, `@react-three/drei`) via eager `MosaicScene` import.
2. Radix tooltip and toast primitives imported at app root even though toast UX appears not currently exercised.
3. Possible residual UI library overhead from wrapper architecture assumptions (needs measurement), but unused wrappers likely already tree-shaken if unimported.
4. Icons likely not a current contributor unless imported (needs explicit WI-05 validation, not assumption).

## Low-Risk Mitigation Paths

### Path A (Recommended First): Remove unused runtime toast plumbing + verify icon zero-impact

Summary:

* Remove toast provider/viewport from app root if no toasts are dispatched.
* Remove `@radix-ui/react-toast` dependency and wrapper only if codebase confirms no runtime need.
* Execute WI-05 icon experiment to verify whether `lucide-react` is currently contributing.

Why low risk:

* `ToastViewport` is mounted but no in-app toast dispatch/usage was found in `apps/client/src/**`.
* Changes are localized and reversible.
* No change to core rendering or input logic.

Likely files to change:

* `apps/client/src/App.tsx`
* `apps/client/src/ui/primitives/Toast.tsx` (delete or quarantine)
* `apps/client/src/ui/primitives/Toast.test.tsx` (update/remove)
* `apps/client/package.json` (dependency cleanup)
* optional follow-up cleanup in `apps/client/src/ui/primitives/*` for unused wrappers

Trade-offs:

* If toasts are planned soon, removal may require reintroducing components.
* Gains likely modest relative to total bundle but low effort/risk.

Validation commands:

```bash
npm run lint --workspace=apps/client
npm run test --workspace=apps/client -- --run
npm run build --workspace=apps/client
cd apps/client && wc -c dist/assets/*
```

### Path B: Lazy-load canvas-only stack (MosaicScene and related UI shell)

Summary:

* Split canvas experience into lazy chunk(s) loaded only after lobby -> canvas transition.
* Keep lobby shell in initial bundle; defer three/fiber/drei payload.

Why low risk:

* Clear boundary already exists in `App.tsx` (`mode === 'lobby'` vs canvas).
* Behavioral logic can remain unchanged while import timing changes.

Likely files to change:

* `apps/client/src/App.tsx` (React.lazy/Suspense boundaries)
* optional extraction files:
  * `apps/client/src/ui/CanvasScreen.tsx`
  * `apps/client/src/ui/CanvasLoadingFallback.tsx`

Trade-offs:

* Improves initial load/user-perceived performance more than total asset bytes.
* May not satisfy a gate based strictly on total dist bytes unless gate metric is clarified.
* Adds loading-state UX requirements for first canvas entry.

Validation commands:

```bash
npm run test --workspace=apps/client -- --run
npm run build --workspace=apps/client
cd apps/client && ls -lh dist/assets
cd apps/client && wc -c dist/assets/*
```

### Path C: Narrow primitive surface to only actively used runtime components

Summary:

* Keep tooltip (needed for error detail UX), but reduce primitive footprint by:
  * removing unused wrappers and tests from runtime package scope, or
  * moving optional wrappers behind isolated modules not imported by app runtime.
* Add explicit import policy to prevent accidental root-level primitive expansion.

Why low risk:

* Runtime currently relies on tooltip/toast only.
* Unused wrappers can be isolated without touching domain logic.

Likely files to change:

* `apps/client/src/ui/primitives/AlertDialog.tsx`
* `apps/client/src/ui/primitives/Dialog.tsx`
* `apps/client/src/ui/primitives/Tabs.tsx`
* `apps/client/src/ui/primitives/ToggleGroup.tsx`
* `apps/client/src/ui/primitives/VisuallyHidden.tsx`
* `apps/client/package.json` (if dependencies removed after verification)
* optionally add guard doc/rule:
  * `.copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md` follow-up entry

Trade-offs:

* If these primitives are part of near-term feature roadmap, deletion may add churn later.
* Actual byte savings depend on current tree-shaking behavior and import graph.

Validation commands:

```bash
npm run lint --workspace=apps/client
npm run test --workspace=apps/client -- --run
npm run build --workspace=apps/client
cd apps/client && wc -c dist/assets/*
```

### Path D (Higher impact, still moderate risk): Replace `@react-three/drei` OrbitControls dependency path

Summary:

* Evaluate replacing `@react-three/drei` `OrbitControls` usage with a lighter control implementation path.

Why it may matter:

* `@react-three/drei` can pull additional helper surface depending on bundling behavior.

Likely files to change:

* `apps/client/src/render/MosaicScene.tsx`
* `apps/client/package.json`

Trade-offs:

* Higher regression risk: camera behavior, input edge cases, and interaction feel can change.
* Requires targeted interaction regression testing.

Validation commands:

```bash
npm run test --workspace=apps/client -- --run
npm run build --workspace=apps/client
cd apps/client && wc -c dist/assets/*
```

## WI Mapping

### WI-04: Reduce UI bundle overhead from primitives/icons

Recommended implementation sequence:

1. Path A (toast runtime removal if unused) for immediate low-risk reduction.
2. Path C (primitive surface narrowing) to prevent future overhead creep.
3. Path B (canvas lazy loading) for user-perceived performance and safer chunk boundaries; include note that this is mostly initial-load mitigation unless gate metric changes.

Acceptance check for WI-04:

* Run build and compare total bytes/gzip against current baseline.
* If total-byte gate remains failing, document measured deltas and proceed to gate-metric clarification decision.

### WI-05: Icon adapter measurable experiment

Experiment design (small and deterministic):

1. Confirm icon imports are absent in runtime:
   * `rg -n "ui/icons|lucide-react" apps/client/src`
2. Branch A (current): build and record dist totals.
3. Branch B: temporarily remove `lucide-react` dependency and `apps/client/src/ui/icons/index.ts`; build and compare totals.
4. Decision:
   * If delta ~= 0 bytes, icon adapter is not a current contributor; close WI-05 with evidence.
   * If delta is meaningful, reintroduce with per-icon import strategy and enforce adapter usage policy.

Suggested measurement commands:

```bash
npm run build --workspace=apps/client
cd apps/client && wc -c dist/assets/*
cd apps/client && ls -lh dist/assets
```

## Recommended Path to Execute Next

Selected recommendation: **Path A + WI-05 experiment first**, then **Path B** only if gate metric is clarified to initial-load focused KPI.

Reasoning:

* Path A gives the best risk-to-effort ratio and can be completed quickly.
* WI-05 experiment resolves whether icons are real or perceived overhead before making speculative refactors.
* Path B is valuable for UX/perf but may not satisfy current total-byte gate definition on its own.

## Clarifying Questions Raised

1. For DD-04/WI-04, is the acceptance gate authoritative on:
   * total raw dist bytes,
   * total gzip bytes, or
   * initial route chunk only?
2. Is toast UX intentionally planned for immediate follow-up, or can runtime toast plumbing be removed now?
3. Should WI-04 success prioritize absolute byte delta compliance, or user-perceived first-load performance?

## Recommended Next Research (if needed)

* Add temporary bundle visualizer (`rollup-plugin-visualizer`) on a short-lived branch to attribute exact KB by package/chunk.
* Record before/after metrics for Path A and Path B to quantify impact against each possible gate metric.
* Confirm product requirement for toast interactions before removing toast primitives.
