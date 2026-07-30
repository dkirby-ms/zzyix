<!-- markdownlint-disable-file -->
# Canonical Infinite Canvas Convergence Phase 2 Validation

## Status

**Partial**

Finding counts: **1 Critical, 1 Major, 1 Minor**.

Phase 2 discovery, automatic entry, strict protocol-V2 rejection, protected-state clearing,
runtime configuration parsing, CD propagation, and all prescribed focused checks are present
and passing. The Phase 2 canary contract is not fully represented in the current tree because
Phase 4 intentionally made canonical entry unconditional and removed the rollback lobby. The
current client entry flag therefore no longer provides an independent runtime entry gate.

## Phase 2 Requirements

The plan marks all three Phase 2 steps complete at
`.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md:74-87`.
The controlling details require:

1. Independent server-discovery and client-entry gates, a strict runtime JSON boolean,
	 fail-closed CD defaults, explicit propagation of discovery, entry, protocol-V2, and mutation
	 flags, and rejection of entry when protocol V2 is unavailable
	 (`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:230-260`).
2. Authenticated canonical discovery and automatic entry, compatibility-canvas socket identity
	 during the canary, mandatory protocol V2, controlled unavailable handling, complete protected
	 state clearing, no selected-session storage access, and lobby restoration when the entry gate
	 is disabled (`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:261-289`).
3. The five focused client, server, release-contract, lint, and build commands
	 (`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:290-299`).

The research independently defines Phase 2 as a canary with separate client and server flags,
protocol V2, and retained lobby/session code for immediate rollback
(`.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md:82-86`).

## Plan-to-Change Comparison

| Plan item | Changes-log claim | Verified current evidence | Assessment |
|-----------|-------------------|---------------------------|------------|
| Step 2.1 independent gates | CD flags, runtime JSON, discovery gate, and startup dependency validation are claimed at `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:52-73` | Server discovery is independently resolved at `apps/server/src/startup/rolloutGates.ts:46-48` and applied at `apps/server/src/index.ts:235,1658-1661`. The client boolean is parsed at `apps/client/src/config/runtimeConfig.ts:65-71` and exposed at `apps/client/src/auth/AuthSessionProvider.tsx:103-120`. It does not control discovery or entry in `apps/client/src/App.tsx:560-583` | Partial |
| Step 2.1 CD propagation | All four flags and fail-closed defaults are claimed at `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:52-54,73` | Defaults are explicit at `.github/workflows/cd.yml:272-275`; values are validated at `.github/workflows/cd.yml:363-379`; discovery reaches server create/update at `.github/workflows/cd.yml:595,613`; entry reaches client create/update at `.github/workflows/cd.yml:689,708`; Docker requires and emits the JSON boolean at `apps/client/Dockerfile:36-54`; release-contract assertions cover wiring at `scripts/release-contract.test.mjs:52-64,176-186` | Complete |
| Step 2.2 discovery and automatic entry | Discovery, automatic entry, unavailable state, rollback, V2 enforcement, and clearing are claimed at `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:55-72` | Authenticated discovery validates V2 at `apps/client/src/network/session.ts:38-51`; `App` enters automatically and maps failure to unavailable at `apps/client/src/App.tsx:560-583`; loading and unavailable UI are rendered at `apps/client/src/App.tsx:1825-1835` | Complete except rollback gate |
| Step 2.2 V2 and protected state | V2 rejection and protected-state clearing are claimed at `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:55-72` | The socket disconnects before callback on V1 or missing topology at `apps/client/src/network/useSocketConnection.ts:183-188`; `App` always requests strict V2 at `apps/client/src/App.tsx:1050-1078`; cache, cursors, collaborators, active chunks, and sequenced state are reset at `apps/client/src/App.tsx:539-558`; mismatch and authentication loss invoke that reset at `apps/client/src/App.tsx:721-734` | Complete implementation, partial focused coverage |
| Step 2.2 no selected-session storage | Canonical discovery without selected-session access is claimed at `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:67` | Canonical discovery performs only authenticated HTTP and descriptor validation at `apps/client/src/network/session.ts:38-51`; the only remaining local storage in that module is the unrelated stable client ID at `apps/client/src/network/session.ts:90-97`; tests assert no session-storage calls at `apps/client/src/App.test.tsx:288-337,390-400` | Complete |
| Step 2.3 focused validation | Client/server tests, release checks, lint, and build are claimed in the release summary at `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:154-159` | All five prescribed commands were rerun during this validation and passed | Complete |

## Findings

### Critical

1. The client entry flag is not an independent runtime gate in the current implementation.
	 `canonicalEntryEnabled` reaches authenticated state at
	 `apps/client/src/auth/AuthSessionProvider.tsx:103-120`, but the discovery effect always clears
	 state and calls canonical discovery without consulting it at `apps/client/src/App.tsx:560-583`.
	 The flag only hides or shows patch-navigation controls at `apps/client/src/App.tsx:1862-1863`.
	 The test setup defaults the flag to false at `apps/client/src/App.test.tsx:254`, yet the reload
	 test still expects canonical discovery and entry at `apps/client/src/App.test.tsx:390-400`.
	 This fails the Phase 2 requirement that operators can disable client entry independently and
	 restore the temporary lobby. The changes log explains that Phase 4 deliberately made entry
	 unconditional and removed the rollback lobby at
	 `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:108-109`.
	 That later planned supersession is valid for final cutover, but it prevents the current tree
	 from passing the Phase 2 canary criterion against actual code.

### Major

1. Server startup no longer validates canonical gate combinations as Step 2.1 and the changes log
	 claim. `validateProductionRolloutGates` checks operational approvals, mutation approvals, and
	 retirement evidence at `apps/server/src/startup/rolloutGates.ts:5-43`; canonical handling is
	 limited to independently parsing the discovery flag at
	 `apps/server/src/startup/rolloutGates.ts:46-48`. The corresponding test proves only discovery
	 independence at `apps/server/src/startup/rolloutGates.test.ts:126-133`, not invalid canonical
	 production combinations. CD does reject entry enabled without protocol V2 at
	 `.github/workflows/cd.yml:376-379`, so the supported workflow fails closed, but direct startup
	 configuration lacks the planned dependency validation and the changes-log claim at
	 `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:71-72`
	 is not true of the current file.

### Minor

1. Focused tests do not directly prove that every named protected store is cleared on each
	 terminal Phase 2 failure. The implementation explicitly resets quilt cache, cursors,
	 subscribed chunks, active chunks, collaborators, and sequenced state at
	 `apps/client/src/App.tsx:539-558`. The V1 test checks only unavailable UI and a null socket input
	 at `apps/client/src/App.test.tsx:415-427`; the authentication-loss test populates collaborators
	 but not quilt cache, cursors, or active chunks before asserting unmount at
	 `apps/client/src/App.test.tsx:429-487`. This is a focused regression-test gap, not an observed
	 state-retention defect.

## Coverage

Phase 2 coverage is **partial (approximately 85%)**.

Verified complete:

* Independent fail-closed server discovery gate
* Strict runtime boolean parsing and Docker JSON emission
* Explicit CD defaults, value validation, dependency check, and server/client propagation
* Authenticated canonical discovery and automatic controlled entry
* Descriptor-level and socket-negotiation protocol-V2 enforcement
* Controlled unavailable state for discovery and protocol failures
* Protected cache, cursor, collaborator, active-chunk, and sequenced-state clearing in code
* No legacy selected-session storage access on canonical entry
* All five prescribed focused validation commands

Not complete in the current tree:

* Independent client-entry disable behavior and temporary lobby rollback, intentionally superseded by Phase 4
* Server-startup validation and tests for canonical gate dependency combinations
* Direct focused assertions for every protected store on terminal failure

The Phase 2 compatibility-canvas handshake is also absent because the planned Phase 4 migration
now sends durable quilt identity at `apps/client/src/network/useSocketConnection.ts:63-88`.
This is an explicitly planned supersession, not a Phase 2 defect in the final product state.

## Focused Check Results

| Command | Result |
|---------|--------|
| `npm exec --workspace=apps/client -- vitest run src/network src/App.test.tsx` | Passed: 5 files, 43 passed, 8 skipped |
| `npm exec --workspace=apps/server -- vitest run src/startup/rolloutGates.test.ts src/migration/quiltRollout.test.ts` | Passed: 2 files, 15 passed |
| `npm run test:release-contract` | Passed: 9 tests |
| `npm run lint:client` | Passed |
| `npm run build:client` | Passed with the existing Vite chunk-size warning |

## Recommended Next Validations

* Validate Phase 4 to confirm that unconditional entry, rollback-lobby removal, and quilt-ID socket
	identity satisfy their measured promotion prerequisites. This determines whether the Critical
	Phase 2 finding is fully discharged by a valid later-phase transition.
* Add a startup-level canonical dependency test if server startup is still expected to reject
	invalid discovery, entry, and protocol combinations outside the CD workflow.
* Add focused failure tests that populate and then inspect quilt cache, cursor, active-chunk,
	collaborator, and sequenced state for descriptor failure, V1 negotiation, and terminal auth loss.
* Validate the authenticated server discovery integration tests separately; they are Phase 1
	evidence and were outside the prescribed Phase 2 command set rerun here.

## Clarifying Questions

* Should a phase validation grade the historical canary state before Phase 4, or the net current
	tree after intentional Phase 4 retirement? This validation uses the requested actual-code basis
	and therefore records the removed client gate as a Critical Phase 2 gap while recognizing its
	explicit later-phase supersession.
* Is the CD-only entry-to-V2 dependency check now the intended control, or must
	`validateProductionRolloutGates` continue to enforce the same dependency at server startup?
