<!-- markdownlint-disable-file -->
# Planning Log: Canvas Chat Channel Implementation

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None at this time.

### Plan Deviations from Research

* None at this time.

### Implementation Deviations

* DD-01: Idempotent send retries rebroadcast chat events
  * Plan specifies: idempotent retry should avoid duplicate visible events
  * Implementation differs: server emits `chat_message` even when persistence reports idempotent match
  * Rationale: initial implementation acknowledged idempotency but did not gate room fanout
  * Status: Resolved in Phase 5 (`apps/server/src/index.ts` gates fanout on `!result.idempotent`)

* DD-02: Chat replay continuity is one-shot and connection-timing dependent
  * Plan specifies: reconnect-safe replay continuity with bounded replay behavior
  * Implementation differs: replay requested on session change only and does not continue paging with `hasMore`
  * Rationale: initial implementation targeted baseline replay event wiring first
  * Status: Resolved in Phase 5 (`apps/client/src/App.tsx` adds replay continuation and deferred reconnect recovery)

* DD-03: Chat-specific tests are descriptive instead of behavioral
  * Plan specifies: server/client tests should verify behavior for isolation, idempotency, replay ordering, and listener/UI wiring
  * Implementation differs: several tests assert local objects/comments instead of runtime socket/app behavior
  * Rationale: test depth was intentionally deferred, but plan checklist was marked complete
  * Status: Partially resolved in Phase 5 (client chat tests added; server placeholders replaced with executable behavioral assertions; full live socket-backed multi-client integration remains pending)

## Implementation Paths Considered

### Selected: Socket.IO Room-Based Custom Chat with Postgres Replay

* Approach: Extend current contract and server handlers to support send and replay events, persist messages in Postgres with ordered sequence and idempotency constraints, and integrate chat UI through existing client hook and App state.
* Rationale: Maximizes architectural continuity, satisfies per-canvas isolation requirement, and addresses reconnect gaps with minimal infrastructure change.
* Evidence: .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md (Lines 126-200)

### IP-01: UI-Kit-First Approach on Existing Backend

* Approach: Use @chatscope/chat-ui-kit-react or react-chat-elements for message list/composer while implementing custom backend events and storage.
* Trade-offs: Faster UI delivery and polished chat widgets, but additional dependency surface and potential theming mismatch.
* Rejection rationale: Deferred, not rejected permanently; planned after baseline custom flow if UX delivery velocity becomes a bottleneck.

### IP-02: Socket.IO-Adjacent Framework Migration (Feathers or Nest Gateways)

* Approach: Introduce framework service/gateway layer and migrate current server behavior around framework abstractions.
* Trade-offs: Better long-term structure and ecosystem tooling, but medium-high migration cost and slower delivery for immediate chat scope.
* Rejection rationale: Does not meet near-term requirement for practical reuse with low disruption.

### IP-03: Managed Chat Backend (Stream or Sendbird)

* Approach: Replace or bypass existing backend chat contract with SaaS chat SDK and API stack.
* Trade-offs: Fast feature depth and hosted operations, but backend/data model lock-in and architecture replacement.
* Rejection rationale: Conflicts with requirement to reuse existing WSS and Socket.IO approach.

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Add moderation and policy controls — Implement profanity filtering, block/report actions, and message retention policy enforcement (high)
  * Source: .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md
  * Dependency: Baseline chat persistence and replay implementation complete
* WI-02: Add typing indicators and read receipts with multi-replica-safe presence model — Introduce distributed presence bookkeeping and delivery-state semantics (medium)
  * Source: .copilot-tracking/research/subagents/2026-07-23/codebase-chat-integration-research.md
  * Dependency: Baseline chat channel and replay features stable
* WI-03: Evaluate UI kit acceleration spike — Time-boxed comparison of custom ChatPanel vs @chatscope/chat-ui-kit-react for productivity and UX fit (low)
  * Source: .copilot-tracking/research/subagents/2026-07-23/chat-library-options-research.md
  * Dependency: Baseline custom UI implementation complete
* WI-04: Add moderation and abuse controls for chat send path (high)
  * Source: review recommendation
  * Dependency: review-driven rework phase completion
* WI-05: Add explicit observability export path (metrics backend or structured log contract) (medium)
  * Source: review recommendation
  * Dependency: behavioral observability assertions in tests
* WI-06: Add true socket-backed server chat integration harness tests (high)
  * Source: Phase 5 implementation gap
  * Dependency: agreement on test harness shape for Socket.IO server/client runtime in apps/server/src/index.integration.test.ts
