---
title: Canonical Infinite Canvas Convergence Planning Research
description: Verified implementation context for planning canonical infinite canvas convergence
author: GitHub Copilot
ms.date: 2026-07-29
ms.topic: reference
---

## Status

Complete: eight major Plan Validator findings resolved

## Research Questions

* What architecture and runtime boundaries currently own canonical canvas entry, quilt
  routing, patch claims, realtime subscriptions, and reconnect behavior?
* Which exact files and nearby tests would each recommended implementation phase change?
* Which package scripts and focused validation commands are available?
* What migration and feature-flag conventions already exist?
* Are the recommended phases actionable in their current order and scope?
* Which matching plan, details, log, review, and changes artifacts contain omissions or
  stale references?
* What exact runtime auth/config parser, Dockerfile, and template generate the deployed
  client configuration?
* Which existing telemetry owners and event patterns can support measurable canonical
  promotion and rollback gates?
* Which project-consistent lifecycle, generation/CAS, discovery error, policy validation,
  and operator CLI contracts should the plan fix before implementation?
* What exact disposable PostgreSQL and multi-replica Playwright commands exercise the
  required topologies?
* Which existing contract/error conventions and version signals can define stable
  old-client rejection?
* Can Phase 3 execute concurrently without conflicting ownership, or must its integration
  work be sequenced?
* What exact typed terminal events and deterministic report contract can evaluate the
  selected canonical retirement thresholds?
* What exact idempotent operator contract can provision a complete protocol-V2 toroidal
  canonical quilt when no existing target is adopted?

## Findings

### Executive Assessment

The primary research is directionally correct: canonical convergence is an entry-routing
change over an existing quilt, patch, chunk, authorization, and protocol-V2 runtime. The
database-backed singleton pointer is compatible with the current architecture and can be
introduced additively without re-keying quilt, patch, tile, operation, policy, claim, or
audit records.

The recommended phases are not equally actionable. Phase 1 is sufficiently bounded for
implementation after its contract details are fixed. Phases 2 and 3 need additional
deployment and connection-state work that the current artifacts do not name. Phases 4 and
5 remain product programs rather than implementation-ready phases because navigation,
patch discovery, legacy access, and import semantics are unresolved and no corresponding
API exists. Phase 6 is correctly last but needs explicit client-version and schema
retirement gates.

The controlling ADR conflicts with the target product model. It permits multiple community
quilts and explicitly rejects one global quilt. Phase 0 is therefore a real architecture
approval gate, not documentation cleanup.

### Verified Architecture and Exact Owners

#### Client entry and protected state

* `apps/client/src/App.tsx` owns `sessionId`, lobby versus canvas mode, session loading,
  finite preset creation, pending claim state, automatic socket activation, quilt cache,
  room cursors, active chunks, and return-to-lobby cleanup.
* `apps/client/src/network/session.ts` owns `GET /sessions`, `POST /sessions`, patch-claim
  HTTP calls, the per-tab `zzyix_session_id`, and the persistent `zzyix_client_id`.
* `apps/client/src/ui/LobbyScreen.tsx` owns refresh, finite preset selection, create, claim,
  join, previous-session, and session-list presentation.
* `apps/client/src/network/useSocketConnection.ts` owns the compatibility handshake. It
  sends `sessionId`, requests protocol V2, disables V1 compatibility, and sets
  `reconnection: false`. It retries only authentication-related failures and makes one
  forced token-renewal attempt.
* `apps/client/src/auth/AuthSessionProvider.tsx` and
  `apps/client/src/auth/TestAuthProvider.tsx` clear principal and token state on terminal
  authentication loss. They do not clear `App`'s quilt cache, cursors, session selection,
  collaborators, or sequenced state.
* `apps/client/src/App.tsx` retains per-room cursors and resubscribes when viewport,
  protocol, cache, zoom, or `quiltSubscriptionEpoch` changes. Ordinary socket reconnect is
  not a dependency, so reconnecting the same socket does not itself guarantee room
  resubscription after server-side room membership is lost.
* There is no client router or canvas deep-link parser. Canonical root and deep-link entry
  require a new navigation contract, not adaptation of an existing route.

#### Server HTTP, socket, and presence

* `apps/server/src/contracts.ts` is the shared REST and Socket.IO contract owner. It only
  documents session list/create for entry and has no canonical descriptor type or error
  code.
* `apps/server/src/index.ts` owns all HTTP routes. `GET /sessions` lists visible canvases;
  `POST /sessions` allocates a UUID and invokes `createProtectedSession`; ownership claims
  already accept only stable `patchId` plus `operationId`.
* `apps/server/src/db/repository.ts` owns list visibility, session creation, canonical
  delivery lookup, patch claims, quilt mutations, recovery, and authorization reads.
* `createProtectedSession` still creates a one-patch, bounded, protocol-V1 quilt and an
  unclaimed claim target. Production has no protocol-V2 toroidal provisioner.
* `loadQuiltDeliveryContext` resolves V2 indirectly through
  `quilts.legacy_canvas_id = sessionId`, loads every patch and policy, and returns topology
  plus principal-specific membership. This is the nearest reusable read for canonical
  validation, but it should not be reused directly as a public descriptor because it
  includes authorization-sensitive patch detail.
* The test-only `POST /test/quilt/setup` route in `apps/server/src/index.ts` is the only
  current path that creates a toroidal protocol-V2 quilt. It creates an incomplete grid
  for its declared topology (one patch for a one-row, two-column quilt), so it is not a
  valid production provisioner or canonical completeness fixture.
* Protocol selection in `apps/server/src/index.ts` falls back to V1 whenever the requested
  session does not resolve to an enabled V2 quilt. The client accepts the V1 handshake.
  Canonical entry therefore needs an explicit fail-closed check; discovery validation
  alone does not prevent rollout configuration from causing V1 fallback.
* V2 returns before the legacy participant join and session-room path. Disconnect still
  executes legacy participant finalization after consulting the process-local
  `sessionClientSockets` map. This confirms asymmetric V2 presence and false last-socket
  risk across replicas.
* `@socket.io/postgres-adapter` shares Socket.IO room fanout, but it does not make the
  process-local last-socket map durable or replica-wide.

#### Persistence and ownership

* `apps/server/src/db/schema.ts` is the Drizzle schema owner. `quilts` has an optional,
  unique compatibility canvas ID, topology, dimensions, and protocol version, but no
  lifecycle status. `patches` owns stable address, state, owner, and revision.
* `patch_visibility_policies`, `patch_memberships`, `patch_claim_quota_records`,
  `patch_operations`, `patch_snapshots`, and `authorization_audit_events` all use stable
  quilt or patch identity. Initial convergence must not re-key them.
* `claimPatch` in `apps/server/src/db/repository.ts` locks the operation, principal, and
  patch, resolves the quilt from the patch, and enforces at most one active owned patch per
  principal per quilt. Claim attempt and successful-claim windows are global per principal,
  not quilt-scoped. The plan's ownership-limit decision is accurate, but it should also
  state whether global rate windows remain intended after convergence.
* A canonical pointer should reference both quilt and compatibility canvas only if the
  repository validates that the canvas equals `quilts.legacy_canvas_id`. Otherwise two
  independently writable references can drift. Storing only quilt ID and deriving the
  compatibility ID is a simpler alternative if restore and descriptor requirements allow
  it.
* Completeness means exactly `patch_rows * patch_columns` unique in-bounds addresses and a
  valid required policy for every address. A count check alone is insufficient unless the
  existing address uniqueness and parent-bounds trigger are also confirmed active.

### Migration Conventions

* Authored migrations are sequential SQL files in `apps/server/migrations`, with Drizzle
  snapshots and `_journal.json` entries in `apps/server/migrations/meta`. The next migration
  is expected to be `0007_*` unless another change lands first.
* Schema definitions change in `apps/server/src/db/schema.ts`. Generation is available as
  `npm run db:generate --workspace=apps/server`, but generated SQL and metadata must be
  reviewed together.
* `apps/server/src/db/migrate.ts` applies all pending SQL in nonproduction. Production
  startup requires the applied migration count to exactly equal the local SQL-file count.
* PostgreSQL integration tests use `apps/server/src/test/postgresTestDatabase.ts`, which
  creates a disposable loopback database, applies every migration, and drops it afterward.
* `scripts/verify-quilt-migration.sh rehearse` compares fresh and upgraded schemas,
  exercises repeated legacy backfill, parity, compatibility rollback, and recovery. Its
  rollback removes backfilled compatibility links and quilts; it does not reverse schema
  migrations or exercise a future canonical pointer.
* The server `db:rollback` script only prints policy text. No authored reverse SQL files or
  down sections exist in migrations `0005` or `0006`. The artifacts should describe
  canonical rollback as forward application routing plus an inactive additive pointer,
  not imply an executable reverse-migration convention.

### Feature-Flag Conventions and Deployment Gaps

* Server flags use environment variables and exact string-to-boolean parsing. Quilt rollout
  uses global execution flags plus quilt/principal/percentage canaries in
  `apps/server/src/migration/quiltRollout.ts`.
* Production startup approval gates in `apps/server/src/startup/rolloutGates.ts` currently
  govern authentication and protocol-V2 mutation only. They do not govern canonical entry
  or canonical target validation.
* Client flags are compile-time `import.meta.env.VITE_*` values. Runtime JSON is used for
  authentication configuration, not product feature flags. An independently reversible
  client canary therefore needs either a new build-time Vite flag and distinct image, or a
  new runtime configuration mechanism.
* `.github/workflows/cd.yml` propagates `FEATURE_PROTOCOL_V2_MUTATION_ENABLED` to Azure
  Container Apps. It does not propagate the documented
  `FEATURE_QUILT_PROTOCOL_V2_ENABLED`, quilt canary variables, or a canonical-entry flag.
* `infra/bicep` does not currently own normal application environment variables; CD uses
  direct `az containerapp create/update` commands. Phase 2 must include workflow and release
  contract changes, not only client and server source changes.
* The safest independent gates are a server discovery gate, a client entry gate, existing
  quilt protocol enablement, and existing mutation enablement. Disabling client entry must
  restore the lobby without disabling access to writes already made in the canonical quilt.

### Nearby Tests and Exact Validation Commands

Phase 1 should add focused tests near these owners:

* `apps/server/src/db/schema.test.ts` for pointer constraints and indexes
* A new `apps/server/src/db/canonicalWorld.postgres.integration.test.ts` for absent,
  invalid, complete, concurrent, generation, and restart-stable selection
* `apps/server/src/contracts.test.ts` for the descriptor contract
* `apps/server/src/index.test.ts` or `apps/server/src/index.integration.test.ts` for
  authenticated route mapping and unavailable responses
* A new operator-command unit test plus PostgreSQL integration coverage beside its CLI
* `apps/server/src/db/migrate.test.ts` for migration-count compatibility, with disposable
  migration application supplied by the PostgreSQL test helper

Phase 2 should adapt or add coverage in:

* `apps/client/src/App.test.tsx` for flag-off lobby behavior, flag-on discovery, automatic
  entry, unavailable target, auth transitions, reload, and rollback
* A new canonical discovery network test beside `apps/client/src/network/session.ts`
* `apps/client/src/network/useSocketConnection.test.ts` for expected-V2 rejection instead
  of accepted V1 fallback
* `apps/server/src/startup/rolloutGates.test.ts` and
  `apps/server/src/migration/quiltRollout.test.ts` for independent canonical gates
* `scripts/release-contract.test.mjs` for CD variable propagation and fail-closed defaults

Phase 3 has reusable behavior coverage in:

* `apps/server/src/index.integration.test.ts` for same-process last-socket behavior
* `e2e/quilt-reconnect.spec.ts` for cross-replica event/cursor recovery, not presence
* `e2e/quilt-seams.spec.ts` for canonical room and periodic seam behavior
* `apps/server/src/db/ownership.postgres.integration.test.ts` for concurrent claim and
  one-active-patch enforcement
* `apps/server/src/db/recovery.postgres.integration.test.ts` and
  `apps/server/src/jobs/retention.test.ts` for recovery and retention
* `apps/client/src/domain/quiltCache.test.ts` for protected cache retention and eviction

Use these focused commands from the repository root:

```bash
npm exec --workspace=apps/server -- vitest run src/contracts.test.ts src/index.integration.test.ts src/startup/rolloutGates.test.ts src/migration/quiltRollout.test.ts
npm exec --workspace=apps/server -- vitest run src/db/schema.test.ts src/db/canonicalWorld.postgres.integration.test.ts
npm exec --workspace=apps/client -- vitest run src/network src/App.test.tsx
npm run lint:server
npm run build:server
npm run lint:client
npm run build:client
```

Database-changing validation must target disposable loopback PostgreSQL:

```bash
TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm exec --workspace=apps/server -- vitest run src/db/canonicalWorld.postgres.integration.test.ts
./scripts/verify-quilt-migration.sh rehearse
```

The rehearsal script must be extended before it can validate canonical pointer upgrade,
selection idempotency, and rollback preservation. `npm run db:apply` uses `.env` and mutates
its configured database, so it is not the preferred focused planning command.

Focused verification performed during this research passed:

* Server rollout, startup-gate, and index integration slice: 3 files, 57 tests
* Client socket and App slice: 2 files, 37 tests

Expected authentication-error logging and chunk-resync telemetry appeared; no test failed.

### Phase Actionability

#### Phase 0

Actionable as an approval and inventory gate, but not executable from the repository alone.
It needs deployed database access, topology and target decisions, old-client policy, claim
UX, and an ADR amendment. The current ADR rejects the requested tenancy model.

#### Phase 1

Mostly actionable and correctly isolated. Before implementation, fix the pointer key and
status vocabulary, whether compatibility canvas ID is stored or derived, the lifecycle
generation semantics, the default-location representation, endpoint path, unavailable
status/code, required policy definition, and operator command interface. Add CD/startup
validation only after the pointer can exist inactive; discovery GET must remain side-effect
free.

The phase should explicitly include Drizzle metadata, a root package script for the operator
CLI if operators invoke it from the monorepo, and extension of the migration rehearsal. A
generic “conflicting target” test is underspecified if the stable singleton key makes a
second row impossible; test stale generation, pointer-to-quilt mismatch, and concurrent
selection outcomes instead.

#### Phase 2

Partially actionable. Client and server flags must be separate, and CD currently wires
neither canonical entry nor production quilt protocol enablement. The client needs an
expected-protocol contract so a V1 handshake clears protected state and returns to a
controlled unavailable path. Runtime versus build-time client flag strategy must be chosen.

Ignoring session storage is safe for rollback, but automatic entry should not overwrite the
stored legacy session while canaried. Root entry has no existing URL contract, so deep links
should remain out of this phase unless product decisions are complete.

#### Phase 3

Actionable only after presence semantics are specified. Shared Socket.IO fanout is already
present; replica-wide membership is not. Add a dedicated cross-replica presence test because
the existing reconnect E2E does not assert join/leave rows or notifications.

Reconnect must include a bounded ordinary transport retry policy, a connection epoch that
forces cursor resubscription, canonical rediscovery rules, and terminal-auth cleanup in
`App`. Token renewal alone does not restore room membership. Avoid coupling this phase to
measured rollout thresholds that the ADR intentionally leaves unresolved; define the
measurement owner and artifact first.

#### Phase 4

Not implementation-ready as written. There is no patch discovery, patch search, canonical
navigation, minimap, or deep-link API. `listSessionSummaries` cannot substitute because it
returns canvases, not eligible patch addresses. Split this phase into server API/domain work,
client navigation and claim UX, old-client API behavior, and E2E fixture migration.

#### Phase 5

Correctly separate but not actionable until archive versus import policy, identity mapping,
coordinate packing, collision behavior, source immutability, and provenance schema are
approved. Existing quilt backfill only creates bounded compatibility quilts; it is not a
canonical import mechanism.

#### Phase 6

Correctly ordered but still conceptual. Define a versioned handshake accepting quilt ID,
dual-identity transition, client adoption telemetry, participant/presence replacement,
legacy API deprecation responses, retention approvals, and forward-only schema retirement.

### Matching Artifact Omissions and Stale References

Six pre-existing artifacts match the requested name: primary research, plan, details, log,
review, and changes. Their main omissions are consistent across files:

* The plan and details say “client and server flag” but omit the build-time Vite versus
  server-runtime distinction, CD propagation, production protocol flag gap, and release
  contract tests.
* The plan says reconnect and cursor resubscription but does not identify the missing
  connection epoch or the fact that the same-socket reconnect does not trigger `App`'s room
  subscription effect.
* The plan says protected-cache clearing but does not name sequenced state, cursors,
  collaborators, active chunks, stored session behavior, or the auth-provider/App ownership
  boundary.
* The plan treats navigation, search, patch discovery, and claiming as one UX replacement.
  No patch discovery/search endpoint exists, so Phase 4 lacks prerequisite server work.
* The details call for “migration verification” without naming
  `scripts/verify-quilt-migration.sh` or explaining that its current rollback and parity
  scope do not include a canonical pointer.
* The artifacts do not note that `/test/quilt/setup` creates an incomplete declared patch
  grid and cannot become the canonical fixture unchanged.
* The artifacts do not identify `apps/server/src/contracts.ts`,
  `apps/server/src/startup/rolloutGates.ts`, `.github/workflows/cd.yml`,
  `scripts/release-contract.test.mjs`, or the auth providers as Phase 1 through Phase 3
  owners.
* The review claims the current assumptions and test impact were fully traced, but it does
  not record executable validation and misses the deployment, resubscription, fixture, and
  discovery-API gaps above.
* The review says diagnostics covered the “subagent research artifacts” without identifying
  which artifact. The plan and changes reference
  `.copilot-tracking/research/subagents/2026-07-29/infinite-canvas-convergence-research.md`,
  not this planning-verification document.
* The changes artifact's Added list omits its matching review and changes records. It also
  describes all work as complete even though the existing phase definitions remain
  implementation-incomplete in the areas above.
* The primary research's file references remain valid. Some line-number claims in the older
  subagent research have drifted as code changed, so future planning should cite symbols and
  exact files rather than copying those line ranges.

### Plan Validator Major-Finding Resolutions

#### Runtime client configuration owner and production generation

The actual parser is `apps/client/src/config/runtimeConfig.ts`, not
`apps/client/src/config/authConfig.ts`. `AuthProvider.tsx` calls
`loadRuntimeAuthConfig()`, which fetches `/auth-config.json` with `cache: 'no-store'` and
passes the response through `parseRuntimeAuthConfig()`. The parser rejects missing,
blank, and unresolved `${...}` values and validates public URL security and origin shape.
`apps/client/src/config/runtimeConfig.test.ts` is the focused parser test owner.

Production does not transform `apps/client/public/auth-config.template.json`.
`apps/client/Dockerfile` constructs `/entrypoint.sh`, requires the auth environment
variables, uses `jq -n` to write
`/usr/share/nginx/html/auth-config.json`, validates it with `jq empty`, renders the nginx
configuration, and runs `nginx -t`. `scripts/release-contract.test.mjs` explicitly asserts
that the Dockerfile does not consume the template. The template is a reference artifact;
`apps/client/public/auth-config.json` is the development value copied by Vite.

The runtime canonical-entry gate should therefore use this complete path:

* Generalize `RuntimeAuthConfig` to runtime client configuration, or add
  `canonicalEntryEnabled: boolean` to the existing type without inventing another loader
* Parse a real JSON boolean and reject absent, string-valued, or unresolved values
* Add `FEATURE_CANONICAL_ENTRY_ENABLED` to the Docker entrypoint's required variables and
  emit it with `jq --argjson`
* Add the JSON field to both public config files so development and parser tests remain
  deterministic
* Add the environment variable to both client `az containerapp create` and `update` paths
  in `.github/workflows/cd.yml`
* Extend the jq escaping/type check in `scripts/release-contract.test.mjs`

The server discovery gate remains a separate server environment variable. Client entry and
server discovery must be independently reversible; neither should be conflated with
`FEATURE_PROTOCOL_V2_MUTATION_ENABLED`.

#### Telemetry owners and measurable rollout gates

`apps/server/src/migration/quiltTelemetry.ts` is the reusable typed telemetry boundary.
It carries a stable event name, quilt and principal cohort dimensions, numeric
measurements, and additional dimensions. `apps/server/src/index.ts` installs its observer
and writes `quilt_migration_<name>` through the structured `writeLog()` path after
`redactTelemetry()`. This is suitable for operational log queries and tests through
`configureQuiltTelemetry()`.

The current process-local `chunkTelemetry` object in `apps/server/src/index.ts` and the
`clientTelemetryRef` counters in `apps/client/src/App.tsx` are diagnostic accumulators, not
durable gates. Client runtime measurements already have a supported transport:
`App.tsx` emits `quilt_client_runtime_metrics`, `apps/server/src/contracts.ts` types the
payload, and `index.ts` converts accepted canary samples to the `client_runtime` telemetry
event. Canonical measurements should follow that typed server-observed pattern.

Add these event names to `QuiltTelemetryEvent` and emit one terminal outcome per attempt:

* `canonical_discovery` with `outcome=success|unavailable|error`, `durationMs`, generation,
  and HTTP status
* `canonical_entry` with `outcome=ready|failed`, `durationMs`, generation, and selected
  protocol
* `canonical_reconnect` with `outcome=recovered|exhausted`, attempts, and `durationMs`
* `canonical_resubscribe` with requested, accepted, rejected, and resync counts
* `canonical_old_client_rejected` with transport `http|socket` and protocol version when
  available

`apps/server/src/migration/quiltRollout.ts` already owns legacy-retirement decisions. Its
existing gates cover parity, recovery, multi-replica behavior, authenticated-principal
integration, client budget, measured-window approval, and rollback-policy approval.
`apps/server/src/startup/rolloutGates.ts` owns production startup approvals. Keep these
boolean approvals, but require a captured telemetry report to justify
`LEGACY_RETIREMENT_MEASURED_WINDOW_APPROVED=true`.

No numeric SLO exists in the repository. The following values are recommended initial plan
defaults and require operator approval before implementation:

* Observe staging for at least 24 hours and 100 authenticated entry attempts
* Promote when discovery success is at least 99.5%, ready entry is at least 99%, V1
  acceptance is exactly zero, reconnect recovery is at least 99%, reconnect recovery p95
  is at most 10 seconds, resync is at most one event per 100 ready entries, and client
  `frameTimeMs` p95 is at most 33.3 ms
* Roll back the client entry gate immediately on any accepted V1 canonical entry, any
  cross-principal descriptor leak, or any canonical target validation failure after a
  previously successful generation
* Roll back when a five-minute window with at least 20 attempts exceeds 2% discovery
  unavailable/internal failures, 2% entry failures, or 2% reconnect exhaustion

Promotion and rollback reports should group by canonical generation and canary cohort.
Raw principal IDs must not be used as dashboard dimensions even though the typed event can
carry them for controlled diagnostic logging.

#### Canonical pointer, discovery, policy, and operator contracts

Use one row keyed by the stable literal product key `canonical`. Store only `quilt_id` and
derive the compatibility canvas through `quilts.legacy_canvas_id`. Recommended pointer
fields are `product_key`, `quilt_id`, `status`, `generation`, `created_at`, and
`updated_at`, with a primary key on `product_key`, a check fixing the key to `canonical`,
a restrictive quilt foreign key, `generation > 0`, and status in `inactive|active`.
Missing and inactive are distinct storage states but have the same discovery outcome.

Use these generation and compare-and-set rules:

* An absent pointer has conceptual generation 0
* Initial activation requires expected generation 0 and writes generation 1
* A successful target or status change requires an exact expected generation and writes
  generation plus one
* Repeating the already-applied action with the same target and status is idempotent,
  returns the current generation, and does not increment it
* A stale or future expected generation is a conflict and does not mutate the row
* Selection takes a transaction-scoped advisory lock on the stable product key, matching
  repository use of `pg_advisory_xact_lock`, then validates and mutates in one transaction
* Rollback changes status to `inactive` through the same CAS path; it never deletes the
  pointer, target quilt, or canonical content

Expose authenticated, side-effect-free discovery as `GET /quilts/canonical`. This path is
already covered by the nginx `/quilts` proxy root. On success return HTTP 200 with quilt
ID, derived legacy canvas ID during compatibility, protocol version 2, toroidal topology,
dimensions, generation, and an initial stable patch location. Use a patch ID plus row and
column for the initial location; a tile ID is content-dependent and is not a durable entry
anchor.

Missing, inactive, stale, incomplete, protocol-V1, non-toroidal, policy-invalid, or
alias-invalid targets return HTTP 503 with the modern safe error shape from
`apps/server/src/contracts.ts` and `apps/server/src/auth/httpAuth.ts`:

```json
{
  "code": "canonical_world_unavailable",
  "message": "The canonical world is temporarily unavailable.",
  "requestId": "<request-id>",
  "retryAfterSeconds": 30
}
```

Set `Retry-After: 30`. Authentication still runs first and retains the existing 401/403
contracts. Unexpected handler failures retain `internal_error` and HTTP 500. Do not map an
invalid global target to 404 because it is an operator-controlled service dependency, not
a hidden principal-scoped resource.

Canonical validation must require all of the following in one repeatable transaction:

* Protocol version 2 and toroidal topology with positive dimensions
* Exactly `patch_rows * patch_columns` unique patch addresses, every address in bounds,
  and no missing coordinate
* Every patch state is `unclaimed` or `active`; suspended, deletion-requested, and deleted
  patches make the target unavailable
* Every patch has exactly one policy accepted by
  `isPersistedVisibilityPolicy()` in
  `apps/server/src/domain/authorizationPolicy.ts`
* The baseline policy uses `authenticated` for existence, fine data, aggregate data,
  presence, search, and durable events, with `claimEnabled: true` and
  `policyVersion: 1` or greater
* The derived compatibility canvas exists and equals the quilt's unique
  `legacy_canvas_id` while compatibility remains enabled

Match the existing action-oriented operator pattern in
`apps/server/src/operations/principalRecoveryCli.ts`. Expose a root script that builds the
server and loads `.env`, plus a server package script for the compiled command. The command
contract is:

```text
npm run db:canonical-world -- --action status
npm run db:canonical-world -- --action activate --quilt-id <uuid> --expected-generation <integer> --operator-id <id> --reason <text>
npm run db:canonical-world -- --action deactivate --expected-generation <integer> --operator-id <id> --reason <text>
```

The root script should be
`npm run build:server && node --env-file=.env apps/server/dist/cli/selectCanonicalWorld.js`;
the server workspace script should be `node dist/cli/selectCanonicalWorld.js`.

Reject unknown arguments, duplicate arguments, missing values, invalid UUIDs, negative or
non-integer generations, and action-incompatible arguments before opening a transaction.
Write status and successful/idempotent results to stdout. Write one safe error to stderr.
Exit 0 for status, mutation success, and idempotent replay; exit 1 for usage errors,
validation failures, CAS conflicts, denied target activation, and database failures. Set
`process.exitCode`, close the database bundle in `finally`, and never create a quilt from a
discovery GET.

#### Exact database and multi-replica validation commands

`apps/server/src/test/postgresTestDatabase.ts` accepts
`TEST_DATABASE_ADMIN_URL`, rejects non-loopback hosts, creates a random disposable
database, applies all migrations, and drops it with `FORCE`. Use this exact focused command
from the repository root:

```bash
TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm exec --workspace=apps/server -- vitest run src/db/canonicalWorld.postgres.integration.test.ts
```

The exact supported multi-replica command is the root package script, including browser
installation and Linux dependency preflight:

```bash
TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run test:e2e:multi-replica
```

That script runs
`playwright test --config=playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts
--reporter=line`. `e2e/support/startMultiReplicaServer.ts` coordinates one disposable
database through a lock and state file; both server replicas share it.
`e2e/support/multiReplicaGlobalTeardown.ts` force-drops it. Do not replace this command with
plain `npx playwright test`, which uses the single-server configuration and does not prove
cross-replica behavior.

#### Stable old-client unsupported response and version signals

The modern project error convention is `SafeApiError`: lowercase snake-case `code`, safe
`message`, and `requestId`, with optional `retryAfterSeconds`. The older uppercase
`ApiError` union is stale relative to current authenticated HTTP handlers and should not be
extended for this contract.

After cutover, both `GET /sessions` and `POST /sessions` should return HTTP 426 with:

```json
{
  "code": "client_upgrade_required",
  "message": "This client version is no longer supported.",
  "requestId": "<request-id>"
}
```

Keep authentication ahead of this response so unauthenticated calls remain 401 and do not
gain a content-discovery oracle. Do not return a session list, create content, or silently
redirect. The response is endpoint-level and deterministic because current HTTP requests
carry no client version.

`SCHEMA_VERSION = '2.0.0'` and `QUILT_PROTOCOL_VERSION = 2` exist in
`apps/server/src/contracts.ts`, but `SCHEMA_VERSION` is not transmitted or checked by the
client. `/health` reports the hard-coded package value `0.0.0`, which is not an adoption
signal. The only live compatibility signal is `ConnectionAuth.protocolVersion`; missing
or `1` identifies the legacy socket path, while supported clients send `2`. During the
dual-identity window, add `schemaVersion` to `ConnectionAuth` and reject unsupported socket
clients with Socket.IO error data containing `code: client_upgrade_required`,
`minimumSchemaVersion: 2.0.0`, and `minimumProtocolVersion: 2`. Record rejection counts
through `canonical_old_client_rejected` before ending compatibility.

#### Phase 3 dependency and parallelization decision

Phase 3 cannot remain wholly parallel under current ownership. Reconnect/presence and
patch discovery/navigation both mutate `apps/client/src/App.tsx` and
`apps/server/src/index.ts`. Separate commits followed by serialized merges do not make the
implementation independent and leave acceptance behavior unresolved until both land.

Split it into three subphases:

* Phase 3A can run in parallel and owns reconnect and presence foundations in
  `apps/client/src/network/useSocketConnection.ts`,
  `apps/server/src/realtime/quiltRooms.ts`, and a dedicated shared presence repository or
  lease module with focused tests
* Phase 3B can run in parallel and owns patch discovery and navigation foundations in
  `apps/server/src/contracts.ts`, `apps/server/src/db/repository.ts`, a dedicated route
  module, `apps/client/src/network/canonicalWorld.ts`, and isolated UI components with
  focused tests
* Phase 3C must run after 3A and 3B and serially integrates both paths in
  `apps/server/src/index.ts` and `apps/client/src/App.tsx`, then updates canonical fixtures
  and runs the multi-replica and canonical UX acceptance suites

If route and UI extraction are not accepted, mark all of Phase 3 sequential. Do not claim
parallel execution while both workstreams directly edit the current monolithic owners.

### Exact Retirement Telemetry and Report Contract

#### Typed terminal event envelope

Replace the open-ended canonical additions proposed for `QuiltTelemetryEvent` with a
discriminated union. Preserve the existing event variants unchanged and add canonical
variants with this common envelope:

```ts
type CanonicalTelemetryBase = {
  schemaVersion: 1
  eventId: string
  attemptId: string
  occurredAt: string
  quiltId: string
  canonicalGeneration: number
  cohort: 'canary' | 'global'
}
```

`eventId` and `attemptId` are UUIDs. `occurredAt` is a UTC ISO 8601 timestamp generated by
the server when it accepts or creates the terminal event. `canonicalGeneration` is a
positive safe integer copied from the descriptor or server connection context. Raw
principal IDs remain available only on the existing internal telemetry envelope for
diagnosis; they are not part of the canonical report key or output.

Emit exactly one terminal event for each `(name, attemptId)`. Exact duplicate `eventId`
records are ignored by the report reader. Conflicting duplicates, invalid timestamps,
non-finite measurements, unknown fields, and two terminal records for one
`(name, attemptId)` make report generation fail closed.

Use these exact canonical variants:

```ts
type CanonicalDiscoveryTelemetry = CanonicalTelemetryBase & {
  name: 'canonical_discovery'
  outcome: 'success' | 'unavailable' | 'error'
  durationMs: number
  httpStatus: 200 | 503 | 500
  reasonCode?: 'missing' | 'inactive' | 'invalid_target' | 'internal_error'
}

type CanonicalEntryTelemetry = CanonicalTelemetryBase & {
  name: 'canonical_entry'
  outcome:
    | 'ready'
    | 'discovery_failed'
    | 'protocol_rejected'
    | 'connection_failed'
    | 'initial_sync_failed'
  durationMs: number
  selectedProtocolVersion?: 1 | 2
}

type CanonicalReconnectTelemetry = CanonicalTelemetryBase & {
  name: 'canonical_reconnect'
  outcome: 'recovered' | 'exhausted'
  durationMs: number
  attempts: number
}

type CanonicalResubscribeTelemetry = CanonicalTelemetryBase & {
  name: 'canonical_resubscribe'
  outcome: 'completed' | 'failed'
  durationMs: number
  requestedRooms: number
  acceptedRooms: number
  rejectedRooms: number
  resyncRequired: number
}

type CanonicalOldClientRejectedTelemetry = CanonicalTelemetryBase & {
  name: 'canonical_old_client_rejected'
  outcome: 'rejected'
  transport: 'http' | 'socket'
  requestedSchemaVersion?: string
  requestedProtocolVersion?: number
}

type CanonicalSafetyTelemetry = CanonicalTelemetryBase & {
  name: 'canonical_safety'
  outcome: 'detected'
  code: 'descriptor_leak' | 'target_invalidated'
  requestId?: string
}
```

All durations and counts are finite, nonnegative numbers; `attempts` and room counts are
safe integers. Outcome and status combinations are exhaustive: discovery `success` is 200,
`unavailable` is 503, and `error` is 500. A ready entry must have
`selectedProtocolVersion: 2`. Recording `ready` with protocol 1 remains valid input only so
the report can trigger the immediate rollback invariant.

Extend `QuiltClientRuntimeMetrics` with `sampleId`, `entryAttemptId`, and
`canonicalGeneration`. The server accepts a sample only when quilt, generation, and entry
attempt match the authenticated protocol-V2 socket context. It then emits the existing
`client_runtime` measurements with `schemaVersion`, `eventId: sampleId`,
`attemptId: entryAttemptId`, server `occurredAt`, generation, and cohort. This reuses the
current `quilt_client_runtime_metrics` transport and prevents clients from assigning the
report cohort or quilt.

Terminal ownership is explicit:

* The canonical discovery HTTP handler emits `canonical_discovery` in a `finally` path
* The client reports entry, reconnect, and resubscribe terminal payloads over one typed
  authenticated Socket.IO telemetry event; the server validates and emits them
* The HTTP retirement handlers and socket handshake rejection path emit
  `canonical_old_client_rejected`
* Canonical descriptor authorization checks and periodic target validation emit
  `canonical_safety` only when they positively detect leakage or invalidation
* Client runtime sampling continues through `quilt_client_runtime_metrics`

#### Deterministic report input and output

Keep `configureQuiltTelemetry()` as the process observer and the existing
`quilt_migration_<name>` structured log path. Production evidence is supplied to the
reporter as UTF-8 NDJSON containing the JSON event object from those structured log lines,
exported from the deployment log store for an explicit UTC interval. The reporter never
queries live application state and never accepts aggregate dashboard values.

Add an offline command with this interface:

```text
npm run telemetry:canonical-retirement -- --input <events.ndjson> --output <report.json> --from <utc> --to <utc>
```

Sort accepted input by `occurredAt`, then `eventId`; hash the original input bytes with
SHA-256; and write canonical JSON with recursively sorted object keys and a trailing
newline. The report contract is:

```ts
type CanonicalRetirementReportV1 = {
  schemaVersion: 1
  reportType: 'canonical-retirement'
  generatedAt: string
  observationWindow: {
    from: string
    to: string
    durationSeconds: number
  }
  evidence: {
    inputSha256: string
    acceptedEvents: number
    exactDuplicatesIgnored: number
  }
  thresholds: {
    minimumWindowSeconds: 86400
    minimumAuthenticatedEntryAttempts: 100
    minimumDiscoverySuccessRate: 0.995
    minimumReadyEntryRate: 0.99
    maximumAcceptedV1Entries: 0
    minimumReconnectRecoveryRate: 0.99
    maximumReconnectRecoveryP95Ms: 10000
    maximumResyncsPerReadyEntry: 0.01
    maximumFrameTimeP95Ms: 33.3
    rollbackWindowSeconds: 300
    rollbackMinimumAttempts: 20
    rollbackMaximumFailureRate: 0.02
  }
  groups: CanonicalRetirementGroup[]
  immediateRollbackTriggers: Array<{
    code: 'accepted_v1_entry' | 'descriptor_leak' | 'target_invalidated'
    occurredAt: string
    eventId: string
    canonicalGeneration: number
    cohort: 'canary' | 'global'
  }>
  rollbackWindows: Array<{
    metric: 'discovery_failure' | 'entry_failure' | 'reconnect_exhaustion'
    from: string
    to: string
    attempts: number
    failures: number
    rate: number
    canonicalGeneration: number
    cohort: 'canary' | 'global'
  }>
  decision: {
    eligible: boolean
    measuredWindowApproved: boolean
    clientBudgetPassed: boolean
    recommendation: 'promote' | 'hold' | 'rollback'
    failedChecks: string[]
  }
}
```

Set `generatedAt` equal to `observationWindow.to`; do not use report execution time. This
keeps the complete report byte-identical for the same input bytes and command arguments.

Each `CanonicalRetirementGroup` is keyed by `canonicalGeneration` and `cohort` and contains
event counts, the discovery success rate, ready entry rate, accepted V1 count, reconnect
recovery rate, recovered reconnect p95 milliseconds, summed `resyncRequired` per ready
entry, client frame sample count, and frame-time p95 milliseconds. Rates use terminal event
counts as denominators. Entry attempts are distinct terminal `canonical_entry` attempts.
Reconnect p95 uses recovered reconnect durations. Percentiles use nearest rank: sort
ascending and select index `ceil(0.95 * count) - 1`.

The report is eligible only when the whole interval is at least 86,400 seconds, contains at
least 100 distinct authenticated entry attempts, contains at least one runtime frame
sample, and every event generation resolves to a report group. Every group must pass every
applicable selected threshold. `clientBudgetPassed` means all groups have frame-time p95 at
most 33.3 ms. `measuredWindowApproved` means eligibility and all remaining numeric checks
pass with no rollback trigger.

Evaluate five-minute rollback windows independently per generation, cohort, and metric.
For every terminal event timestamp `t`, evaluate the half-open interval `(t - 300s, t]`;
record a rollback window when its metric has at least 20 attempts and failures divided by
attempts is greater than 0.02. Any such window yields `rollback`. Any accepted V1 ready
entry also yields `rollback`. Descriptor leakage and target invalidation require explicit
server-generated security/invalidation telemetry records using the common envelope; they
must not be inferred from missing events.

Store `events.ndjson`, `report.json`, and `report.json.sha256` together as immutable release
evidence in the deployment pipeline's retained artifact store. The repository stores only
fixtures and report schema tests, never production telemetry or reports. Production is
supplied the approved report as a read-only mounted file through
`LEGACY_RETIREMENT_REPORT_PATH` and its expected digest through
`LEGACY_RETIREMENT_REPORT_SHA256`.

`loadLegacyRetirementGates()` must derive `measuredWindowApproved` and
`clientBudgetPassed` from the parsed, digest-matched report rather than two free-standing
boolean environment variables. `validateProductionRolloutGates()` must reject
`FEATURE_LEGACY_RETIREMENT_REQUESTED=true` when the path or digest is absent, the report is
invalid, its recommendation is not `promote`, or either derived gate is false. The other
existing parity, recovery, multi-replica, authenticated-principal, and rollback-policy
approvals remain independent gates.

### Exact Canonical Provisioner Contract

#### Command and arguments

Extend the previously selected action-oriented command with a `provision` action:

```text
npm run db:canonical-world -- --action provision --expected-generation 0 --patch-rows <integer> --patch-columns <integer> --patch-width <number> --patch-height <number> --origin-x <number> --origin-y <number> --operator-id <text> --reason <text>
```

`--origin-x` and `--origin-y` are required so production geometry is explicit. Rows and
columns must be positive safe integers. Width, height, and origins must be finite; width
and height must be greater than zero. `--expected-generation` must be exactly `0` for
provision. Reject unknown, duplicate, missing, empty, and action-incompatible arguments
before opening the database. Keep `status`, `activate`, and `deactivate` invocations and
the root/workspace scripts already specified above.

#### Identity and complete creation

Provision under the stable product key `canonical`. Generate `canvasId`, `quiltId`, and
all patch IDs once with UUID v4 inside the locked transaction. Random identity is correct
here because the pointer is the idempotency record: after commit, retries read and return
the persisted IDs. Do not derive IDs from mutable dimensions, operator identity, or a
deployment name.

Within one transaction, create exactly this graph:

1. One compatibility `canvases` row with version 0 and `canvas_config.canvasSize` equal to
   `patchColumns * patchWidth` by `patchRows * patchHeight`; its bounds policy is
   `{ "mode": "unbounded" }`.
2. One `quilts` row linked by `legacy_canvas_id`, with the supplied dimensions and origin,
   topology `toroidal`, and protocol version 2.
3. Exactly one patch for every row-major address from `(0, 0)` through
   `(patchRows - 1, patchColumns - 1)`, each unclaimed, ownerless, and revision 0.
4. Exactly one visibility policy per patch. All six surfaces are `authenticated`,
   `claimEnabled` is true, and `policyVersion` is 1.
5. One inactive canonical pointer to the quilt at generation 1. Initial location is the
   persisted patch at row 0, column 0.

Create no principal, membership, tile, operation, snapshot, spatial reference, or presence
row. Before commit, run the same canonical validator used by activation and discovery;
require the exact patch and policy counts, every coordinate, valid lifecycle and baseline
policy, protocol 2, toroidal topology, compatibility alias consistency, and row-0/column-0
initial patch.

#### Locking, replay, and activation

Open a transaction, acquire
`pg_advisory_xact_lock(hashtext('canonical-world'), hashtext('canonical'))`, and read the
pointer only after the lock. If absent and expected generation is 0, create the complete
graph and inactive generation-1 pointer. Any failure rolls back every created row.

If an inactive generation-1 pointer already references a fully valid target whose complete
geometry and baseline policies exactly match the supplied provision arguments, return the
persisted result with `idempotent: true` and perform no writes. This covers a retry after an
unknown commit result. A mismatched target, active pointer, generation other than 1, or
invalid target is a conflict; do not repair, replace, or delete it. Concurrent provision
calls therefore produce one creation and either an exact idempotent replay or a conflict.

Provisioning never activates entry. Activate the returned target separately:

```text
npm run db:canonical-world -- --action activate --quilt-id <returned-quilt-id> --expected-generation 1 --operator-id <id> --reason <text>
```

That existing CAS action revalidates the entire target, changes the pointer to active, and
increments generation to 2. Repeating the same activation returns generation 2 with
`idempotent: true`; activation of another quilt or stale non-equivalent intent conflicts.
Discovery remains side-effect free and returns unavailable while the provisioned pointer
is inactive.

#### Machine output and exits

Write one JSON object to stdout for `status`, success, and idempotent replay:

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

Use `result: "idempotent"` and `idempotent: true` on replay. Numeric examples above are
placeholders for supplied values. Write one safe JSON error to stderr with
`schemaVersion`, `action` when parsed, `result: "failed"`, `code`, and `message`. Codes are
`usage_error`, `generation_conflict`, `target_invalid`, or `database_error`; do not include
connection strings, SQL, or stack traces. Exit 0 for status, success, and idempotent replay;
exit 1 for every failure. Set `process.exitCode` and close the shared database bundle in
`finally`, matching existing CLI lifecycle conventions.

### Exact HTTP 426 Retirement Response

After compatibility retirement, both `GET /sessions` and `POST /sessions` return this
response for an authenticated principal:

```http
HTTP/1.1 426 Upgrade Required
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
Upgrade: zzyix/2.0
```

```json
{
  "code": "client_upgrade_required",
  "message": "This client version is no longer supported.",
  "requestId": "<request-id>",
  "minimumSchemaVersion": "2.0.0",
  "minimumProtocolVersion": 2
}
```

Define a specialized response type extending the current safe error shape with the two
public version constants. `Upgrade: zzyix/2.0` satisfies the HTTP 426 requirement to name
the required protocol; `Cache-Control: no-store` prevents authenticated compatibility
responses from being retained. Do not include session IDs, target state, principal data,
internal validation reasons, or `Retry-After`.

The exact HTTP order is request ID, CORS/preflight, request logging, bearer-token
verification, principal resolution/status enforcement, and only then the endpoint-level
426 response. An unauthenticated or invalid caller therefore receives the existing safe
401 response and `WWW-Authenticate: Bearer`; an authenticated but unauthorized principal
retains the existing 403 behavior. Remove `sessionCreateRateLimit` from the retired POST
path so an authenticated old client deterministically receives 426 rather than 429. The
handlers must not list sessions, validate a create payload, allocate IDs, or open a
database creation transaction before returning 426.

## Evidence

### Primary and Related Artifacts

* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* `.copilot-tracking/research/subagents/2026-07-29/infinite-canvas-convergence-research.md`
* `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`
* `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md`
* `.copilot-tracking/reviews/2026-07-29/canonical-infinite-canvas-convergence-plan-review.md`
* `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`

### Implementation Owners

* `apps/client/Dockerfile`
* `apps/client/public/auth-config.json`
* `apps/client/public/auth-config.template.json`
* `apps/client/src/App.tsx`
* `apps/client/src/auth/AuthProvider.tsx`
* `apps/client/src/config/runtimeConfig.ts`
* `apps/client/src/network/session.ts`
* `apps/client/src/network/useSocketConnection.ts`
* `apps/client/src/auth/AuthSessionProvider.tsx`
* `apps/client/src/auth/TestAuthProvider.tsx`
* `apps/client/src/ui/LobbyScreen.tsx`
* `apps/server/src/contracts.ts`
* `apps/server/src/index.ts`
* `apps/server/src/auth/errors.ts`
* `apps/server/src/auth/httpAuth.ts`
* `apps/server/src/db/schema.ts`
* `apps/server/src/db/repository.ts`
* `apps/server/src/db/migrate.ts`
* `apps/server/src/db/quiltBackfill.ts`
* `apps/server/src/domain/authorizationPolicy.ts`
* `apps/server/src/migration/quiltTelemetry.ts`
* `apps/server/src/migration/quiltRollout.ts`
* `apps/server/src/operations/principalRecoveryCli.ts`
* `apps/server/src/startup/rolloutGates.ts`
* `apps/server/src/realtime/quiltRooms.ts`
* `apps/server/src/test/postgresTestDatabase.ts`
* `apps/server/migrations/0005_finite_toroidal_quilt.sql`
* `apps/server/migrations/0006_authentication_authorization.sql`
* `apps/server/migrations/meta/_journal.json`
* `e2e/support/multiReplicaDatabase.ts`
* `e2e/support/multiReplicaGlobalTeardown.ts`
* `e2e/support/startMultiReplicaServer.ts`
* `package.json`
* `playwright.multi-replica.config.ts`
* `.github/workflows/cd.yml`
* `scripts/release-contract.test.mjs`
* `scripts/verify-quilt-migration.sh`

### Test Evidence

* `apps/client/src/App.test.tsx`
* `apps/client/src/config/runtimeConfig.test.ts`
* `apps/client/src/network/useSocketConnection.test.ts`
* `apps/client/src/domain/quiltCache.test.ts`
* `apps/server/src/auth/httpAuth.test.ts`
* `apps/server/src/contracts.test.ts`
* `apps/server/src/index.test.ts`
* `apps/server/src/index.integration.test.ts`
* `apps/server/src/db/migrate.test.ts`
* `apps/server/src/db/schema.test.ts`
* `apps/server/src/db/schema.postgres.integration.test.ts`
* `apps/server/src/db/ownership.postgres.integration.test.ts`
* `apps/server/src/db/recovery.postgres.integration.test.ts`
* `apps/server/src/migration/quiltTelemetry.test.ts`
* `apps/server/src/migration/quiltRollout.test.ts`
* `apps/server/src/startup/rolloutGates.test.ts`
* `e2e/quilt-reconnect.spec.ts`
* `e2e/quilt-seams.spec.ts`
* `scripts/release-contract.test.mjs`

## Remaining Gaps

* Production database inventory and whether any valid toroidal protocol-V2 quilt exists
* Canonical topology dimensions and target selection
* Patch discovery, canonical navigation, minimap, search, and deep-link product contracts
* Replica-wide presence model and stale-membership recovery
* Approval or revision of the recommended numeric promotion and rollback thresholds
* One-active-patch and global claim-rate-window policy after canonical convergence

## Clarifying Questions

* Does “infinite” definitively mean the existing finite torus, and what immutable row,
  column, patch-width, and patch-height values should production use?
* Is one active patch per principal per quilt still intended, and should global claim-rate
  windows remain global after all supported users enter one quilt?
* Which presence truth is required across tabs and replicas: durable participant rows,
  adapter-backed ephemeral membership, or another shared lease model?