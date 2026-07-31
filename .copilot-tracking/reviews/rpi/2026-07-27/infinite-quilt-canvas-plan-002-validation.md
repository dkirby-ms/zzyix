---
title: Infinite Quilt Canvas Phase 002 Validation
description: Validation of the shared topology domain implementation against its plan and research requirements
author: GitHub Copilot
ms.date: 2026-07-27
ms.topic: reference
---

## Validation Scope

* Plan: `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md`
* Research: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* Phase: 2, Shared Topology Domain

## Executive Assessment

**Status: Failed**

Phase 2 implements the requested pure topology API and routes toroidal client
subscription identity through it. All six prescribed test, lint, and build
commands pass. However, client chunk canonicalization is incorrect when a quilt
period is not divisible by the fixed chunk size. The production test quilt has
a 62.4-unit width and 8-unit chunks, so one exact lap changes the canonical
subscription set and can subscribe an additional patch. This violates a
required Phase 2 success criterion and the research exit gate.

Coverage is assessed at **2 of 3 plan steps complete (67%)**. Step 2.1 is
complete, Step 2.2 is partial, and Step 2.3 is complete as written but does not
detect the Step 2.2 defect.

## Plan Item Comparison

### Step 2.1: Implement Canonical Topology Primitives

Status: Complete.

* The changes log claims positive modulo, canonical point and grid resolution, wrapped viewport decomposition, periodic images, and canonical subscription deduplication at `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md:18-20`.
* The framework-independent module exports all six required operations at `apps/server/src/domain/quiltTopology.ts:76-215`.
* Input validation covers finite values, positive dimensions, integer patch counts, valid rectangles, and integer grid addresses at `apps/server/src/domain/quiltTopology.ts:35-74` and `apps/server/src/domain/quiltTopology.ts:198-215`.
* Canonical points use half-open quilt and patch ranges at `apps/server/src/domain/quiltTopology.ts:80-105`.
* Wrapped viewports produce the Cartesian product of at most two intervals per axis at `apps/server/src/domain/quiltTopology.ts:107-145`.
* Direct tests cover negative coordinates, exact seams, multiple periods, nearest-image ties, four-corner decomposition, full-period views, periodic images, canonical deduplication, and invalid inputs at `apps/server/src/domain/quiltTopology.test.ts:20-114`.

The shared type was not exported from protocol contracts during Phase 2. This
matches the explicit plan condition to export it only when it crosses the wire
at `.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:68-75`.
The later protocol handshake has its own wire type at
`apps/server/src/contracts.ts:455-463`.

### Step 2.2: Route Client Viewport Math Through the Resolver

Status: Partial.

* The client directly imports the shared subscription deduplicator at `apps/client/src/domain/math2d.ts:1` and uses it for the explicit toroidal mode at `apps/client/src/domain/math2d.ts:75-108`.
* Explicit unbounded and bounded behavior remains available at `apps/client/src/domain/math2d.ts:15-18`, `apps/client/src/domain/math2d.ts:86-94`, and `apps/client/src/domain/math2d.ts:107-108`.
* Client tests preserve unbounded and bounded behavior and cover selected negative, multi-lap, corner, and deduplication examples at `apps/client/src/domain/math2d.test.ts:8-63`.
* Runtime protocol-v2 topology is routed into this mode at `apps/client/src/App.tsx:960-975`.
* The implementation fails exact-lap determinism for the production topology. See finding C-01.

### Step 2.3: Validate Topology Phase

Status: Complete as executed, but insufficient to establish Step 2.2 correctness.

The following prescribed gates passed on 2026-07-27:

* `npm run test:server -- src/domain/quiltTopology.test.ts`: 16 tests passed;
  resolver line coverage was 97.82% and branch coverage was 92.3%
* `npm run test:client -- src/domain/math2d.test.ts`: 5 tests passed
* `npm run lint:client`: passed
* `npm run lint:server`: passed
* `npm run build:client`: passed; Vite reported only its existing large-chunk
  advisory
* `npm run build:server`: passed

## Verified File Evidence

All Phase 2 files claimed by the changes log exist and contain the described
changes:

* `apps/server/src/domain/quiltTopology.ts`
* `apps/server/src/domain/quiltTopology.test.ts`
* `apps/client/src/domain/math2d.ts`
* `apps/client/src/domain/math2d.test.ts`

The implementation commit also modifies the related runtime call site and wire
contract. Both are disclosed elsewhere in the changes log:

* `apps/client/src/App.tsx` is listed at `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md:75-78`.
* `apps/server/src/contracts.ts` is listed at `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md:69` and `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md:94`.

No additional undisclosed Phase 2 implementation file was identified in the
implementation commit.

## Findings

### Critical Findings

#### C-01: Exact quilt laps do not preserve canonical chunk subscriptions

The toroidal client converts the unwrapped viewport directly to integer chunk
indices, then canonicalizes those indices by a count computed with
`ceil(quiltPeriod / chunkSize)` at
`apps/client/src/domain/math2d.ts:75-104` and
`apps/client/src/App.tsx:960-975`. This assumes the quilt period is an exact
multiple of the chunk size.

That assumption is false in the implemented topology. Runtime chunks are 8
units at `apps/server/src/contracts.ts:29`, while the seeded toroidal quilt is
two 31.2-unit patches wide at `apps/server/src/index.ts:1454-1457`. Its 62.4-unit
period therefore becomes eight canonical chunk columns.

A direct call to `viewportToChunkIds` with this production geometry returned:

```text
origin:       ["0:0"]
oneExactLap:  ["7:0", "0:0"]
equal:        false
```

The second ID is not harmless ordering noise. The client maps chunk 7 to patch
column 1 and sends both groups through `subscribe_quilt_area` at
`apps/client/src/App.tsx:982-1012`. The server resolves each accepted patch room
and emits its patch snapshot at `apps/server/src/index.ts:2252-2369`.

Impact:

* One exact lap can add an unrelated patch subscription and snapshot
* Repeated navigation can increase room churn, payload bytes, retained state,
  and scene work
* Subscription identity is not deterministic across equivalent unwrapped
  positions
* Phase 2 Step 2.2 and the research exit gate for multiple laps are unmet

Required correction: canonicalize viewport coordinates or decompose the
wrapped viewport before deriving chunk addresses. Do not modulo global chunk
indices by `ceil(period / chunkSize)` unless topology validation guarantees
chunk-aligned periods.

### Major Findings

None.

### Minor Findings

#### M-01: The tests described as property-style do not vary topology alignment

The implementation details require table and property-style invariant tests at
`.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:72-73`,
and the research calls for property-tested topology at
`.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md:282-286`.
The current suites use fixed examples only at
`apps/server/src/domain/quiltTopology.test.ts:20-114` and
`apps/client/src/domain/math2d.test.ts:8-63`.

The client multi-lap examples use a 32-unit width with 8-unit chunks, so they
cannot expose the non-aligned production period. Add invariant coverage across
different positive patch dimensions, chunk sizes, negative laps, exact laps,
and seam widths. At minimum, assert that translating any viewport by an integer
quilt period yields the same canonical subscription set.

## Coverage Assessment

The pure server resolver covers all requested capability categories:

* Positive modulo: covered
* Canonical point resolution: covered
* Nearest-image delta: covered
* Wrapped viewport decomposition: covered
* Periodic image enumeration: covered
* Canonical subscription deduplication: covered

The research exit-gate input categories are covered by server examples, but the
client integration does not satisfy the multi-lap invariant for the actual
topology:

* Negative positions: covered
* Exact seams: covered at resolver level
* Multiple laps: failed at client integration level
* Both axes: covered by examples
* Four-corner views: covered

Overall phase coverage is 67% by plan step. Functional capability coverage is
high, but the failed multi-lap subscription invariant blocks a passing status.

## Clarifying Questions

None. The plan, research, runtime topology, and direct reproduction provide
enough evidence to grade the phase.

## Recommended Next Validations

* [ ] Add an exact-lap regression using the production 62.4 by 20.4 quilt period
  and 8-unit chunks
* [ ] Add invariant tests for $S(V) = S(V + (nW, mH))$ across positive and
  negative integer laps
* [ ] Verify one-axis and corner seam subscriptions for non-chunk-aligned quilt
  periods
* [ ] Verify `subscribe_quilt_area` receives only the canonical visible patch
  rooms after the correction
* [ ] Rerun all six Phase 2 validation commands
* [ ] Rerun the seam and long-traversal E2E suites to check room churn, snapshot
  bytes, retained patch count, and scene count