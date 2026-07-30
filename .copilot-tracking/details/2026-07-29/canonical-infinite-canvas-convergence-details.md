<!-- markdownlint-disable-file -->

# Implementation Details: Canonical Infinite Canvas Convergence

## Context Reference

Sources:

* User direction in the 2026-07-29 conversation: the infinite canvas is the only important product experience; legacy content does not require support
* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* `.copilot-tracking/research/subagents/2026-07-29/canonical-infinite-canvas-convergence-planning-research.md`
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`

## Implementation Phase 0: Fix the Canonical Product Contract

<!-- parallelizable: false -->

### Step 0.1: Amend the tenancy decision

Revise the accepted finite-toroidal-quilt ADR so the supported product has one canonical
protocol-V2 toroidal quilt. State that user-created canvases, legacy content access, import,
and archive UX are outside the product contract. Retain additive legacy database records only
as inert implementation residue until normal retention permits deletion.

Files:

* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Replace the multiple-community-quilt decision with the canonical product tenancy contract

Discrepancy references:

* DD-01

Success criteria:

* The ADR no longer rejects a product-level canonical quilt
* The ADR distinguishes temporary technical rollback from legacy product support

Context references:

* `.copilot-tracking/research/subagents/2026-07-29/canonical-infinite-canvas-convergence-planning-research.md` - The accepted ADR conflicts with the requested tenancy model

Dependencies:

* Product approval that the finite torus is the accepted infinite-canvas model

### Step 0.2: Resolve immutable world and interaction values

Record the topology dimensions, whether to adopt or provision the target quilt, root entry
location, durable deep-link identity, eligible-patch discovery rules, claim navigation, and
ownership quota. Preserve the existing global claim-rate windows unless product evidence
requires a separate change.

Files:

* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Record immutable topology and product interaction decisions

Success criteria:

* Row count, column count, patch width, and patch height have explicit production values
* Root entry and deep-link contracts use durable quilt or patch identity
* Eligible-patch ordering and one-active-patch-per-principal behavior are unambiguous

Dependencies:

* Step 0.1 completion
* Production quilt inventory and capacity estimate

## Implementation Phase 1: Build the Canonical Control Plane

<!-- parallelizable: false -->

### Step 1.1: Add the canonical pointer schema and migration

Add an expand-only singleton pointer keyed by the literal product key `canonical` and
referencing the target quilt. Derive the compatibility canvas ID through
`quilts.legacy_canvas_id` to avoid two writable references. Support `inactive` and `active`
states and a positive compare-and-set generation. An absent pointer has conceptual generation
0; initial activation writes 1; target or status changes require the exact generation and
increment it; idempotent replay does not increment. Update Drizzle metadata and extend
migration rehearsal for fresh, upgraded, repeated-select, inactive-pointer, stale-generation,
and routing-rollback states. Do not add reverse migration SQL.

Files:

* `apps/server/src/db/schema.ts` - Define the singleton pointer table and constraints
* `apps/server/migrations/0007_canonical_world.sql` - Add the expand-only schema
* `apps/server/migrations/meta/_journal.json` - Register the migration
* `apps/server/migrations/meta/0007_snapshot.json` - Record the generated schema snapshot
* `apps/server/src/db/schema.test.ts` - Verify pointer constraints and indexes
* `apps/server/src/db/migrate.test.ts` - Verify migration-count compatibility
* `scripts/verify-quilt-migration.sh` - Rehearse pointer upgrade, idempotency, and forward rollback

Discrepancy references:

* DD-02

Success criteria:

* At most one active canonical pointer exists for the stable product key
* Pointer activation cannot target a missing quilt
* Rollback deactivates or ignores the pointer without dropping schema or data

Dependencies:

* Phase 0 completion
* Disposable loopback PostgreSQL

### Step 1.2: Implement validated selection and discovery

Add repository operations that validate protocol V2, toroidal topology, exact address-grid
completeness, valid patch lifecycle states, exactly one persisted visibility policy per
patch, authenticated baseline visibility, claim enablement, lifecycle state, and
compatibility alias consistency in one repeatable transaction. Add an explicit idempotent
operator command under a PostgreSQL advisory lock. Its `provision` action requires expected
generation 0 plus rows, columns, patch dimensions, origin, operator ID, and reason. In one
transaction it creates a compatibility canvas, protocol-V2 toroidal quilt, every row-major
unclaimed patch, one authenticated claim-enabled policy per patch, and an inactive
generation-1 pointer. Exact retries return persisted random UUIDs without writes; mismatched
geometry, policy, status, or generation fails without repair. Activation is a separate CAS
from generation 1 to 2. Expose authenticated, side-effect-free
`GET /quilts/canonical`; return HTTP 503, `Retry-After: 30`, and
`canonical_world_unavailable` for a missing or invalid target. The success descriptor returns
quilt ID, derived compatibility canvas ID, topology, generation, and an initial patch ID plus
row and column.

Files:

* `apps/server/src/contracts.ts` - Define the canonical descriptor and unavailable error contract
* `apps/server/src/db/repository.ts` - Load, validate, activate, and discover the canonical target
* `apps/server/src/index.ts` - Expose the authenticated canonical discovery route
* `apps/server/src/cli/selectCanonicalWorld.ts` - Provide explicit idempotent target selection or provisioning
* `apps/server/package.json` - Expose the operator command
* `apps/server/src/contracts.test.ts` - Verify descriptor serialization
* `apps/server/src/index.integration.test.ts` - Verify authentication and unavailable mapping
* `apps/server/src/db/canonicalWorld.postgres.integration.test.ts` - Verify validation, concurrency, generation, and restart stability
* `apps/server/src/cli/selectCanonicalWorld.test.ts` - Verify command parsing and idempotent outcomes
* `package.json` - Expose `db:canonical-world` after building the server and loading root `.env`

Success criteria:

* Discovery returns exactly one fully validated canonical descriptor to an authenticated principal
* Missing, inactive, stale, incomplete, or protocol-V1 targets fail closed
* Concurrent selection produces one deterministic active generation
* No user GET creates or mutates the canonical world
* `status`, `provision`, `activate`, and `deactivate` CLI actions validate arguments before opening a transaction
* CLI success and idempotent replay write one versioned JSON result to stdout and exit 0; usage, generation conflict, invalid target, and database failures write one safe JSON error to stderr and exit 1

Dependencies:

* Step 1.1 completion
* Step 0.2 target and initial-location decisions

Operator command contract:

```text
npm run db:canonical-world -- --action status
npm run db:canonical-world -- --action provision --expected-generation 0 --patch-rows <integer> --patch-columns <integer> --patch-width <number> --patch-height <number> --origin-x <number> --origin-y <number> --operator-id <text> --reason <text>
npm run db:canonical-world -- --action activate --quilt-id <uuid> --expected-generation <integer> --operator-id <text> --reason <text>
npm run db:canonical-world -- --action deactivate --expected-generation <integer> --operator-id <text> --reason <text>
```

Reject unknown, duplicate, missing, empty, and action-incompatible arguments before opening
the database. Rows and columns are positive safe integers; patch dimensions are positive
finite numbers; origins are finite; provision requires expected generation 0. Reject an
invalid quilt UUID and every negative, fractional, nonnumeric, unsafe, or missing generation.
Acquire
`pg_advisory_xact_lock(hashtext('canonical-world'), hashtext('canonical'))` before reading
the pointer. Provision atomically creates an unbounded compatibility canvas sized to the
complete quilt, the quilt, every row-major patch, every baseline policy, and the inactive
pointer. It creates no principal, membership, tile, operation, snapshot, spatial-reference,
or presence row. Replay is idempotent only for an inactive generation-1 pointer whose
validated geometry and policies exactly match; active, mismatched, invalid, or
other-generation targets conflict. Always close the database bundle in `finally`.

Machine output is one JSON object. Success includes `schemaVersion: 1`, action, result
(`succeeded` or `idempotent`), idempotent boolean, product key, pointer status, generation,
quilt ID, compatibility canvas ID, topology, protocol version, dimensions, origin, patch
count, initial patch ID/address, and policy version. Failure writes only `schemaVersion: 1`,
parsed action when available, `result: failed`, safe message, and one of `usage_error`,
`generation_conflict`, `target_invalid`, or `database_error`; never include SQL, stack, or
connection details. Exit 0 for status, success, and replay; otherwise set exit code 1.

Provision success and replay use this fixed shape (values reflect supplied geometry):

```json
{
	"schemaVersion": 1,
	"action": "provision",
	"result": "succeeded",
	"idempotent": false,
	"productKey": "canonical",
	"pointerStatus": "inactive",
	"generation": 1,
	"quilt": {
		"id": "<uuid>",
		"legacyCanvasId": "<uuid>",
		"topology": "toroidal",
		"protocolVersion": 2,
		"patchRows": 1,
		"patchColumns": 1,
		"patchWidth": 1,
		"patchHeight": 1,
		"originX": 0,
		"originY": 0
	},
	"patchCount": 1,
	"initialPatch": { "id": "<uuid>", "row": 0, "column": 0 },
	"policyVersion": 1
}
```

Replay changes only `result` to `idempotent` and `idempotent` to true. Status and mutation
actions retain the same top-level version, action, result, product-key, status, and generation
vocabulary. Errors have the exact safe fields already listed and no extra properties.

### Step 1.3: Validate the control plane

Validation commands:

* `npm exec --workspace=apps/server -- vitest run src/contracts.test.ts src/index.integration.test.ts src/db/schema.test.ts src/cli/selectCanonicalWorld.test.ts`
* `TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm exec --workspace=apps/server -- vitest run src/db/canonicalWorld.postgres.integration.test.ts`
* `npm run lint:server`
* `npm run build:server`
* `./scripts/verify-quilt-migration.sh rehearse`

## Implementation Phase 2: Make Canonical Entry the Product Entry

<!-- parallelizable: false -->

### Step 2.1: Add independent rollout gates and deployment propagation

Add a server discovery gate and a client entry gate independent from protocol mutation.
Extend the existing runtime JSON parser so entry can be disabled without building another
image. Require a real JSON boolean and reject absent, string-valued, or unresolved values.
Generate the value in the client Docker entrypoint and propagate canonical discovery,
canonical entry, protocol-V2 enablement, and mutation flags through CD with fail-closed
defaults and release-contract tests.

Files:

* `apps/server/src/startup/rolloutGates.ts` - Validate canonical startup dependencies
* `apps/server/src/startup/rolloutGates.test.ts` - Cover invalid production combinations
* `apps/client/src/config/runtimeConfig.ts` - Parse the runtime canonical-entry boolean
* `apps/client/src/config/runtimeConfig.test.ts` - Reject missing and mistyped values
* `apps/client/public/auth-config.json` - Set the deterministic development value
* `apps/client/public/auth-config.template.json` - Document the deployment value
* `apps/client/Dockerfile` - Require and emit `FEATURE_CANONICAL_ENTRY_ENABLED` with `jq --argjson`
* `.github/workflows/cd.yml` - Propagate server and client canonical flags
* `scripts/release-contract.test.mjs` - Verify deployment flag wiring and defaults

Success criteria:

* Operators can disable client entry and server discovery independently
* Canonical entry cannot be enabled while protocol V2 is unavailable
* Deployment artifacts carry every required gate explicitly

Dependencies:

* Phase 1 completion

### Step 2.2: Replace lobby startup with canonical discovery

After authentication, discover the canonical descriptor and enter automatically. Continue
using the derived compatibility canvas ID for the existing socket handshake during this
phase, but require the negotiated protocol to be V2. A V1 response or unavailable descriptor
must clear protected world state and show a controlled unavailable state. Do not read or
write the legacy selected-session key on canonical entry.

Files:

* `apps/client/src/network/session.ts` - Add authenticated canonical discovery and stop canonical writes to session storage
* `apps/client/src/network/useSocketConnection.ts` - Reject protocol fallback when canonical V2 is expected
* `apps/client/src/App.tsx` - Drive authenticated discovery, automatic entry, loading, unavailable, and rollback states
* `apps/client/src/App.test.tsx` - Cover root entry, reload, authentication transitions, unavailable target, V1 rejection, and gate rollback
* `apps/client/src/network/useSocketConnection.test.ts` - Verify expected-V2 negotiation failure
* `apps/client/src/network/canonicalWorld.test.ts` - Verify discovery mapping and errors

Success criteria:

* Supported users do not select or create canvases
* Canonical entry never silently enters protocol V1
* Terminal authentication or descriptor failure removes protected cache, cursors, collaborators, active chunks, and sequenced state
* Disabling the entry gate restores the temporary lobby during canary without moving canonical writes

Dependencies:

* Step 2.1 completion
* Phase 1 descriptor contract

### Step 2.3: Validate canonical entry

Validation commands:

* `npm exec --workspace=apps/client -- vitest run src/network src/App.test.tsx`
* `npm exec --workspace=apps/server -- vitest run src/startup/rolloutGates.test.ts src/migration/quiltRollout.test.ts`
* `npm run test:release-contract`
* `npm run lint:client`
* `npm run build:client`

## Implementation Phase 3: Harden Runtime and Complete Canonical UX

<!-- parallelizable: false -->

### Step 3.1: Make reconnect and presence replica-correct

Add bounded ordinary transport reconnection, token renewal, a connection epoch that forces
cursor-based visible-room resubscription, and canonical rediscovery when generation changes.
Replace process-local last-socket decisions with a shared lease or durable membership model
chosen in Phase 0. Make V2 join and leave lifecycle symmetric across tabs and replicas.

Files:

* `apps/client/src/network/useSocketConnection.ts` - Add bounded reconnect and connection epoch
* `apps/client/src/App.tsx` - Resubscribe visible rooms and clear protected state on terminal loss
* `apps/server/src/index.ts` - Apply symmetric V2 presence lifecycle
* `apps/server/src/realtime/quiltRooms.ts` - Integrate replica-wide membership semantics
* `apps/server/src/index.integration.test.ts` - Verify lifecycle behavior
* `e2e/quilt-reconnect.spec.ts` - Verify cross-replica reconnect, resubscription, and presence

Success criteria:

* A transient transport loss restores only visible patch and chunk rooms from retained cursors
* Last-socket behavior is correct when a principal has sockets on different replicas
* Terminal authentication loss clears all principal-protected client state

Dependencies:

* Phase 2 completion
* Phase 0 presence-semantics decision

### Step 3.2: Add patch discovery, navigation, and claim UX

Add a principal-aware eligible-patch query and durable patch navigation contract. Replace
the lobby with root navigation, patch discovery, claim action, and claimed-patch focus. Do
not expose legacy session lists or content. Use isolated canonical fixtures for client and
E2E tests, correcting the current test fixture so every declared patch address exists.

Files:

* `apps/server/src/contracts.ts` - Define eligible-patch and navigation contracts
* `apps/server/src/db/repository.ts` - Query eligible canonical patches with deterministic ordering
* `apps/server/src/index.ts` - Expose authenticated discovery and navigation routes
* `apps/client/src/App.tsx` - Integrate root, discovery, navigation, and claim state
* `apps/client/src/ui/LobbyScreen.tsx` - Remove or replace lobby controls with canonical navigation UI
* `apps/client/src/network/session.ts` - Replace session catalog calls with canonical patch APIs
* `apps/client/src/App.test.tsx` - Cover discovery, claiming, and durable navigation
* `e2e/smoke.spec.ts` - Start directly in the canonical fixture
* `e2e/multi-user-fixtures.spec.ts` - Verify isolated canonical ownership fixtures

Success criteria:

* The first screen is the usable canonical canvas experience
* An unowned principal can discover and claim an eligible patch by stable patch ID
* Reload and deep links return to a durable canonical location
* No supported workflow lists, creates, joins, archives, or imports legacy canvases

Dependencies:

* Phase 0 navigation and claim decisions
* Phase 2 completion

### Step 3.3: Run phase acceptance suites

Validation commands:

* `npm exec --workspace=apps/server -- vitest run src/index.integration.test.ts src/db/ownership.postgres.integration.test.ts src/db/recovery.postgres.integration.test.ts src/jobs/retention.test.ts`
* `npm exec --workspace=apps/client -- vitest run src/App.test.tsx src/domain/quiltCache.test.ts src/network/useSocketConnection.test.ts`
* `TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run test:e2e:multi-replica`
* `npm run test:e2e`

## Implementation Phase 4: Retire Session Compatibility

<!-- parallelizable: false -->

### Step 4.1: Cut over supported clients and disable session APIs

After canonical telemetry and recovery gates pass, make canonical entry unconditional for
supported clients. Require at least 24 staging hours and 100 authenticated entry attempts,
with discovery success at least 99.5%, ready entry and reconnect recovery at least 99%, V1
acceptance exactly zero, reconnect p95 at most 10 seconds, resync at most 1 per 100 ready
entries, and frame-time p95 at most 33.3 ms. Roll back immediately on V1 acceptance,
cross-principal descriptor leakage, or target invalidation after a successful generation;
also roll back when a five-minute window of at least 20 attempts exceeds 2% discovery
failure, entry failure, or reconnect exhaustion. Group reports by generation and canary
cohort without raw principal dimensions. Emit discriminated terminal discovery, entry,
reconnect, resubscribe, old-client rejection, and safety events with UUID event and attempt
IDs, generation, cohort, timestamp, and outcome-specific measurements. Build a deterministic
retirement report from an explicit UTC NDJSON export, deduplicate by event ID, calculate
nearest-rank p95 and five-minute failure windows, bind the input with SHA-256, and store the
input, canonical JSON report, and digest as immutable release evidence. Production receives
the approved report through `LEGACY_RETIREMENT_REPORT_PATH` and its expected digest through
`LEGACY_RETIREMENT_REPORT_SHA256`; startup derives measured-window and client-budget gates
from the valid report rather than free-standing booleans. Disable authenticated session list
and creation routes only after bearer verification and principal status enforcement. Return
HTTP 426, `Cache-Control: no-store`, `Upgrade: zzyix/2.0`, and
`client_upgrade_required` with the safe message, request ID, minimum schema version `2.0.0`,
and minimum protocol version 2. Remove the retired POST creation rate limiter so old clients
receive deterministic 426 responses. Remove lobby storage and finite presets.
Old clients and legacy content are not supported product paths.

Preserve existing auth behavior exactly: unauthenticated or invalid callers receive 401
with `WWW-Authenticate: Bearer`; authenticated but disallowed principals retain 403. Only
then return 426. Before rejection, do not list sessions, parse or validate creation payloads,
allocate IDs, open a creation transaction, or mutate rate-limit state.

Files:

* `apps/server/src/index.ts` - Disable session list and creation routes
* `apps/server/src/contracts.ts` - Remove supported session entry contracts
* `apps/client/src/network/session.ts` - Remove session list, creation, and selected-session storage
* `apps/client/src/ui/LobbyScreen.tsx` - Delete the obsolete lobby surface when no longer referenced
* `apps/client/src/App.tsx` - Remove the canary rollback branch after the observation window
* `apps/server/src/migration/quiltTelemetry.ts` - Add canonical discovery, entry, reconnect, resubscribe, old-client rejection, and safety events
* `apps/server/src/migration/quiltRollout.ts` - Require the captured measured-window report before retirement approval
* `apps/server/src/startup/rolloutGates.ts` - Enforce production retirement approvals
* `apps/server/src/operations/canonicalRetirementReportCli.ts` - Convert typed NDJSON evidence into deterministic report JSON and digest
* `apps/server/src/operations/canonicalRetirementReportCli.test.ts` - Verify deduplication, rates, p95, windows, triggers, canonical output, and digest binding
* `package.json` - Expose `telemetry:canonical-retirement`

Discrepancy references:

* DD-03

Success criteria:

* Supported builds expose only canonical entry
* Old session-entry calls receive a deterministic unsupported response
* No product code depends on legacy content availability
* Promotion and rollback reports satisfy operator-approved thresholds
* Retirement startup fails when the report path, expected digest, schema, recommendation, or derived gates are invalid

Dependencies:

* Phase 3 acceptance and observation window

Telemetry events share `schemaVersion: 1`, UUID `eventId`, UUID `attemptId`, event name,
server `occurredAt`, quilt ID, positive canonical generation, and `canary|global` cohort.
Principal identity may appear only in redacted diagnostic logs, never report keys or output.
The discriminated terminal variants are:

* `canonical_discovery`: `success|unavailable|error`, duration, and HTTP status; success is 200, unavailable 503, error 500
* `canonical_entry`: `ready|discovery_failed|protocol_rejected|connection_failed|initial_sync_failed`, duration, and optional selected protocol 1 or 2; a ready V1 record is accepted only to trigger rollback
* `canonical_reconnect`: `recovered|exhausted`, safe-integer attempts, and duration
* `canonical_resubscribe`: `completed|failed`, duration, requested, accepted, rejected, and resync-required safe-integer counts
* `canonical_old_client_rejected`: `rejected`, `http|socket`, and optional requested schema/protocol versions
* `canonical_safety`: `detected`, with `descriptor_leak|target_invalidated`

All durations and counts are finite and nonnegative. Exact duplicate event IDs are ignored.
Conflicting duplicates, invalid timestamps, out-of-window events, unknown fields, invalid
discriminants, nonterminal outcomes, and duplicate terminal `(name, attemptId)` pairs fail
report generation.
The discovery handler emits in `finally`; authenticated socket telemetry supplies client
entry, reconnect, and resubscribe terminals; HTTP/socket rejection emits old-client events;
server authorization and periodic target validation alone emit safety events.

The offline command is:

```text
npm run telemetry:canonical-retirement -- --input <events.ndjson> --output <report.json> --from <utc> --to <utc>
```

Hash the original NDJSON bytes as `evidence.inputSha256`, sort accepted events by timestamp
then event ID, and emit recursively key-sorted JSON with a trailing newline. Set
`generatedAt` to the requested observation-window end, never execution time. Report schema
version 1 and type `canonical-retirement`; include window bounds/duration, input hash,
accepted and exact-duplicate counts, fixed thresholds, groups by generation and cohort,
immediate triggers, five-minute rollback windows, and a decision containing `eligible`,
`measuredWindowApproved`, `clientBudgetPassed`, `recommendation`, and `failedChecks`.
Each group includes event counts, discovery/ready/reconnect rates, V1 count, reconnect p95,
resyncs per ready entry, frame sample count, and frame-time p95. Percentiles use nearest rank
at index `ceil(0.95 * count) - 1`. Evaluate half-open windows `(t - 300s, t]`
independently per generation, cohort, and metric. Eligibility requires the full 24-hour
window, 100 distinct authenticated entry attempts, at least one frame sample, and a group
for every generation. Hash the completed report separately; this report digest, not the
input evidence hash, must match `LEGACY_RETIREMENT_REPORT_SHA256`. Retain input, report, and
report digest together as immutable release evidence.

### Step 4.2: Move socket identity to quilt ID

Version the handshake to accept durable quilt identity and add `schemaVersion` to connection
authentication. Reject unsupported sockets with `client_upgrade_required`, minimum schema
version `2.0.0`, and minimum protocol version 2. Deploy a bounded dual-identity transition,
then remove compatibility-canvas lookup, canvas-wide rooms, snapshots, sequencing, and
process-local session state after rejection telemetry and supported-client adoption satisfy
the Step 4.1 gate. Keep additive database structures until normal audit and retention policy
permits a separate cleanup migration.

Reject before protocol fallback, compatibility lookup, room joins, presence mutation, or
other session state. Deliver the Socket.IO connection error through `connect_error.data` as
`{ code: 'client_upgrade_required', message: 'This client version is no longer supported.',
minimumSchemaVersion: '2.0.0', minimumProtocolVersion: 2 }`; emit rejection telemetry before
terminating the handshake.

Files:

* `apps/server/src/contracts.ts` - Version the handshake around quilt identity
* `apps/server/src/index.ts` - Resolve sockets directly by quilt ID and remove session runtime paths
* `apps/server/src/db/repository.ts` - Remove runtime compatibility lookups after adoption
* `apps/client/src/network/useSocketConnection.ts` - Send quilt identity after server compatibility deploys
* `e2e/quilt-reconnect.spec.ts` - Verify the quilt-identity handshake across replicas

Success criteria:

* All supported sockets identify the canonical world by quilt ID
* Canvas-wide runtime state is absent from the canonical delivery path
* Retirement does not delete canonical quilt, patch, tile, operation, claim, policy, or audit data

Dependencies:

* Step 4.1 completion
* Digest-verified retirement report with `recommendation: promote`

## Implementation Phase 5: Final Validation

<!-- parallelizable: false -->

### Step 5.1: Run full project validation

Execute:

* `npm run lint`
* `npm run build`
* `npm test`
* `npm run test:e2e`
* `TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run test:e2e:multi-replica`
* `./scripts/verify-quilt-migration.sh rehearse`

### Step 5.2: Fix minor validation issues

Correct isolated lint, build, migration-rehearsal, and test failures introduced by the
implementation. Re-run the narrow failing command before repeating the full suite.

### Step 5.3: Report blocking issues

Document failures that require product-contract changes, topology replacement, or broad
architecture work. Create focused follow-on research and planning rather than expanding the
implementation inline.

## Implementation Phase 6: Remediate Implementation Review Findings

<!-- parallelizable: false -->

Source:

* `.copilot-tracking/reviews/2026-07-29/canonical-infinite-canvas-convergence-plan-quality.md`

### Step 6.1: Enforce trustworthy retirement evidence and final-state deployment

Make retirement evidence mandatory whenever the build exposes retired compatibility
behavior. Recompute every report decision from accepted evidence at load time and reject
empty, inconsistent, or caller-authored conclusions. Propagate the immutable report path,
report digest, and required approvals through CD. Remove canonical discovery and entry
canary controls from the final deployment and client path after evidence enforcement.

Files:

* `apps/server/src/operations/canonicalRetirementReportCli.ts`
* `apps/server/src/migration/quiltRollout.ts`
* `apps/server/src/startup/rolloutGates.ts`
* `apps/server/src/startup/rolloutGates.test.ts`
* `.github/workflows/cd.yml`
* `scripts/release-contract.test.mjs`
* `apps/client/src/App.tsx`

Success criteria:

* A retired build cannot start without immutable, digest-matched promotion evidence
* Promotion is derived from nonempty accepted events and cannot be supplied as trusted input
* Final production deployment and UI have no discovery or entry rollback controls

### Step 6.2: Bind telemetry identity and make every terminal outcome observable

Bind canonical entry, reconnect, and resubscribe telemetry to the authenticated socket's
server-owned attempt identity. Define server-owned identity for pre-discovery failures
without fabricating quilt identity or generation. Record server-observable failures on the
server and use an authenticated deliverable path for client-only terminal failures. Define
and validate reconnect attempt lineage so one socket cannot manufacture promotion volume.

Files:

* `apps/server/src/contracts.ts`
* `apps/server/src/index.ts`
* `apps/server/src/migration/quiltTelemetry.ts`
* `apps/server/src/operations/canonicalRetirementReportCli.ts`
* `apps/server/src/index.integration.test.ts`
* `apps/client/src/network/useSocketConnection.ts`
* `apps/client/src/network/useSocketConnection.test.ts`

Success criteria:

* Client telemetry cannot choose or replay another authenticated attempt identity
* Every discovery, entry, reconnect, and resubscribe attempt has one deliverable terminal
* Pre-world failures are not grouped as a fabricated canonical generation

### Step 6.3: Enforce canonical provenance, lease loss, and runtime retirement

Restrict activation to the provisioned inactive generation-1 pointer and preserve its quilt
identity during the generation-1-to-2 CAS. Delete retired handlers, process-local state,
contracts, imports, and legacy-focused tests from compiled runtime code while retaining only
database residue required by retention policy. Treat a false or rejected presence renewal
as lease loss under an explicit disconnect policy. Correct the ADR keyword indentation.

Files:

* `apps/server/src/db/repository.ts`
* `apps/server/src/index.ts`
* `apps/server/src/contracts.ts`
* `apps/server/src/db/canonicalWorld.postgres.integration.test.ts`
* `apps/server/src/index.integration.test.ts`
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`

Success criteria:

* Activation cannot adopt or repoint to an arbitrary structurally valid quilt
* No retired session handler, state, or public contract is compiled into the product runtime
* Presence lease loss terminates the affected socket deterministically

### Step 6.4: Add composed boundary coverage and rerun release validation

Add live HTTP tests for 401, 403, and 426 ordering with side-effect checks and live
Socket.IO tests for authentication, unsupported clients, and telemetry binding. Add composed
navigation, claim, and presence lifecycle coverage. Correct planning and release claims,
then rerun focused checks followed by PostgreSQL-backed tests, both Playwright suites, and
migration rehearsal when their dependencies are available.

Validation commands:

* `npm exec --workspace=apps/server -- vitest run src/operations/canonicalRetirementReportCli.test.ts src/startup/rolloutGates.test.ts src/index.integration.test.ts src/db/canonicalWorld.postgres.integration.test.ts`
* `npm exec --workspace=apps/client -- vitest run src/App.test.tsx src/network/useSocketConnection.test.ts`
* `npm run test:release-contract`
* `npm run lint`
* `npm run build`
* `npm test`
* `npm run test:e2e`
* `TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run test:e2e:multi-replica`
* `./scripts/verify-quilt-migration.sh rehearse`

Success criteria:

* Composed compatibility boundaries are tested through live HTTP and Socket.IO stacks
* PostgreSQL, standard Playwright, multi-replica Playwright, and migration evidence is retained
* Release artifacts report readiness only after every critical and major finding is closed

## Dependencies

* Product acceptance of one finite toroidal canonical world
* Production topology, target, navigation, claim, and presence decisions
* Disposable loopback PostgreSQL for migration and repository integration tests
* Existing quilt protocol-V2, authorization, recovery, and telemetry mechanisms
* Implementation review findings IV-001 through IV-012

## Success Criteria

* Every supported user enters the same validated protocol-V2 quilt automatically
* Patch claims and mutations remain authorized by stable patch identity
* Reconnect, resubscription, and presence are correct across replicas
* The product contains no session creation, session selection, or legacy-content workflow
* Compatibility retirement preserves canonical data and uses forward-only schema evolution
