<!-- markdownlint-disable-file -->
# Release Changes: Lobby Screen for Canvas Discovery and Join

**Related Plan**: .copilot-tracking/plans/2026-07-17/lobby-screen-canvas-discovery-join-plan.instructions.md
**Implementation Date**: 2026-07-17

## Summary

Implemented remediation updates to close review critical/major findings for lobby-first discovery/join while preserving existing behavior.

## Changes

### Added

* apps/client/src/ui/LobbyScreen.tsx - Added lobby discovery UI with canvas metadata, explicit join actions, create canvas action, and loading/error states
* apps/client/src/App.test.tsx - Added client regression tests for lobby-first behavior and explicit join/create transitions

### Modified

* apps/client/src/App.tsx - Fixed compile blocker related to declaration order around snapshot helper while preserving lobby-first mode flow
* apps/client/src/network/useSocketConnection.ts - Added optional action-ref wiring to support stable snapshot callback usage from App without declaration-order regressions
* apps/client/src/network/session.ts - Added session list/create API utilities and session storage accessor helpers for lobby flow
* apps/client/src/App.css - Added lobby layout and responsive styles for session list rendering
* apps/server/src/index.ts - Updated HTTP CORS handling to validate request `Origin` against configured allow-list; replaced direct socket auth console logs with structured `writeLog` calls and redacted metadata
* apps/server/src/contracts.ts - Corrected create-session response shape to match implementation and removed stale unsupported REST route comments
* apps/server/src/db/repository.ts - Added session summary query helper with active participant counts for lobby list metadata
* apps/server/src/index.test.ts - Extended server unit assertions for multi-origin CORS configuration parsing
* apps/server/src/index.integration.test.ts - Added metadata mapping assertions to protect participant count and `canvasSize` semantics

### Removed

## Additional or Deviating Changes

* Used package-local validation commands in apps/client with corepack pnpm instead of root `pnpm --filter client ...`
	* Reason: workspace lacks pnpm-workspace.yaml, so root filter commands do not resolve project selectors
* Client build currently blocked by pre-existing TypeScript errors outside this phase scope
	* Reason: `three` typing issues in render layer files (apps/client/src/render/MosaicScene.tsx and apps/client/src/render/materials.ts)
* Root validation command `npm run test -- --run` forwards `--run` to npm and emits a warning
	* Reason: npm workspaces do not consume this flag directly, but package-level test scripts still executed successfully
* Server and full validation used npm workspace equivalents instead of pnpm commands
	* Reason: `pnpm` is unavailable in environment; used `npm run <script> --workspace=<pkg>` mapping for equivalent validation execution

## Release Summary

Implemented a lobby-first join flow across client and server layers with explicit discovery and canvas selection before websocket participation.

Files affected:
* Added: 2
* Modified: 8
* Removed: 0

Validation outcomes:
* Client lint: pass
* Client tests: pass
* Client build: blocked by pre-existing render typings outside this scope (`apps/client/src/render/MosaicScene.tsx`, `apps/client/src/render/materials.ts`)
* Server lint: pass
* Server tests: pass
* Server build: pass
* Workspace lint/test: pass using npm workspace command equivalents (`npm run test -- --run` emits npm CLI warning only)

Deployment and dependency notes:
* No schema migration introduced in V1; fallback canvas display naming retained by design
* No infrastructure or runtime configuration changes required for this feature slice
