<!-- markdownlint-disable-file -->
# Planning Log: Lobby Screen for Canvas Discovery and Join

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

None.

### Plan Deviations from Research

* DD-01: Client phase validation executed with package-local commands instead of root workspace filter commands
  * Plan specifies: Run `pnpm --filter client ...` validation commands from root
  * Implementation differs: Ran `corepack pnpm ...` inside `apps/client`
  * Rationale: repository has no `pnpm-workspace.yaml`, so root filter selection returns no matching project

* DD-02: Client build remains blocked by pre-existing render layer TypeScript errors
  * Plan specifies: Validate client build in Phase 1 validation step
  * Implementation differs: Validation run completed with known non-phase blockers remaining
  * Rationale: errors are outside lobby scope and predate phase implementation

* DD-03: Server and full validation commands were executed with npm workspace mappings
  * Plan specifies: Run pnpm-based validation commands (`pnpm --filter server ...` and `pnpm lint/test`)
  * Implementation differs: Ran npm workspace equivalents from repository root
  * Rationale: `pnpm` binary is unavailable in environment; npm workspace scripts are functionally equivalent for current package setup

* DD-04: Workspace test command with forwarded `--run` emits npm warning
  * Plan specifies: Execute workspace tests as part of full validation
  * Implementation differs: `npm run test -- --run` is accepted but npm prints `Unknown cli config "--run"` warning
  * Rationale: npm forwards unknown flag while workspace package tests still execute successfully

## Implementation Paths Considered

### Selected: In-app mode switch with explicit join

* Approach: Add lobby and canvas modes in existing app shell, fetch session summaries via REST, and set `sessionId` only on explicit join/create
* Rationale: Smallest safe change that reuses existing socket/session architecture
* Evidence: .copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md (Lines 137-141, 224-236)

### IP-01: Full page split with dedicated `LobbyPage` and `CanvasPage`

* Approach: Refactor app into separate pages before adding lobby behavior
* Trade-offs: Better long-term separation but larger immediate refactor and higher regression risk
* Rejection rationale: Not needed for V1 scope and delays deliverable

### IP-02: Socket-first realtime lobby list

* Approach: Drive lobby discovery list over websocket events rather than initial REST pull
* Trade-offs: Better freshness, but higher complexity and broader server protocol changes
* Rejection rationale: Exceeds first-delivery needs; periodic or manual refresh is sufficient

## Suggested Follow-On Work

* WI-01: Persistent canvas naming migration — Add `canvases.name` schema/migration after production schema verification (medium)
  * Source: DR-01, research migration guidance
  * Dependency: Runtime DB validation complete
* WI-02: Auto-resume entry policy — Decide and implement auto-resume/last-session behavior from lobby (medium)
  * Source: DR-02
  * Dependency: Product UX decision
* WI-03: Realtime lobby freshness — Add websocket-driven lobby updates and stale-list handling (low)
  * Source: IP-02 trade-off
  * Dependency: Base lobby flow stabilized
* WI-04: Workspace script alignment — Add root `pnpm-workspace.yaml` or update plan validation command conventions (low)
  * Source: DD-01
  * Dependency: Decision on monorepo package manager configuration
* WI-05: Render TypeScript cleanup — Resolve `three` type declarations and shader parameter typing for client build stability (medium)
  * Source: DD-02
  * Dependency: Follow-up scope for render module maintenance
* WI-06: Route-level list endpoint test harness — Add HTTP-level tests for `GET /sessions` response serialization (low)
  * Source: Phase 2 implementation recommendation
  * Dependency: lightweight request harness pattern selection for existing server test architecture
