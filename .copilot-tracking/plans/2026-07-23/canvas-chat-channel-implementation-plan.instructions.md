---
applyTo: '.copilot-tracking/changes/2026-07-23/canvas-chat-channel-implementation-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Canvas Chat Channel Implementation

## Overview

Implement per-canvas chat channels in the existing Socket.IO architecture with typed contracts, server-side authorization and replay, and client UI integration without replacing transport or backend framework.

## Objectives

### User Requirements

* Build out a chat feature for the mosaic app — Source: user request in attached research context
* Ensure each canvas has its own chat channel — Source: user request in attached research context
* Reuse the existing WSS and Socket.IO approach where practical — Source: user request in attached research context
* Research and compare implementation options before coding — Source: .copilot-tracking/research/subagents/2026-07-23/chat-library-options-research.md

### Derived Objectives

* Lock v1 chat operating constraints before coding to prevent contract and validator drift — Derived from: configuration and sizing guidance in .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md
* Add strongly typed chat event contracts shared by server and client — Derived from: contract-first event architecture in .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md
* Enforce canvas/session isolation for all chat events — Derived from: existing canvasId/sessionId invariant checks in .copilot-tracking/research/subagents/2026-07-23/codebase-chat-integration-research.md
* Implement bounded replay for reconnect safety and UX continuity — Derived from: reconnect gap finding and Socket.IO replay guidance in .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md
* Add persistence and idempotency constraints for reliable delivery — Derived from: Postgres-first recommendation in .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md
* Add chat observability and scale-readiness checks to validate operational behavior — Derived from: instrumentation and scaling guidance in .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md
* Keep startup ordering compliant with adapter initialization constraints — Derived from: /memories/repo/startup-db-ordering.md

## Context Summary

### Project Files

* apps/server/src/contracts.ts - Shared socket protocol and schema versioning for typed events
* apps/server/src/index.ts - Socket.IO lifecycle, room joins, runtime payload guards, and broadcast patterns
* apps/server/src/db/schema.ts - Existing persistence model, migration target for chat tables/indexes
* apps/server/migrations/ - SQL migration location for schema additions
* apps/client/src/network/useSocketConnection.ts - Centralized listener and callback wiring for socket events
* apps/client/src/App.tsx - App-level emit paths, session lifecycle, and UI composition root
* apps/client/src/ui/ - Existing UI component layer where chat panel should be introduced
* apps/server/src/index.integration.test.ts - Integration test location for real-time behavior verification
* apps/client/src/network/useSocketConnection.test.ts - Client networking behavior tests

### References

* .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md - Primary research, architecture fit, and recommended implementation path
* .copilot-tracking/research/subagents/2026-07-23/codebase-chat-integration-research.md - File-level evidence and line references for integration points
* .copilot-tracking/research/subagents/2026-07-23/chat-library-options-research.md - Library trade-offs and no-drop-in conclusion
* /memories/repo/startup-db-ordering.md - Adapter initialization sequencing and test execution caveat

### Standards References

* /home/dakir/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md — Markdown lint and frontmatter conventions
* /home/dakir/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md — Writing style and formatting conventions

## Implementation Checklist

### [x] Implementation Phase 1: Contracts and Persistence Foundation

<!-- parallelizable: false -->

* [x] Step 1.1: Lock v1 chat constraints (retentionDays, maxMessageLength, replayPageSize, maxReplayPageSize, ackTimeoutMs)
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 11-34)
* [x] Step 1.2: Add chat event and payload types to shared contracts
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 35-57)
* [x] Step 1.3: Add Postgres chat schema and migration for message storage, ordering, and idempotency
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 58-83)
* [x] Step 1.4: Validate phase changes
  * Run lint and build commands for modified files
  * Skip if validation conflicts with parallel phases

### [x] Implementation Phase 2: Server Chat Event Pipeline

<!-- parallelizable: false -->

* [x] Step 2.1: Implement runtime chat payload validators and guardrails in server handler layer
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 63-86)
* [x] Step 2.2: Implement send and replay handlers with room fanout, ack semantics, and replay bounds
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 114-139)
* [x] Step 2.3: Add server integration tests for per-canvas isolation, replay ordering, and idempotency
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 140-159)
* [x] Step 2.4: Add chat observability instrumentation for send failures, ack latency, replay lag, and per-canvas volume
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 160-180)
* [x] Step 2.5: Validate phase changes
  * Run lint and build commands for modified files
  * Skip if validation conflicts with parallel phases

### [x] Implementation Phase 3: Client Networking and Chat UI

<!-- parallelizable: false -->

* [x] Step 3.1: Extend socket hook API with chat listeners and emit actions
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 187-209)
* [x] Step 3.2: Add chat state management and replay request flow in App-level orchestration
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 210-230)
* [x] Step 3.3: Implement chat panel UI component and integrate into existing layout
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 231-252)
* [x] Step 3.4: Add client tests for listener wiring and message rendering behavior
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Lines 253-272)
* [x] Step 3.5: Validate phase changes
  * Run lint and build commands for modified files
  * Skip if validation conflicts with parallel phases

### [x] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation
  * Execute all lint commands (`npm run lint`, language linters)
  * Execute build scripts for all modified components
  * Run test suites covering modified code
* [x] Step 4.2: Fix minor validation issues
  * Iterate on lint errors and build warnings
  * Apply fixes directly when corrections are straightforward
* [x] Step 4.3: Report blocking issues
  * Document issues requiring additional research
  * Provide user with next steps and recommended planning
  * Avoid large-scale fixes within this phase
* [x] Step 4.4: Validate scale-readiness assumptions
  * Confirm sticky-session ingress requirement is documented for multi-instance deployments
  * Confirm replay source-of-truth remains Postgres across adapter changes
  * Verify chat observability signals are available in test or smoke validation output

### [ ] Implementation Phase 5: Review-Driven Rework

<!-- parallelizable: false -->

* [x] Step 5.1: Correct server chat semantics for idempotency, error reasons, and retention enforcement
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Phase 5, Steps 5.1-5.2)
* [x] Step 5.2: Improve client replay continuity and user-visible chat error feedback
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Phase 5, Steps 5.3-5.4)
* [ ] Step 5.3: Replace descriptive chat tests with behavioral server and client test coverage
  * Details: .copilot-tracking/details/2026-07-23/canvas-chat-channel-implementation-details.md (Phase 5, Steps 5.5-5.6)
* [x] Step 5.4: Validate observability proof points and full project checks
  * Run lint/test/build commands for modified scopes
  * Confirm chat observability markers are asserted in test output

## Planning Log

See `.copilot-tracking/plans/logs/2026-07-23/canvas-chat-channel-implementation-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node.js workspace toolchain compatible with root and app-level package scripts
* Existing Socket.IO and Postgres adapter runtime in apps/server
* Drizzle schema and migration workflow used by server package
* Test harnesses in Vitest for client and server packages

## Success Criteria

* Per-canvas chat events are scoped and authorized to connected session identity — Traces to: user requirement for per-canvas channels
* Chat send and replay contracts are fully typed and used consistently by client and server — Traces to: contract-first architecture research
* Replay path provides ordered bounded history across reconnects — Traces to: reconnect gap finding in research
* Persistence model supports idempotent client retries and deterministic ordering — Traces to: Postgres strategy recommendation in research
* Constraint values for message size, replay limits, retention, and ack timing are defined before implementation and reflected in server behavior — Traces to: configuration guidance in research
* Observability signals exist for chat reliability and throughput behavior — Traces to: operational counter guidance in research
* Validation commands for changed scopes pass or produce documented blockers and next-step actions — Traces to: final validation phase requirement
