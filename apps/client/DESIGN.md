---
title: Zzyix Aurelia Atlas Design System
name: Zzyix Aurelia Atlas
description: Canvas-first collaborative mosaic builder styled as a living ancient atlas
ms.date: 2026-08-04
colors:
  mineral-stone: "#efe5cd"
  mineral-deep: "#e5d6b9"
  graphite: "#28282a"
  lapis: "#193c68"
  terracotta: "#b84e36"
  ochre: "#d4972a"
  atlas-line: "rgba(61, 48, 37, 0.24)"
typography:
  display:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    letterSpacing: "0"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.07em"
rounded:
  compact: "4px"
  control: "8px"
  panel: "14px"
spacing:
  tight: "0.5rem"
  overlay: "0.75rem"
  rail: "1.15rem"
components:
  button-default:
    backgroundColor: "{colors.mineral-stone}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.compact}"
    padding: "0.5rem 0.82rem"
  button-active:
    backgroundColor: "{colors.lapis}"
    textColor: "{colors.mineral-stone}"
    rounded: "{rounded.compact}"
  mosaic-selection:
    backgroundColor: "{colors.ochre}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.compact}"
  atlas-rail:
    backgroundColor: "{colors.mineral-stone}"
    rounded: "0"
    padding: "{spacing.rail}"
---

## Overview

**Creative North Star: "The Living Ancient Atlas"**

Zzyix is an Operate-mode shared mosaic world, not a quilt workshop or a generic
editor dashboard. Bright mineral stone grounds the field; graphite inscriptions,
lapis orientation marks, terracotta authorship, and ochre selections let people
read where they are and what they may change without obscuring the mosaic.

The unframed canvas remains the dominant working field. A material rail,
header, status strip, collaborator roster, grid controls, and minimap act as
atlas instruments at its edges, preserving direct authoring and world-wrap
navigation for real-time collaboration.

**Key Characteristics:**

- Bright mineral stone and graphite inscription contrast
- Canvas-first atlas with edge-mounted orientation instruments
- Lapis for navigational or active command context
- Terracotta for authorship and located world context; ochre for active choice
- Classical display type paired with compact operational sans-serif text

## Colors

The palette behaves as a mineral atlas: neutral stone carries long sessions,
while each saturated color has one spatial or collaborative job.

### Primary

- Mineral Stone (`#efe5cd`): primary ground for pages, rails, and controls
- Graphite (`#28282a`): inscriptions, borders, and high-contrast content
- Lapis (`#193c68`): orientation, minimap occupancy, and active atlas commands

### Secondary

- Terracotta (`#b84e36`): author and viewport location signals, including the
  header mark and minimap viewport
- Ochre (`#d4972a`): selected mosaic tools and material choices

### Neutral

- Deep Mineral (`#e5d6b9`): secondary stone ground and minimap field
- Atlas Line (`rgba(61, 48, 37, 0.24)`): quiet structural divisions
- Semantic status colors: green, yellow, red, and gray preserve connection and
  placement feedback rather than taking on atlas meaning

### Named Rules

**The Compass Rule.** Lapis communicates orientation and active command state;
it is not a general surface fill.

**The Authorship Rule.** Terracotta identifies a creator's located context, and
ochre identifies the current local selection. Neither replaces status feedback.

## Typography

**Display Font:** Marcellus, with Georgia serif fallback

**Body Font:** Manrope, with system sans-serif fallback

**Character:** Marcellus provides the inscriptional, classical voice for the
Atlas. Manrope keeps control labels, collaborator context, and dense spatial
readouts clear during active operation.

### Hierarchy

- **Display** (400, 1.5rem, normal): atlas name and prominent workspace titles
- **Heading** (600-700, 1.125-1.25rem, normal): panel and operational headings
- **Body** (400, 1rem, normal): application copy and live readouts
- **Label** (700, 0.75rem, 0.07em): compact uppercase context, status, and map
  instrument labels

### Named Rules

**The Inscription Rule.** Display serif is reserved for names and hierarchy;
it does not replace high-legibility operational labels.

## Layout

Desktop uses a canvas-and-rail grid: a fluid mosaic field beside a 312px
material rail. The header is at least 68px tall. Canvas instruments are
edge-mounted at 1rem, with the status and collaborator context above and grid
and minimap navigation below.

At 960px and below, the rail moves below the canvas and is height-contained;
the shape chooser expands to eight columns. At 640px and below, header detail
reduces, the shape chooser returns to four columns, and edge offsets contract
to 0.75rem. The minimap retains intrinsic height so it cannot consume the
canvas on narrow screens.

**The Mosaic Dominance Rule.** Application chrome may orient and support the
world, but may not turn the mosaic field into a padded dashboard card.

## Elevation & Depth

Atlas depth is functional: mineral panels separate instruments from the
mosaic, using translucent stone, borders, and restrained shadows. The rail is
joined to the canvas without a floating-card lift; edge instruments use the
stronger overlay shadow.

### Shadow Vocabulary

- Panel lift (`0 18px 40px rgba(39, 25, 16, 0.12)`): distinct panels outside
  the active world field
- Instrument lift (`0 8px 18px rgba(16, 47, 61, 0.12)`): status, roster,
  grid, and minimap overlays
- Control lift (`0 2px 5px rgba(16, 47, 61, 0.08)`): actionable controls at
  rest

### Named Rules

**The Instrument Rule.** Elevation denotes a movable atlas instrument or
transient panel, never generic decoration around the mosaic.

## Shapes

The durable form language uses tight rectangular atlas instruments: compact
corners are 4px, common controls 8px, and legacy surface containers may use
14px where source already requires them. Borders are one pixel and graphite
tinted. The header mark is a 30px square with a 2px graphite outline.

## Components

### Buttons

Buttons use mineral stone, graphite text, a 44px minimum target, and compact
corners. Enabled hover shifts one pixel up-left, strengthens the lapis border,
and adds lift; press reverses that motion. Lapis is the active command state.
Focus uses a 2px ochre ring offset by 3px.

### Material Rail and Selection Tools

The material rail is a 312px desktop atlas margin, separated from the canvas by
a single border and padded 1.15rem. Shape tools form a four-column 64px grid;
active tools use ochre. Palette swatches stay small and squared so material
reads as tesserae rather than generic tags.

### Atlas Overlays

Status, collaborators, grid controls, and minimap are bounded, translucent
mineral instruments with atlas-line borders and the instrument lift. Lapis
labels identify orientation. The minimap uses a 10px grid, lapis occupancy,
and a square terracotta viewport frame.

### Navigation

The header pairs the square terracotta mark with the product name and the
"Shared mosaic atlas" subtitle. Collaborator presence remains compact and
right-aligned. On smaller screens, the subtitle, profile name, and return text
give way before world controls do.

## Do's and Don'ts

### Do:

- **Do** keep the shared mosaic as the largest uninterrupted surface.
- **Do** use lapis for directional and active atlas context.
- **Do** use terracotta for authorship and current-world location, and ochre
  for the user's active material or tool selection.
- **Do** keep overlays edge-contained and intrinsically sized on mobile.
- **Do** preserve 44px minimum interactive targets and the visible ochre focus
  treatment.

### Don't:

- **Don't** return to quilt, workshop, blueprint, or generic dashboard framing.
- **Don't** use terracotta or ochre as broad page fills or substitutes for
  connection status.
- **Don't** let an overlay stretch through the canvas height on narrow screens.
- **Don't** place the mosaic inside a decorative outer card.
- **Don't** promote the appended legacy workshop-named CSS variables or its
  Bodoni Moda/Sora overrides to the Aurelia Atlas system; they conflict with
  the current Atlas token layer and direction contract.

<!-- Legacy Pattern Workshop documentation retained only as non-rendered history.
---
title: Zzyix Pattern Workshop Design System
name: Zzyix Pattern Workshop
description: Canvas-first collaborative quilt editor styled as a precise working pattern table
ms.date: 2026-08-04
colors:
  blueprint-ink: "#102f3d"
  workshop-blue: "#14627a"
  canvas-paper: "#f5f0e4"
  paper-deep: "#e9dfca"
  copper-pin: "#bf5c39"
  measuring-yellow: "#f0c453"
  workshop-line: "rgba(16, 47, 61, 0.19)"
typography:
  display:
    fontFamily: "Bodoni Moda, serif"
    fontSize: "1.55rem"
    fontWeight: 700
    letterSpacing: "0"
  body:
    fontFamily: "Sora, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  label:
    fontFamily: "Sora, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  workshop: "4px"
  control: "3px"
  track: "2px"
spacing:
  compact: "0.5rem"
  overlay: "0.75rem"
  rail: "1.15rem"
components:
  button-default:
    backgroundColor: "{colors.canvas-paper}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.82rem"
  button-active:
    backgroundColor: "{colors.workshop-blue}"
    textColor: "{colors.canvas-paper}"
    rounded: "{rounded.control}"
  palette-selection:
    backgroundColor: "{colors.measuring-yellow}"
    textColor: "{colors.blueprint-ink}"
    rounded: "{rounded.control}"
  material-rail:
    backgroundColor: "{colors.canvas-paper}"
    rounded: "{rounded.workshop}"
    padding: "{spacing.rail}"
---

## Overview

**Creative North Star: "The Working Pattern Table"**

Zzyix presents collaborative quilt editing as a craft workspace rather than a
dashboard. Blueprint ink, ruled paper, copper markers, and exact rectangular
instruments keep attention on the shared canvas while making material choices
and spatial context readable at a glance.

The canvas occupies the primary workspace. A compact material rail supplies
tile controls, while status, collaboration, grid, and navigation tools stay at
the canvas edges as contained overlays. This preserves direct manipulation as
the visual priority for a collaborative, wrapped world.

**Key Characteristics:**

* Blueprint-and-paper material language
* Canvas-first layout with a fixed desktop material rail
* Square, measured controls with small press movement
* Narrow uppercase Sora labels paired with Bodoni Moda display text
* Contained edge overlays that preserve the visible canvas

The Pattern Workshop rules govern the authenticated quilt editor. Older
authentication and account-shell affordances can retain their existing rounded
forms until those surfaces are redesigned; they are not reusable workshop
primitives.

## Colors

The palette separates structural blueprint ink from pale working paper, using
copper and yellow as deliberate marks of action and selection.

### Primary

* Blueprint Ink: structural text, borders, and canvas instrumentation use the
  `blueprint-ink` token
* Workshop Blue: active actions, compact metadata, and minimap occupancy use
  the `workshop-blue` token

### Secondary

* Copper Pin: the minimap viewport and the brand mark use `copper-pin` to mark
  location and identity without becoming a page fill
* Measuring Yellow: selected tile tools and the mark offset use
  `measuring-yellow` as a high-visibility physical accent

### Neutral

* Canvas Paper: the primary workspace and controls use `canvas-paper`
* Paper Deep: the minimap ground uses `paper-deep`
* Workshop Line: low-contrast structural divisions use `workshop-line`

### Named Rules

**The Blueprint Ground Rule.** Paper backgrounds carry a 24px blueprint grid;
the grid supports orientation and never competes with tiles or text.

**The Marking Rule.** Copper and yellow identify a located, selected, or
authored state. They are not general-purpose surface colors.

## Typography

**Display Font:** Bodoni Moda, serif

**Body Font:** Sora, sans-serif

**Character:** Bodoni Moda gives the studio name and panel title a crafted,
editorial voice. Sora holds dense controls, technical labels, and live
collaboration context with compact clarity.

### Hierarchy

* **Display** (700, 1.55rem, normal): use for the zzyix wordmark and prominent
  panel titles
* **Panel Title** (700, 1.28rem, normal): use in the material rail heading
* **Body** (400, 1rem, normal): use for application copy and readouts
* **Control Label** (700, 0.68rem, 0.08em): use uppercase for measured
  categories, statuses, and compact technical labels
* **Metadata** (700, 0.74rem, 0.08em): use for collaborator and canvas-edge
  context

### Named Rules

**The Drafting Label Rule.** Uppercase tracking belongs to compact Sora labels
and status information; it does not replace the Bodoni display hierarchy.

## Layout

On desktop, the workspace is a two-column grid: a flexible canvas and a 312px
material rail. The header is at least 68px tall and keeps account context to
the far edge. The canvas has no outer card frame; overlays are positioned
within it at 1rem from their relevant edges.

At 960px and below, the rail moves beneath the canvas and opens as a
height-contained control area. The shape grid expands to eight columns at this
intermediate width, then returns to four at 640px and below. Mobile reduces
edge offsets to 0.75rem and hides nonessential header details. The minimap
stays edge-aligned with `height: fit-content` so it cannot stretch through the
canvas on narrow screens.

**The Canvas Dominance Rule.** Workspace chrome may frame the canvas, but may
not convert it into a padded card or consume its central field.

## Elevation & Depth

Depth is restrained and structural. The material rail is visually joined to
the workspace without shadow; floating canvas overlays use the small cool-ink
shadow `0 8px 18px rgba(16, 47, 61, 0.12)`. Default controls use a smaller
`0 2px 5px rgba(16, 47, 61, 0.08)` lift, then move one pixel up-left on hover
and down-right on press.

### Shadow Vocabulary

* Overlay lift (`0 8px 18px rgba(16, 47, 61, 0.12)`): edge panels over the
  active canvas
* Control lift (`0 2px 5px rgba(16, 47, 61, 0.08)`): buttons and discrete
  instruments at rest
* Active control lift (`0 3px 8px rgba(16, 47, 61, 0.2)`): selected blue
  action state

### Named Rules

**The Instrument Rule.** Elevation implies a movable instrument or an overlay,
not generic card decoration.

## Shapes

Pattern Workshop uses 4px panel corners, 3px button corners, and 2px minimap
tracks. Borders are one pixel and ink-tinted. The brand mark is a 30px square
with a 2px ink border and a 3px yellow offset, establishing the system's
rectangular, crafted geometry.

Pattern Workshop controls, selections, tool cards, and overlays are squared.
Rounded account and status affordances belong to the legacy application shell,
not the workshop component vocabulary.

## Components

### Buttons

Controls use canvas paper, a workshop-line border, Sora weight 650, 3px
corners, and a 44px minimum touch target. Hover moves an enabled control
one pixel up-left, strengthens the blue border, and increases its lift. Active
press reverses that movement. Blue is reserved for active command states.

### Material Rail

The desktop rail is 312px wide, joined to the canvas by a single left border,
and padded 1.15rem. It repeats the 24px blueprint grid over canvas paper.
The rail header uses a 2px ink rule, Bodoni Moda title, and Sora category
labels. Selected shape cards use yellow with an ink border.

### Tile Tools

Shape tools form a four-column desktop grid with 64px minimum-height cards.
They use centered line previews and 0.64rem Sora labels. Palette swatches and
palette strips retain small squared corners so color reads as a material sample,
not a generic chip.

### Canvas Overlays

Status, collaborator, grid, navigation, and minimap overlays use pale paper,
3px corners, ink-tinted borders, and the overlay lift. Their labels use blue,
uppercase Sora tracking. Overlays are edge-anchored and must retain a bounded
size relative to the canvas.

### Minimap

The minimap is a compact square paper track with a 10px drafting grid.
Occupancy uses workshop blue, while the current viewport uses a square copper
frame with a translucent copper fill. On mobile, it remains top-right aligned
and uses intrinsic height so the overlay stays contained.

### Navigation

The header combines a square copper-and-yellow mark, a Bodoni Moda wordmark,
and compact collaboration/account instruments. At narrow widths, the studio
subtitle, profile text, and return-button wording give way before canvas
controls do.

## Do's and Don'ts

### Do:

* **Do** keep the shared canvas as the largest uninterrupted surface
* **Do** use paper grids to express the working-table material language
* **Do** reserve blue for active workflow state and structured context
* **Do** use copper and yellow for precise selection, location, and identity
  signals
* **Do** keep mobile overlays intrinsically sized and edge-contained

### Don't:

* **Don't** round Pattern Workshop tools into pill-shaped controls
* **Don't** place generic dashboard cards around the canvas
* **Don't** use the blueprint grid as a competing decorative pattern
* **Don't** let an overlay expand to the canvas height on narrow screens
* **Don't** reuse legacy pill-shaped shell controls in editor workflows
-->
