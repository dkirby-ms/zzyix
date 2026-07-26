---
title: Responsive App Shell and Debug Gating Research
description: Deep repository research for issue #77 focused on canvas-first responsiveness, overflow safety, and debug view gating in apps/client
ms.date: 2026-07-25
ms.topic: reference
---

## scope

* Research target: issue #77 canvas-first responsive app shell responsiveness and debug gating.
* Workspace investigated: apps/client only, with supporting contracts from server types where referenced by client.
* Goals covered:
* CSS/layout structure and breakpoints affecting canvas/sidebar dominance.
* Narrow-width overflow risks at 320px+ and likely enforcement points.
* Where zoom tier, world bounds, and solver details render, plus current development/debug gating state.
* Existing utility/config patterns for environment flags or debug toggles.
* Layout strategy options with tradeoffs grounded in current code.

## evidence log

* App shell is a 2-column grid on desktop with fixed-ish control rail width and flexible canvas column: apps/client/src/App.css:154, apps/client/src/App.css:157.
* Breakpoint at 960px collapses to one column and assigns rows `auto` + `minmax(62dvh, 1fr)`: apps/client/src/App.css:371, apps/client/src/App.css:398, apps/client/src/App.css:400.
* Controls panel allows scrolling (`overflow: auto`) and mobile max-height cap (34dvh): apps/client/src/App.css:182, apps/client/src/App.css:403.
* Canvas container clips overflow (`overflow: hidden`) and has min-height 74dvh: apps/client/src/App.css:285, apps/client/src/App.css:289.
* Status strip is absolute overlay with multiple inline spans and no wrap/ellipsis rules: apps/client/src/App.css:297, apps/client/src/App.css:303.
* Collaborator roster overlay has max-width constraint and wraps: apps/client/src/App.css:327, apps/client/src/App.css:334, apps/client/src/App.css:336.
* Debug overlay is absolutely positioned with hard `min-width: 240px`: apps/client/src/App.css:409, apps/client/src/App.css:421.
* Global baseline only enforces `body` `min-width: 320px`; no global x-overflow suppression in app CSS: apps/client/src/index.css:9, apps/client/src/index.css:10.
* Canvas mode render tree: `ControlsPanel` sibling + `section.canvas-shell` containing status strip, roster, scene, and debug overlay: apps/client/src/App.tsx:965, apps/client/src/App.tsx:967, apps/client/src/App.tsx:992.
* Zoom tier text is surfaced in status strip (`{zoomTier} zoom`): apps/client/src/App.tsx:998.
* World bounds text is surfaced in status strip with formatted min/max values: apps/client/src/App.tsx:999, apps/client/src/App.tsx:1000.
* Zoom tier state/hysteresis thresholds are defined in app constants: apps/client/src/App.tsx:82, apps/client/src/App.tsx:83, apps/client/src/App.tsx:84, apps/client/src/App.tsx:137.
* Zoom tier transitions are driven by `MosaicScene` callback and logged: apps/client/src/App.tsx:1045, apps/client/src/App.tsx:1055.
* World bounds state is sourced from snapshot bounds policy resolution: apps/client/src/App.tsx:339, apps/client/src/App.tsx:341, apps/client/src/App.tsx:185.
* Debug overlay renders only when `ghostVisible` is true, not by environment flag: apps/client/src/App.tsx:1066.
* Debug overlay values come from ghost state (`confidence`, `debugReason`, pointer position, tile count): apps/client/src/App.tsx:1070, apps/client/src/App.tsx:1074, apps/client/src/App.tsx:1079, apps/client/src/App.tsx:1084.
* Ghost `debugReason` is populated from solver output in pointer updates: apps/client/src/App.tsx:868, apps/client/src/App.tsx:870, apps/client/src/App.tsx:880.
* Controller maps solver `reason` to `debugReason`: apps/client/src/interaction/controller.ts:176, apps/client/src/interaction/controller.ts:182, apps/client/src/interaction/controller.ts:202.
* Placement solver provides reason strings for out-of-bounds, overlap, gap-too-large, and ok outcomes: apps/client/src/domain/placementSolver.ts:192, apps/client/src/domain/placementSolver.ts:224, apps/client/src/domain/placementSolver.ts:245, apps/client/src/domain/placementSolver.ts:255.
* Scene consumes world bounds for interaction plane dimensions and canvas ground bounds: apps/client/src/render/MosaicScene.tsx:287, apps/client/src/render/MosaicScene.tsx:308, apps/client/src/render/MosaicScene.tsx:445.
* Scene reports camera zoom each frame via `onZoomTierChanged`: apps/client/src/render/MosaicScene.tsx:323, apps/client/src/render/MosaicScene.tsx:339, apps/client/src/render/MosaicScene.tsx:357.
* Camera policy min/max zoom is configured in app and wired to OrbitControls: apps/client/src/App.tsx:209, apps/client/src/App.tsx:210, apps/client/src/App.tsx:211, apps/client/src/render/MosaicScene.tsx:469, apps/client/src/render/MosaicScene.tsx:470.
* Existing env/config pattern in client uses Vite runtime env (`import.meta.env.VITE_*`) in a dedicated resolver utility for server URL: apps/client/src/network/serverUrl.ts:1, apps/client/src/network/serverUrl.ts:3.
* Reusable overflow-safe text pattern already exists in status indicator (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`): apps/client/src/ui/StatusIndicator.css:112, apps/client/src/ui/StatusIndicator.css:114, apps/client/src/ui/StatusIndicator.css:115.

## key discoveries

* Current dominance behavior is desktop-balanced, not canvas-first. The desktop grid reserves 280px-360px for controls before canvas sizing, so canvas does not explicitly dominate on large screens: apps/client/src/App.css:157.
* Mobile breakpoint is single-threshold (960px) and switches to vertical stacking. This prevents side-by-side squeeze, but no additional 640px/480px/360px tuning exists for overlay density and micro-layouts.
* Most narrow-width risk is in absolute overlays, not in the base grid.
* Status strip likely overflows at very narrow widths due to many fixed-content spans and uppercase tracking without wrapping/ellipsis rules on strip items: apps/client/src/App.tsx:993, apps/client/src/App.tsx:1002, apps/client/src/App.css:303.
* Debug overlay has hard `min-width: 240px`, which is workable at 320px viewport but can still compete with insets and other overlays, especially when long reason strings break across lines: apps/client/src/App.css:421, apps/client/src/App.css:438.
* Debug details are currently user-interaction gated only (`ghostVisible`) and therefore visible in production once pointer moves. There is no development/build-mode gate in `App.tsx` for debug UI.
* Zoom tier and world bounds are already visible in end-user status strip, not only debug overlay. If issue #77 expects these as dev-only diagnostics, current behavior does not align.
* Existing configuration convention favors small dedicated resolver modules (`serverUrl.ts`) over scattered `import.meta.env` checks, which is a strong fit for a future debug flag resolver.

## layout options

* Option 1: Canvas-first grid with constrained rail.
* Strategy: keep two columns on desktop but move to `grid-template-columns: minmax(0, 1fr) clamp(240px, 26vw, 340px)` and place controls second.
* Tradeoff: maximizes canvas real estate while keeping a full controls panel visible; may require tab-order and visual-order checks for accessibility.
* Grounding: current layout already uses CSS grid and fixed-range rail, so this is a low-complexity evolution of existing structure: apps/client/src/App.css:154, apps/client/src/App.css:157.

* Option 2: Hybrid grid with intermediate breakpoint tiers.
* Strategy: retain current desktop pattern, add breakpoints around 768px and 480px for overlay compaction, status-strip wrapping/stacking, and control panel density reductions.
* Tradeoff: more CSS rules and regression surface, but least disruptive to current UX semantics.
* Grounding: current responsive logic is single-breakpoint only, so layering additional tiers addresses narrow-width risks directly without architecture shift: apps/client/src/App.css:371.

* Option 3: Canvas main with collapsible/drawer controls on small and medium widths.
* Strategy: make canvas always primary; controls become overlay drawer below a width threshold.
* Tradeoff: strongest canvas-first behavior and narrow-width safety, but highest interaction complexity (state, focus management, discoverability).
* Grounding: current controls are independent `aside` block, so encapsulation is suitable for drawer migration, but requires new interaction logic in app shell composition: apps/client/src/ui/ControlsPanel.tsx:46, apps/client/src/App.tsx:967.

## debug gating options

* Option A: Build-time gate using Vite env (recommended baseline).
* Pattern: introduce a dedicated resolver similar to `resolveServerUrl`, such as `resolveDebugEnabled()` reading `import.meta.env.VITE_ENABLE_DEBUG_OVERLAY` and optional default from `import.meta.env.DEV`.
* Tradeoff: zero runtime toggling unless URL/localStorage fallback is added; simplest and consistent with existing config patterns.
* Grounding: existing env resolver pattern is established in network utility: apps/client/src/network/serverUrl.ts:1, apps/client/src/network/serverUrl.ts:3.

* Option B: Runtime gate with query param and optional persistence.
* Pattern: derive debug flag from query string (for example `?debug=1`) and optionally localStorage override; combine with build-time allowlist.
* Tradeoff: flexible for QA and demos without rebuilds; needs guardrails to avoid accidental exposure.
* Grounding: no current query/localStorage flag utilities were found in client, so this adds a new pattern.

* Option C: Split diagnostics by audience.
* Pattern: keep lightweight user-facing health info (connection, counts) in status strip, move solver reason/confidence internals behind debug gate.
* Tradeoff: preserves useful operational status while reducing production noise and potential confusion.
* Grounding: current status strip already includes metrics-like data and debug overlay includes solver internals; separation line is clear in current UI: apps/client/src/App.tsx:993, apps/client/src/App.tsx:1067.

## risks

* Narrow-width overflow and clipping risk in status strip due to fixed horizontal content density and no overflow behavior on strip children.
* Overlay competition risk between collaborator roster, status strip, and debug overlay in small viewports because all are absolute, layered, and near top-right/bottom-right anchors.
* Debug information exposure risk: solver internals (`debugReason`) currently surface in normal runtime after pointer movement, with no environment/role gating.
* Potential mismatch with issue #77 intent: `zoomTier` and `bounds` are currently always shown in main status strip, not behind debug controls.
* If bounds text remains always-on, long formatted values can increase wrapping/overflow pressure in narrow widths.

## open questions

* For issue #77, should `zoomTier` and `bounds` remain user-visible in production, or should they move behind a debug gate along with solver reason/state?
* Should controls be permanently visible on desktop, or is a canvas-first layout allowed to demote controls into a secondary panel/drawer at wider breakpoints too?
* Is there a preferred source of truth for debug enablement across client (build flag only vs build flag + runtime override)?
* Are there product requirements for minimum readable diagnostics at 320px that define which status tokens must never truncate?
* Should collaborator roster priority outrank debug/status overlays on narrow screens (for example via conditional hiding or summarization)?
