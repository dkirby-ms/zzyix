---
applyTo: '.copilot-tracking/changes/2026-08-09/alexander-click-to-patch-placement-changes.md'
title: Alexander Click-to-Patch Placement Plan
description: Plan for a local canvas tool that imports the Alexander manifest into the selected owned patch
ms.date: 2026-08-09
ms.topic: plan
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Alexander Click-to-Patch Placement

## User Requests

* Build the clean v1 that fills the patch selected by the user.

## Objective

Expose the existing canonical Alexander import through an explicit canvas tool.
The user arms the tool, selects their owned patch on the canvas, confirms the
placement, and the client imports a locally generated manifest using that
patch's exact bounds.

## Implementation Checklist

### [x] Phase 1: Publish Local Import Artifact

<!-- parallelizable: false -->

* [x] Add a reproducible local command that generates the manifest into the
  client public directory without committing generated output.
* [x] Load the local artifact with explicit unavailable and malformed states.

### [x] Phase 2: Add Patch Placement Workflow

<!-- parallelizable: false -->

* [x] Add an accessible control that arms the Alexander placement mode.
* [x] Convert the next click in the owned patch to an exact deployment rectangle
  and source-to-world transform.
* [x] Confirm the selected patch and manifest placement count before mutations.
* [x] Report preflight and queue state without changing the ordinary tile tool.

### [x] Phase 3: Verify User Path

<!-- parallelizable: false -->

* [x] Add focused domain and browser coverage for artifact loading, selection,
  target binding, confirmation, and import dispatch.
* [x] Run the focused client test, build, lint, and multi-replica E2E suite.

## Constraints

* Use the existing `quilt_place_tile` queue only.
* Target only the active owned patch in v1. Do not infer another user's patch
  or allow cross-patch deployment.
* Keep generated manifests ignored and locally reproducible.
* Preserve Phase 6 agent-owned-write deferral.

## Success Criteria

* A local developer can prepare the manifest and place it into their owned
  patch through the browser.
* Clicks outside the owned patch do not start an import.
* The confirmation names the target patch and expected placement count.
* Preflight failures are visible and emit no mutations.