---
title: Alexander Click-to-Patch Placement Details
description: Execution details for the local patch-targeted Alexander import control
ms.date: 2026-08-09
ms.topic: plan
---
<!-- markdownlint-disable-file -->
# Implementation Details: Alexander Click-to-Patch Placement

## Phase 1

Add an npm command that writes the deterministic manifest to
`apps/client/public/alexander-patch-manifest.json`. The generated file remains
ignored. The client fetches this path only when the user arms the tool.

## Phase 2

Add an atlas control and confirmation dialog in `apps/client/src/App.tsx`.
When armed, the next pointer-up derives the patch address. It must equal the
canonical descriptor's assigned patch. Construct a deployment rectangle from
the descriptor origin, patch row, column, width, and height. Use the rectangle
origin and its dimensions for `sourceToWorld`.

## Phase 3

Extend the Canvas test API only when needed for an executable browser path.
Verify that the generated artifact is fetched, the confirmation appears, and
confirmation produces canonical queue traffic. Run focused client validation
before the configured multi-replica suite.