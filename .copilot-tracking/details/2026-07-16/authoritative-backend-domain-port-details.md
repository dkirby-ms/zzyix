<!-- markdownlint-disable-file -->
# Implementation Details: Authoritative Backend Domain Port

## Context Reference

Sources: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md, GitHub issue #9 context attachment.

## Implementation Phase 1: Port Domain Engine to Server

<!-- parallelizable: false -->

### Step 1.1: Copy and adapt domain modules into the server domain folder

Port pure TypeScript domain modules from client to server to establish authoritative validation logic without introducing workspace-wide package restructuring in this issue.

Files:
* apps/server/src/domain/math2d.ts - Server-side vector and geometry primitives
* apps/server/src/domain/tileGeometry.ts - Server-side shape decomposition and transform logic
* apps/server/src/domain/placementSolver.ts - Server-side placement validation and bounds checks

Discrepancy references:
* None currently open in .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md.

Success criteria:
* apps/server/src/domain contains the three ported modules with compiling imports and types.
* validatePlacement() is exported from apps/server/src/domain/placementSolver.ts with behavior parity to client rules.

Context references:
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 60-65) - Domain module inventory and portability findings
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 193-204) - Server-local port selected approach details

Dependencies:
* Existing client domain modules available as source of truth
* Server TypeScript build pipeline in apps/server/package.json

### Step 1.2: Add server parity tests for placement validation behavior

Create tests in server scope that mirror critical placement validation cases currently covered on client side to reduce domain drift risk after the port.

Files:
* apps/server/src/domain/placementSolver.port.test.ts - Parity-focused server tests for overlap and out-of-bounds rejection

Discrepancy references:
* None currently open in .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md.

Success criteria:
* Server parity tests fail when placement solver behavior diverges from expected overlap and bounds outcomes.
* Server parity tests pass with the ported domain implementation.

Context references:
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 243-243) - Parity tests included in selected implementation sequence
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 322-323) - Client-side overlap and bounds test references

Dependencies:
* Step 1.1 completion

### Step 1.3: Validate phase changes

Run phase-scoped validation for server-only domain and test additions.

Validation commands:
* npm --prefix apps/server run lint - Lint scope for server package files touched in this phase
* npm --prefix apps/server run test -- placementSolver.port - Targeted parity test execution

## Implementation Phase 2: Enforce Authoritative Mutation Rules in Handlers

<!-- parallelizable: false -->

### Step 2.1: Introduce authoritative per-session state with deterministic sequencing

Create or update server state management so each session has canonical tiles, timestamps, and a monotonic operation sequence used to formalize first-write-wins ordering.

Files:
* apps/server/src/index.ts - Session map structure and operation sequencing integration
* apps/server/src/sessionState.ts - Optional extraction of state helpers for readability and testability

Discrepancy references:
* None currently open in .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md.

Success criteria:
* Each mutating operation obtains deterministic order through per-session sequence increment.
* Session state is the sole source for authoritative tile reads and writes.

Context references:
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 231-233) - Authoritative session state introduction in selected implementation
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 247-250) - Monotonic op sequence function example
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 295-297) - Deterministic sequencing and mutation order behavior

Dependencies:
* Implementation Phase 1 completion

### Step 2.2: Wire place_tile validation and broadcast-after-mutation semantics

Update place_tile to validate with validatePlacement() against authoritative server tiles, reject invalid payloads with deterministic reasons from a required finite reason set, and emit tile_placed only after successful mutation.

Files:
* apps/server/src/index.ts - place_tile handler logic, deterministic reject reason mapping, and event emission ordering
* apps/server/src/contracts.ts - Required reject reason enum/type and deterministic reason schema
* apps/server/src/index.test.ts - Deterministic reject reason mapping tests for invalid placement paths

Discrepancy references:
* None currently open in .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md.

Success criteria:
* place_tile rejects invalid placements with rejected:true and a reason value from the closed contract-defined reason set.
* place_tile acks accepted placements with a server-generated authoritative tile id.
* tile_placed is emitted only after state mutation succeeds.
* Tests assert deterministic reason mapping for each invalid placement class.

Context references:
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 23-26) - Deterministic reject semantics in success criteria
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 164-167) - Place/remove ack contract semantics for rejection and idempotency
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 233-237) - Placement validation and successful post-mutation broadcast order

Dependencies:
* Step 2.1 completion

### Step 2.3: Enforce tile ID validation and remove_tile idempotent behavior

Apply strict tile ID validation policy for authoritative operations and ensure remove_tile returns removed:false for unknown IDs while only broadcasting tile_removed on successful mutation.

Files:
* apps/server/src/index.ts - remove_tile validation and idempotent response behavior
* apps/server/src/contracts.ts - Optional tile id policy documentation update if runtime policy is codified via schema/type comments

Discrepancy references:
* None currently open in .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md.

Success criteria:
* remove_tile rejects malformed tile IDs deterministically.
* remove_tile returns removed:false for well-formed but unknown IDs.
* tile_removed is emitted only for successful authoritative removals.

Context references:
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 39-41) - Tile ID policy decision requirement
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 166-167) - Remove ack idempotent semantics
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 238-241) - Remove handler validation and broadcast-only-on-success guidance

Dependencies:
* Step 2.2 completion

### Step 2.4: Validate phase changes

Run server tests that cover authoritative mutation and tile id validation behavior.

Validation commands:
* npm --prefix apps/server run test -- index - Handler behavior tests
* npm --prefix apps/server run test -- concurrency - Deterministic conflict tests if introduced by this phase

## Implementation Phase 3: Reconciliation and Concurrency Validation

<!-- parallelizable: false -->

### Step 3.1: Ensure authoritative snapshot/reconnect behavior is sourced from server state

Guarantee that initial and reconnect snapshot events are always generated from canonical session state so clients can reconcile consistently after rejection or dropped operations.

Files:
* apps/server/src/index.ts - connect/reconnect snapshot emission flow
* apps/server/src/index.integration.test.ts - Snapshot reconciliation behavior tests

Discrepancy references:
* None currently open in .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md.

Success criteria:
* Session snapshot payload always reflects current authoritative server tiles.
* Reconnecting clients converge to canonical state from snapshot without client-side authority assumptions.

Context references:
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 242-243) - Snapshot emission from authoritative state
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 226-227) - Client reconciliation path after reject and snapshot

Dependencies:
* Implementation Phase 2 completion

### Step 3.2: Add deterministic concurrency matrix tests for conflicting operations

Implement tests for place/place conflict ordering, non-conflicting placements, remove/remove idempotency, and place/remove sequence ordering to prove deterministic first-write-wins behavior.

Files:
* apps/server/src/index.concurrency.test.ts - Conflict and convergence test matrix

Discrepancy references:
* None currently open in .copilot-tracking/plans/logs/2026-07-16/authoritative-backend-domain-port-log.md.

Success criteria:
* Test matrix covers at least the four conflict scenarios identified in research.
* Repeated test runs produce stable outcomes with no nondeterministic failures.

Context references:
* .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 285-291) - Concurrency test matrix recommendations

Dependencies:
* Step 3.1 completion

### Step 3.3: Validate phase changes

Run focused integration and concurrency tests for reconciliation and ordering.

Validation commands:
* npm --prefix apps/server run test -- index.integration - Snapshot/reconciliation validation
* npm --prefix apps/server run test -- index.concurrency - Deterministic ordering validation

## Implementation Phase 4: Validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute complete validation commands covering lint, build, and tests for all modified areas.

* npm --prefix apps/server run lint
* npm --prefix apps/server run test
* npm --prefix apps/server run build

### Step 4.2: Fix minor validation issues

Iterate on small lint/test/build issues directly related to this scope without expanding into architectural refactors.

### Step 4.3: Report blocking issues

If validation fails due to out-of-scope architectural concerns (for example persistence/history storage design), document blockers and propose follow-on planning.

## Dependencies

* Node.js toolchain compatible with apps/server package scripts
* Existing socket transport and contracts in apps/server/src/contracts.ts

## Success Criteria

* Server runtime enforces authoritative placement validation and state ownership.
* Deterministic conflict handling is implemented and validated by server tests.
* Clients can reconcile from server responses and authoritative snapshots consistently.
