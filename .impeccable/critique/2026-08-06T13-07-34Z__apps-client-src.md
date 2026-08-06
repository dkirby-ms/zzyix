---
target: light mode vs dark mode
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-06T13-07-34Z
slug: apps-client-src
---
Method: dual-agent (A: UX Designer · B: Explore); parent validation completed the required detector run and live authenticated browser comparison with test-auth.

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | --- | --- |
| 1 | Visibility of System Status | 3 | Connection, grid, and map states are visible, but dark-mode low-contrast secondary labels weaken scanning. |
| 2 | Match System / Real World | 2 | The interaction model is spatial, but "Galaxy" language and catacomb styling conflict with the specified Atlas. |
| 3 | User Control and Freedom | 3 | The theme switch, zoom, navigation, and help controls are present; the theme is also persisted. |
| 4 | Consistency and Standards | 1 | Dark "catacomb galaxy," light workshop tokens, and the Atlas contract describe three different systems. |
| 5 | Error Prevention | 2 | Selection and state affordances are clear, but the small utility controls invite missed targets. |
| 6 | Recognition Rather Than Recall | 3 | The visible interaction guide and labelled palette support recognition. |
| 7 | Flexibility and Efficiency | 3 | Canvas controls, shortcuts, and persistent preferences support repeat use. |
| 8 | Aesthetic and Minimalist Design | 2 | The canvas remains dominant, but gradients, glows, and competing fantasy language dilute the operational scene. |
| 9 | Error Recovery | 2 | Connection state is present; recovery context is not prominent. |
| 10 | Help and Documentation | 3 | The in-canvas guide documents primary actions, but the dark-mode guide is visually recessive. |
| **Total** | | **24/40** | **Needs a single visual-system decision** |

## Design Specificity Verdict

The interface is authored and recognizably specific, but the two modes describe incompatible products. The documented operating surface is a bright, mineral "Living Ancient Atlas". Live dark mode instead reads as a black-violet galaxy/catacomb editor, while live light mode reads as a pale workshop panel wrapped around the same black canvas. Theme preference is correctly persisted through `zzyix.themeMode` and root `data-theme`, but the semantic palette is not.

The deterministic scan reported widespread design-system drift in the client, including undocumented colors, fonts, and radii. In `App.css`, the light overrides begin at line 1689, yet unscoped hardcoded values remain in auth/error/lobby surfaces and the default dark visual layer. The scan's test-file color findings are false positives for this visual critique; its production `App.css`, grid-overlay, and scene findings corroborate the design-system mismatch.

Live browser evidence used the repository test-auth stack. The authenticated canvas rendered in both modes with identical structure. Dark mode showed violet-black header, workspace, rail, and overlays. Light mode changed header, rail, and overlays to warm off-white but left the canvas near black. The browser overlay detector was not injected, so no user-visible overlay is available.

## Overall Impression

The spatial editor has a strong canvas-first foundation and a usable control model. Its largest opportunity is not a palette tweak: choose one Atlas semantic system, then express its luminance differently in light and dark modes.

## What's Working

* The canvas remains the largest uninterrupted surface in both live modes, matching the Mosaic Dominance Rule.
* Theme state is immediate, labelled as the destination mode, and persisted through local storage.
* The interaction guide, labelled controls, selection state, and semantic landmarks make first-use authoring legible.

## Priority Issues

* **[P0] Theme modes are separate art directions.** Why it matters: light and dark users operate what feels like different products, eroding familiarity and the documented Atlas identity. Fix: establish Atlas semantic tokens for surface, ink, line, active command, authorship, and selection; give each a light and dark tonal value while retaining the same role in both modes. Suggested command: `/impeccable colorize`
* **[P0] Product language contradicts the visual contract.** Why it matters: `Mosaic Galaxy`, `Galaxy map`, `Enclave`, and `Living relic mosaic galaxy` make orientation feel like fantasy lore while the approved design calls for a shared mosaic atlas. Fix: decide the product vocabulary, then align `AppHeader.tsx`, `App.tsx`, live headings, and DESIGN.md with that decision. Suggested command: `/impeccable clarify`
* **[P1] Light mode is only a partial cascade.** Why it matters: only selected surfaces receive overrides, while many hardcoded shadows, tints, borders, and type choices remain dark/default or workshop-specific. Fix: replace literal visual values with semantic theme tokens and cover auth, errors, lobby, header, workspace, rail, overlays, and canvas utilities. Suggested command: `/impeccable extract`
* **[P1] Dark mode reduces operational scanability.** Why it matters: the live dark screenshot shows subtle labels such as `Square lattice`, patch coordinates, and canvas instrumentation receding into black-violet framing. Fix: increase the luminance separation of secondary text and boundaries without using glow as the primary cue; reserve lapis, terracotta, and ochre for their named atlas jobs. Suggested command: `/impeccable colorize`
* **[P2] Important utilities miss the 44px target.** Why it matters: the 36px theme/sign-out controls and smaller zoom/minimap actions increase precision cost on touch and dense work sessions. Fix: make the button hit areas at least 44px while retaining compact visual glyphs. Suggested command: `/impeccable adapt`

## Persona Red Flags

**Alex, returning mosaic creator:** Switching themes changes the perceived working environment from a dark fantasy galaxy to pale paper without preserving the same semantic landmarks. Alex must re-establish which colors represent navigation, location, and selection rather than benefiting from the stored preference.

**Jordan, first-time collaborator:** The visible guide works, but `Mosaic Galaxy`, `Enclave`, and `Galaxy map` do not explain the real collaborative world model as directly as an atlas vocabulary would. Jordan sees a coherent fiction before a clear collaboration frame.

**Riley, low-vision operator:** In the live dark workspace, secondary labels and the `Square lattice` status recede against dark violet/black fields. The contrast hierarchy makes supporting operational context harder to scan even though the primary labels are readable.

## Minor Observations

* The theme toggle's accessible destination label is correct and should remain.
* Light mode's warm header and panels are closer to the documented mineral ground than dark mode, but teal/workshop tokens still violate the Atlas palette.
* The server emitted a Three.js `THREE.Clock` deprecation warning during the visual review; it is not a theme finding.

## Questions to Consider

* Is dark mode meant to be an equal Atlas mode, or a separate experimental galaxy art direction?
* Should the product become an atlas everywhere, or should DESIGN.md be replaced to approve the galaxy vocabulary?
* Which matters more in the first implementation pass: semantic parity between themes, or improving dark-mode legibility for long canvas sessions?
