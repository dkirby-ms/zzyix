---
title: UX Designer Redesign Prompt Research
description: Research brief for a visual UX redesign prompt for the Zzyix client
ms.date: 2026-08-04
ms.topic: concept
keywords:
  - ux design
  - visual redesign
  - prompt engineering
---

## Objective

Create a workspace prompt for a UX designer agent to rethink the visual experience of the
Zzyix application.

## User Requirements

* Focus solely on visual UX and interface design
* Preserve all current product functionality and user workflows
* Preserve the Vite and React implementation approach and existing application architecture
* Replace the proof-of-concept visual treatment with a considered design direction
* Consider the user's visual-related GitHub issues as design constraints

## Research Questions

* Which client screens, UI states, and visual primitives should the designer agent assess?
* What existing visual constraints and product context should the prompt preserve?
* What concrete, design-oriented deliverables should the prompt request?

## Sandbox and Evaluation

* No target prompt exists yet; evaluation will begin after prompt creation.
* Sandbox path: pending
* Evaluation log: pending

## Findings

* Zzyix is an authenticated collaborative craft workspace called Mosaic Atelier.
  Its core interaction is composing a shared quilt through direct placement on
  a 3D canvas.
* The visual audit must cover sign-in, loading, unavailable, error,
  mutation-disabled, desktop, tablet, mobile, and active authoring states.
* The design must retain the canvas-first hierarchy, existing controls and
  accessible semantics, 44px targets, focus visibility, reduced motion, and
  responsive overlay containment.
* The strongest visual opportunities are hierarchy among canvas overlays,
  palette density, non-color placement feedback, collaboration and ownership
  cues, and minimap or grid-overlay coherence.
* The current product has a warm craft direction, Fraunces and Sora
  typography, curated palettes, and direct placement feedback. The prompt
  should invite intentional refinement rather than prescribe those choices as
  immutable branding.
* The available GitHub search integration returned unrelated global results
  when scoped to this repository. The prompt will accept issue links or
  numbers as an explicit input and direct the designer to prioritize their
  visual requirements.

## Prompt Scope

Request a visual-only responsive redesign proposal with annotated desktop,
tablet, and mobile frames; visual tokens; hierarchy and spacing guidance;
overlay choreography; component-level styling redlines; and a state coverage
matrix. The proposal must retain existing workflows, labels, controls,
accessibility semantics, and React or Vite architecture.

## Evaluation Findings

* Supplied GitHub issue references must be resolved into an issue-to-design
  constraint mapping before a final proposal can be approved. When a reference
  cannot be accessed, the designer must request its text and report a blocked
  status instead of inventing requirements.
* The prompt should define GitHub retrieval as conditional on available access,
  include the repository scope, and require a text fallback for inaccessible
  issues.
* Visual validation must specify desktop, tablet, and mobile viewports; target
  states; contrast pairs; and a screenshot or manual-inspection method.
* A reusable prompt should delegate to a workspace UX Designer agent rather
  than depend on the ambient invocation agent.
* The implementation scope should preserve labels, but the designer may list
  non-binding content observations separately from the visual implementation
  plan.
