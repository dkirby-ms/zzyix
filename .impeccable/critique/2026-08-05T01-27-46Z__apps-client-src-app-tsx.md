---
target: client mosaic editor
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-05T01-27-46Z
slug: apps-client-src-app-tsx
---
Method: dual-agent (A: impeccable-finish-reviewer · B: impeccable-finish-reviewer), supplemented with a fresh browser evidence check because the delegated browser tool was unavailable.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 1 | Invalid placement and server rejection lack a readable, persistent explanation. |
| 2 | Match System / Real World | 3 | Atlas language is understandable, but legacy workshop styling leaks into the rendered editor. |
| 3 | User Control and Freedom | 2 | Undo, rotate, and mirror exist but are not visible controls. |
| 4 | Consistency and Standards | 1 | The documented Aurelia Atlas system conflicts with active Pattern Workshop CSS. |
| 5 | Error Prevention | 2 | Ghost validation exists, but grid incompatibility is announced after selection rather than prevented. |
| 6 | Recognition Rather Than Recall | 3 | The active tessera summary is clear; key transform and recovery actions remain hidden. |
| 7 | Flexibility and Efficiency | 2 | Keyboard shortcuts help experts but are undiscoverable. |
| 8 | Aesthetic and Minimalist Design | 2 | On mobile, the desktop-width palette and floating instruments crowd the canvas. |
| 9 | Error Recovery | 1 | A pulse communicates failure without cause or recovery path. |
| 10 | Help and Documentation | 1 | No in-context guidance explains placement, transforms, ownership, or shortcuts. |
| **Total** | | **18/40** | **Needs foundational UX and fidelity work** |

## Design Specificity Verdict

The intended Living Ancient Atlas is product-specific, but the rendered implementation contradicts it through active legacy Pattern Workshop typography, grid-paper backgrounds, and competing selection states. The canvas-first structure, minimap, and collaboration context are strong foundations.

The deterministic CLI scan was clean: 0 findings for `apps/client/src/App.tsx`. Fresh browser overlay injection succeeded. It reported one anti-pattern group with two callouts: an infinite 8px `.status-dot` pulse and the two-axis decorative grid-line background. The overlay was visible in the fresh browser tab. The CLI missed the browser-visible legacy styling and the mobile canvas compression.

## Overall Impression

The editor has real spatial tooling rather than decorative chrome, but it currently feels like two design systems occupying the same atlas. The highest-value move is to restore one visual language and make authoring feedback explicit.

## What's Working

- Direct ghost-based placement and the compact minimap reinforce the shared-world model.
- The authenticated header makes connection state and collaborator identity easy to locate.
- The active tessera summary gives the selected shape, material, palette, and hex value a useful anchor.

## Priority Issues

**[P0] Competing visual systems**
Why it matters: The documented Atlas contract specifies mineral stone, Marcellus/Manrope, lapis orientation, terracotta authorship, and ochre selection, while active CSS uses Pattern Workshop styles, Bodoni/Sora, and grid-paper effects. This breaks product specificity and makes command semantics unreliable.
Fix: Remove the legacy override layer and rebuild affected UI tokens to the Atlas contract. Use one selection treatment and reserve lapis for active navigation/commands.
Suggested command: `/impeccable polish`

**[P1] Authoring feedback has no actionable explanation**
Why it matters: A creator cannot distinguish invalid geometry, ownership restriction, or server rejection, so failed placement interrupts flow without a way forward.
Fix: Render a persistent, edge-contained placement-status instrument with valid, blocked, ownership-boundary, and server-rejection states plus a recovery action.
Suggested command: `/impeccable harden`

**[P1] Transform and recovery controls are invisible**
Why it matters: Rotation, mirroring, and undo depend on undeclared shortcuts, excluding first-time and touch users from core editing actions.
Fix: Place labeled rotation, mirror, and undo buttons beside Active tessera; keep keyboard shortcuts as accelerators.
Suggested command: `/impeccable onboard`

**[P1] Mobile preserves a desktop rail and constrains the canvas**
Why it matters: At 390px, the palette remains a wide right rail and the working field becomes a narrow, largely unusable column. This violates the canvas-dominance requirement.
Fix: Move the palette below the canvas at the documented breakpoint, constrain its height, and retain a single uninterrupted authoring field.
Suggested command: `/impeccable adapt`

**[P2] Selection overload arrives before placement**
Why it matters: Eight shapes, eight palettes, five colors, custom color, grid state, and world navigation exceed working-memory limits before the canvas interaction.
Fix: Put common shapes and the active palette first; progressively disclose alternatives and disable/filter incompatible shapes when a grid is active.
Suggested command: `/impeccable layout`

## Persona Red Flags

**Jordan (First-Timer):** The tile palette exposes 8 shapes and 8 palette choices but provides no visible rotate, mirror, undo, or placement guidance. Jordan must infer a key editing vocabulary from canvas behavior.

**Alex (Power User):** Keyboard undo and transforms are not surfaced. Alex cannot quickly learn whether shortcuts exist or recover from an invalid placement without trial and error.

**Morgan (Collaborator):** The header confirms Alice is connected, but the canvas does not clearly explain authorship or ownership context on tiles. In a busy world, Morgan cannot readily tell what is theirs, what changed, or why placement failed.

## Minor Observations

- The detector's infinite connection pulse adds persistent visual noise; use a stable semantic connection indicator except during a real transition.
- `role="application"` on the minimap creates keyboard-interaction expectations that the drag surface does not visibly explain.
- “Root” lacks patch or orientation context.
- Palette colors are announced primarily as hex codes, not descriptive accessible labels.

## Questions to Consider

- What must remain visible when a creator is placing their hundredth tile?
- Should a shared mosaic atlas make ownership legible directly on the world, rather than only in surrounding controls?
- Which controls deserve immediate visibility on touch devices: transform, undo, material, or grid?
