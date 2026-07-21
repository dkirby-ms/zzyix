---
applyTo: '.copilot-tracking/plans/2026-07-21/canvas-scaling-camera-controls-plan.instructions.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Canvas Scaling and Camera Controls

## Overview

Scale the collaborative mosaic canvas from bounded small-world assumptions to large and practically unbounded navigation by introducing configurable world bounds, robust camera navigation policy, and phased chunk streaming with additive protocol and schema evolution.

## Objectives

### User Requirements

* Identify current canvas, world bounds, and placement constraints in client and server code. - Source: conversation request, .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Task Implementation Requests)
* Identify current camera setup and interaction input pathways. - Source: conversation request, .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Task Implementation Requests)
* Recommend architecture and implementation phases for larger canvases and chunking/infinite support. - Source: conversation request, .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Task Implementation Requests)
* Include concrete file-level touch points and pitfalls. - Source: conversation request, .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Task Implementation Requests)

### Derived Objectives

* Replace hardcoded default bounds with session-configurable world policies while preserving client/server placement parity. - Derived from: research discovery that bounds are enforced in both client and server placement solvers.
* Upgrade camera and visibility logic for two-dimensional large-world navigation by removing asymmetric X-only culling assumptions. - Derived from: current render path applies X-only filtering and existing zoom/pan limits target small worlds.
* Introduce additive chunk protocol and chunk-aware storage without breaking legacy snapshot and delta flows. - Derived from: selected phased migration and rollback-safe additive architecture in research.
* Validate chunk edge correctness, subscription churn behavior, and snapshot-delta ordering before broad rollout. - Derived from: identified high-risk scenarios in research risk and mitigation sections.

## Context Summary

### Project Files

* apps/client/src/domain/placementSolver.ts - Current fixed bounds constants and client-side placement validation.
* apps/client/src/render/MosaicScene.tsx - Orthographic camera setup, zoom limits, interaction handlers, and render filtering.
* apps/client/src/App.tsx - Camera pan state and scene integration points for viewport metadata.
* apps/server/src/contracts.ts - Session and event contract types to extend with chunk subscription and snapshot payloads.
* apps/server/src/index.ts - Session configuration, validation flow, snapshot and realtime fanout lifecycle.
* apps/server/src/db/schema.ts - Data model changes for chunk_x and chunk_y indexing.
* apps/server/src/db/repository.ts - Query and persistence paths for chunk-scoped reads and dual-write migration behavior.
* apps/server/src/index.integration.test.ts - Integration coverage entry points for protocol and ordering behavior.
* apps/client/src/domain/placementSolver.test.ts - Unit coverage surface for bounded and unbounded placement policies.
* apps/client/src/render - Rendering and visibility behavior surfaces for camera-driven tile filtering.

### References

* .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md - Primary technical research and selected architecture.
* .copilot-tracking/research/subagents/2026-07-21/canvas-camera-baseline-research.md - Baseline camera/input behavior references.
* .copilot-tracking/research/subagents/2026-07-21/chunking-architecture-options-research.md - Alternative architecture analysis and trade-offs.

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md - Markdown authoring conventions for tracking artifacts.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md - Writing style conventions.

## Implementation Checklist

### [x] Implementation Phase 1: Finite canvas scaling and camera policy foundation

<!-- parallelizable: false -->

* [x] Step 1.1: Introduce session-configurable bounds policy in client placement solver.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 11-30)
* [x] Step 1.2: Surface configurable canvas dimensions through server session metadata and validation inputs.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 31-49)
* [x] Step 1.3: Expand camera pan and zoom policy hooks and remove X-only render filtering.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 50-70)
* [x] Step 1.4: Validate phase changes.
  * Run lint, tests, and build commands for client and server bounds and camera changes.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 71-79)

### [x] Implementation Phase 2: Chunk protocol and realtime subscription core

<!-- parallelizable: false -->

* [x] Step 2.1: Add additive chunk event contracts and payload typing.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 85-105)
* [x] Step 2.2: Implement server chunk room subscribe, unsubscribe, and snapshot fanout flows.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 106-127)
* [x] Step 2.3: Derive visible chunk set from camera viewport with hysteresis and budget limits.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 128-147)
* [x] Step 2.4: Validate phase changes.
  * Run server and client protocol integration tests for chunk streaming behavior.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 148-156)

### [x] Implementation Phase 3: Chunk-aware persistence and migration safety

<!-- parallelizable: false -->

* [x] Step 3.1: Add chunk columns and indexes to tile persistence schema.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 162-180)
* [x] Step 3.2: Implement chunk-aware repository queries and dual-write read parity checks.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 181-201)
* [x] Step 3.3: Add migration verification and parity tests between legacy and chunked read paths.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 202-219)
* [x] Step 3.4: Validate phase changes.
  * Run schema migration checks and repository integration tests.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 220-228)

### [x] Implementation Phase 4: Zoom-tier aggregation and rollout controls

<!-- parallelizable: false -->

* [x] Step 4.1: Add zoom-tier policy and aggregate payload mode for far zoom levels.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 234-252)
* [x] Step 4.2: Add feature flags and canary session controls for chunking rollout.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 253-270)
* [x] Step 4.3: Add telemetry for subscription churn, payload size, and resync frequency.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 271-289)
* [x] Step 4.4: Add multi-replica readiness contract and failure-mode validation.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 290-309)
* [x] Step 4.5: Validate phase changes.
  * Run targeted performance and resilience checks for camera navigation and chunk fanout.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 310-318)

### [x] Implementation Phase 5: Final validation

<!-- parallelizable: false -->

* [x] Step 5.1: Run full project validation.
  * Execute all lint commands, build scripts, and test suites impacted by client, server, and schema changes.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 324-334)
* [x] Step 5.2: Fix minor validation issues.
  * Iterate on straightforward lint, type, and test failures related to this scope.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 335-338)
* [x] Step 5.3: Report blocking issues.
  * Document blockers that require additional research or design changes and defer large refactors.
  * Details: .copilot-tracking/details/2026-07-21/canvas-scaling-camera-controls-details.md (Lines 339-343)

## Planning Log

See .copilot-tracking/plans/logs/2026-07-21/canvas-scaling-camera-controls-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Root workspace scripts for lint, test, and build in package.json.
* TypeScript contract sharing between apps/client and apps/server.
* Socket.IO room fanout and ordered replay semantics.
* Drizzle migration workflow and PostgreSQL indexing support.

## Success Criteria

* Placement validation supports session-configured bounded mode and unbounded-ready mode while preserving client/server parity. - Traces to: bounded constraints requirement and research file analysis.
* Camera navigation supports larger world exploration with stable pan and zoom behavior and no asymmetric culling artifacts. - Traces to: camera controls requirement and render filtering discovery.
* Chunk protocol supports subscribe, unsubscribe, snapshot, delta, and resync workflows with compatibility fallback to legacy snapshot paths. - Traces to: chunk architecture and migration safety requirements.
* Database schema and repository operations support chunk-scoped query efficiency and verified read parity during migration. - Traces to: chunk persistence requirements and risk mitigation.
* Multi-replica readiness is represented by adapter-agnostic membership coordination contract semantics and validated failure-mode tests for delayed leave and duplicate membership ordering. - Traces to: Scenario 2 eventual multi-replica requirement.
* Rollout controls and telemetry provide measurable guardrails before full chunk protocol adoption. - Traces to: phased rollout and canary requirement from selected approach.
* Pre-canary gates are satisfied for chunk-size and hysteresis profiling plus database query-plan verification with documented pass thresholds. - Traces to: Potential Next Research items.
