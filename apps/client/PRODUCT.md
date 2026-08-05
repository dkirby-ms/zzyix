---
title: Product
description: Durable product truth for the Zzyix client surface.
---

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are mosaic creators collaborating in real time on a shared world
canvas, including large-scale sessions with potentially hundreds to thousands
of concurrent participants.

## Product Purpose

The client enables people to compose and curate a shared mosaic by placing,
editing, and navigating tiles together in real time while preserving authorship
and ownership context.

Success means collaborators can confidently create on the same canvas at once, understand ownership context, and continue authoring without workflow confusion.

## Positioning

Zzyix is a continuous shared mosaic with ownership-aware collaboration, not a
single-user tile editor.

Its wrapped world model and ownership-aware authoring context define a
collaborative mechanism neighboring editors cannot truthfully copy without
adopting the same multiplayer world and ownership model.

## Operating Context

Users place tile shapes with selected materials and colors, optionally using pattern overlays, while panning and zooming across a wrapped world canvas.

The experience supports authenticated collaboration, collaborator presence cues, and return-to-owned-patch workflows during active sessions.

## Capabilities and Constraints

Confirmed capabilities include real-time collaborative tile placement, shape and material selection, optional grid-guided placement, ownership-aware context, and world-wrap navigation.

Technical constraints include browser-based rendering, a React and Three.js client surface, and synchronization with authoritative backend and persistence services.

Undecided product facts:

* Formal role taxonomy beyond collaborative creators is not yet fixed.
* Explicit non-WCAG compliance obligations are not yet documented.
* Public positioning language for non-technical audiences may evolve.

## Brand Commitments

Confirmed commitments:

* Preserve the product identity as zzyix and the shared mosaic metaphor.
* Preserve ownership-aware collaboration framing in product direction.

Undecided commitments:

* Formal voice and tone guardrails are not yet codified.
* Logo and static brand asset constraints are not yet codified in this client scope.

## Evidence on Hand

Available evidence:

* Root product narrative and collaboration framing in [README.md](../../README.md).
* Client feature and control details in [apps/client/README.md](README.md).
* Runtime and interaction implementation in [apps/client/src/App.tsx](src/App.tsx).
* Architecture and canonical quilt data context in [docs/canonical-quilt-data-storage.md](../../docs/canonical-quilt-data-storage.md).

Absence constraints:

* No fabricated customer stories, benchmarks, or external proof claims are authorized.
* No fabricated compliance attestations are authorized.

## Product Principles

* Prioritize multi-user authorship clarity on a single shared canvas.
* Preserve world continuity and spatial orientation during collaboration.
* Keep creative flow fast while maintaining placement integrity and ownership trust.
* Scale collaboration behavior without collapsing usability at high participant counts.
* Preserve product truth and avoid unverified claims in user-facing output.

## Accessibility & Inclusion

Interactive client surfaces target WCAG 2.2 AA as a durable baseline requirement.

Additional accessibility requirements remain open and should be captured as they are confirmed.
