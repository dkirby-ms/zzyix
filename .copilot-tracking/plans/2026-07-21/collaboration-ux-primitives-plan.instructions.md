---
applyTo: '.copilot-tracking/changes/2026-07-21/collaboration-ux-primitives-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Collaboration UX Primitives

## Overview

Implement foundational collaboration UX primitives by wiring active presence, remote cursor rendering, and explicit remote selection indicators into the existing realtime session architecture.

## Objectives

### User Requirements

* Show active users in the current canvas session. - Source: conversation context, .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Task Implementation Requests)
* Render remote cursor and selection indicators. - Source: conversation context, .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Task Implementation Requests)
* Keep indicators responsive to join, leave, and reconnect events. - Source: conversation context, .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Task Implementation Requests)
* Ensure visual behavior remains usable under moderate contention. - Source: conversation context, .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Task Implementation Requests)

### Derived Objectives

* Adopt existing server `pointer_update`, `client_joined`, and `client_left` events in client networking and state. - Derived from: server/runtime support exists but client subscriptions are missing.
* Add additive `selection_update` contract and fanout path for explicit remote selection intent. - Derived from: selection cannot be inferred reliably from pointer and tile deltas alone.
* Keep transient collaboration state ephemeral and isolated from canonical tile/revision state. - Derived from: existing architecture separates canonical state from realtime interaction signals.
* Harden collaborator state against reconnect and multi-tab churn with stale-state eviction and merge semantics. - Derived from: shared `clientId` across tabs can create false-leave and ghost cursor behaviors.
* Prevent false `client_left` events for same-client multi-socket sessions by gating leave emission on last-socket disconnect. - Derived from: current disconnect handling is socket-scoped while identity is shared by `clientId`.

## Context Summary

### Project Files

* apps/server/src/contracts.ts - Existing realtime event contracts and snapshot payload schema.
* apps/server/src/index.ts - Current join/leave/pointer runtime fanout behavior.
* apps/client/src/network/useSocketConnection.ts - Socket lifecycle and event subscription surface.
* apps/client/src/App.tsx - Session snapshot handling and pointer lifecycle orchestration.
* apps/client/src/render/MosaicScene.tsx - Scene interaction hooks and rendering extension point for indicators.
* apps/client/src/App.test.tsx - Primary client behavior test surface for presence UI and interaction state.
* apps/server/src/index.integration.test.ts - Server integration test surface for realtime fanout and reconnect semantics.
* apps/client/src/network/session.ts - Client identity/session persistence behavior impacting reconnect and multi-tab identity.

### References

* .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md - Primary architecture and approach research.
* .copilot-tracking/research/subagents/2026-07-21/collaboration-ux-primitives-implementation-research.md - Validation commands, edge cases, and test extension points.

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md - Markdown authoring conventions.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md - Writing style conventions for planning artifacts.

## Implementation Checklist

### [x] Implementation Phase 1: Client collaboration state and presence/cursor adoption

<!-- parallelizable: false -->

* [x] Step 1.1: Add collaborator state model and reducers in App layer.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 12-31)
* [x] Step 1.2: Subscribe to `pointer_update`, `client_joined`, and `client_left` in socket hook and wire callbacks.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 33-53)
* [x] Step 1.3: Seed collaborator roster from `session_snapshot.clients` and reconcile join/leave deltas.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 55-75)
* [x] Step 1.4: Render active users and remote cursor indicators in App/scene layers.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 77-96)
* [x] Step 1.5: Validate phase changes.
  * Run lint, tests, and build for client scope.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 98-105)

### [x] Implementation Phase 2: Remote selection event and visualization

<!-- parallelizable: false -->

* [x] Step 2.1: Add additive `selection_update` payload and event types in shared contracts.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 111-129)
* [x] Step 2.2: Implement server fanout for `selection_update` using existing room semantics.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 131-149)
* [x] Step 2.3: Emit local selection updates and consume remote selection updates in client state.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 151-167)
* [x] Step 2.4: Render remote selection indicators (outline or halo).
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 169-186)
* [x] Step 2.5: Validate phase changes.
  * Run lint and tests for server and client collaboration event integration.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 188-196)

### [x] Implementation Phase 3: Reconnect/churn hardening and contention resilience

<!-- parallelizable: false -->

* [x] Step 3.1: Implement server-side multi-socket leave correctness for shared `clientId` sessions.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 202-223)
* [x] Step 3.2: Add stale collaborator eviction and reconnect merge semantics.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 224-243)
* [x] Step 3.3: Add pointer and selection emission throttling for moderate contention.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 244-260)
* [x] Step 3.4: Extend client/server tests for collaboration flows and multi-socket edge cases.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 261-284)
* [x] Step 3.5: Validate phase changes.
  * Run targeted client/server test suites for collaboration coverage.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 285-291)

### [x] Implementation Phase 4: Final validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation.
  * Execute lint/test/build commands at root for client and server.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 297-305)
* [x] Step 4.2: Fix minor validation issues.
  * Iterate on straightforward lint/type/test corrections related to this implementation.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 307-309)
* [x] Step 4.3: Report blocking issues.
  * Document blockers that require additional planning instead of large refactors.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Lines 311-313)

### [x] Implementation Phase 5: Review-driven rework and hardening

<!-- parallelizable: false -->

* [x] Step 5.1: Make snapshot presence reconciliation authoritative and clear stale present ghosts.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Phase 5 Step 5.1)
* [x] Step 5.2: Optimize remote selection rendering lookup to O(1) per collaborator.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Phase 5 Step 5.2)
* [x] Step 5.3: Harden disconnect leave-gating for multi-replica socket topologies.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Phase 5 Step 5.3)
* [x] Step 5.4: Add deterministic tests for throttling semantics and selection fanout guard paths.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Phase 5 Step 5.4)
* [x] Step 5.5: Re-run full validation and resolve regressions within scope.
  * Details: .copilot-tracking/details/2026-07-21/collaboration-ux-primitives-details.md (Phase 5 Step 5.5)

## Planning Log

See .copilot-tracking/plans/logs/2026-07-21/collaboration-ux-primitives-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Workspace root scripts in package.json (`lint:*`, `test:*`, `build:*`).
* TypeScript event typing across client and server packages.
* Socket.IO room fanout and callback lifecycle.
* Vitest test suites for both apps.

## Success Criteria

* Active collaborator roster is rendered from snapshot and remains correct across join/leave/reconnect events. - Traces to: User requirement for active users and responsiveness.
* Remote cursor indicators render and update via realtime pointer fanout without local echo duplication. - Traces to: User requirement for remote cursors.
* Remote selection indicators render from explicit selection events with legible multi-user cues. - Traces to: User requirement for remote selection indicators.
* Same-client multi-tab disconnect churn does not emit false `client_left` events while at least one socket remains connected. - Traces to: reconnect/join/leave responsiveness requirement.
* Indicator behavior remains stable under moderate contention due to throttled emit and stale-state cleanup. - Traces to: User requirement for usability under contention.
* Client and server lint/test/build validation passes after implementation. - Traces to: project quality baseline.
