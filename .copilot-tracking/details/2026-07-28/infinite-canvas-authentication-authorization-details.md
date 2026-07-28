<!-- markdownlint-disable-file -->
# Implementation Details: Infinite-Canvas Authentication and Authorization

## Context Reference

Sources: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`, `.copilot-tracking/research/subagents/2026-07-28/infinite-canvas-auth-plan-verification-research.md`, `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`, and confirmed product decisions from the conversation.

## Implementation Phase 1: Provider and Release Prerequisites

<!-- parallelizable: false -->

### Step 1.1: Validate External ID and fix the public configuration contract

Verify that the target Azure subscription can host a Microsoft Entra External ID external tenant with the required branding, domain, and sign-in methods. Register the SPA as a public client and the zzyix API with one delegated access scope. Record the exact authority, trusted issuer, API audience, scope, redirect URIs, and logout URIs without committing secrets. Use a runtime-generated public configuration document for authority, SPA client ID, API scope, and API origin so one client image can move between environments.

Files:
* `apps/client/public/auth-config.template.json` - Public runtime configuration template with placeholders
* `apps/client/src/config/runtimeConfig.ts` - Validated runtime configuration loader
* `apps/client/Dockerfile` - Runtime substitution for public auth configuration
* `apps/client/nginx.conf` - Serve the generated configuration without long-lived caching
* `.github/workflows/cd.yml` - Supply environment-specific public and server identity settings
* `apps/client/README.md` - Local and deployed External ID registration settings
* `apps/server/README.md` - Trusted issuer, audience, scope, and JWKS settings

Discrepancy references:
* `DR-01` - Target-subscription capabilities require external validation

Success criteria:
* The issuer, audience, delegated scope, authority, client ID, and redirect/logout URIs are recorded per environment
* The client image receives no secret and can change public identity settings without recompilation
* Deployment fails clearly when required identity settings are absent

Context references:
* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` (Lines 105-126) - Selected identity architecture and configuration
* `.copilot-tracking/research/subagents/2026-07-28/infinite-canvas-auth-plan-verification-research.md` (Lines 220-241) - Deployment configuration gap

Dependencies:
* Access to the target Azure subscription and External ID tenant administration
* Product confirmation of supported sign-in methods and branding

### Step 1.2: Repair migration metadata and establish release-owned migration execution

Reconcile the Drizzle journal and snapshots through migration 0005 before generating identity-policy schema. Add one release-owned Container Apps job or equivalent workflow step that runs `db:apply` before replicas depending on the new schema are deployed. Keep production application startup verification-only and define retry, failure, and rollback behavior.

Files:
* `apps/server/migrations/meta/_journal.json` - Correct migration sequence
* `apps/server/migrations/meta/0003_snapshot.json` - Restored reviewed snapshot
* `apps/server/migrations/meta/0004_snapshot.json` - Restored reviewed snapshot
* `apps/server/migrations/meta/0005_snapshot.json` - Restored reviewed snapshot
* `apps/server/src/db/migrate.ts` - Preserve apply versus startup verification boundaries
* `.github/workflows/cd.yml` - Run one migration owner before server rollout
* `scripts/verify-quilt-migration.sh` - Rehearse the expanded migration sequence

Discrepancy references:
* `DR-02` - Existing snapshots stop at 0002 while the journal reaches 0005

Success criteria:
* A fresh database and an upgraded 0005 database reach the same reviewed schema
* Exactly one release step applies migrations before incompatible replicas start
* Replica startup detects but never races production DDL

Dependencies:
* Step 1.1 server configuration contract
* Disposable PostgreSQL databases for fresh and upgrade rehearsals

### Step 1.3: Decompose runtime identity and patch policy backlog

Narrow GitHub issue 14 to runtime authentication transport: token verification, protected HTTP and Socket.IO, `/me`, CORS, renewal, logout, safe failures, and test-isolation criteria. Move principal lifecycle, persisted visibility, claims, ownership lifecycle, audit, and owner-only protocol-v2 mutation acceptance to named issue 94 children. Link issue 14 and the owner-only mutation child as dependencies, and leave delegated grants and moderator commands in separate blocked follow-on work. Record issue 98's owner-only versus delegated E2E split without closing unmet delegated criteria.

Files:
* GitHub issue 14 - Runtime identity scope and acceptance criteria
* GitHub issue 94 children - Principal, policy, ownership, audit, and mutation work
* GitHub issue 98 - Owner-only and deferred-delegation E2E treatment

Discrepancy references:
* `DR-05` - Issue 98 mixes initial and deferred acceptance
* `DR-06` - Issues 14 and 94 require an executable split

Success criteria:
* Every implementation phase maps to one issue 14 criterion or a named issue 94 child
* Dependency links keep mutation blocked on identity, policy, ownership, and authenticated E2E
* Delegated and moderator acceptance remains open and visibly deferred

Dependencies:
* Repository issue-owner access
* Confirmed initial-release product decisions

### Step 1.4: Validate prerequisite phase

Validation commands:
* `npm run build:server` - Migration runner type validation
* `./scripts/verify-quilt-migration.sh rehearse` - Fresh, upgrade, parity, and rollback rehearsal
* `npm run build:client` - Runtime configuration loading and image-input validation

### Step 1.5: Resolve Phase 1 release-contract review findings

Prevent overlapping migration executions when CD runs are superseded, and reassert and verify manual trigger, parallelism one, completion count one, timeout, and retry settings for existing migration jobs. Generate and parse runtime authentication configuration with a JSON-aware mechanism, preserve exact redirect and logout URI strings, and define the browser-reachable API as same-origin nginx proxying to the internal server ingress. Add focused automated release-contract checks for migration workflow semantics, runtime JSON generation, URI preservation, and nginx routing. Ensure migration rehearsal temporary directories are removed on failure, handle help before database prerequisites, and reconcile the bootstrap helper files in the changes log.

Files:
* `.github/workflows/cd.yml` - Prevent migration overlap and reconcile job safety settings
* `apps/client/Dockerfile` - Generate and validate runtime JSON safely
* `apps/client/nginx.conf` - Define same-origin API proxy coverage
* `apps/client/src/config/runtimeConfig.ts` - Preserve exact registered redirect and logout URIs
* `apps/client/src/config/runtimeConfig.test.ts` - Cover runtime parsing and URI preservation
* `scripts/verify-quilt-migration.sh` - Clean temporary prefixes and make help dependency-free
* Release-contract test files - Cover workflow, container, and nginx invariants
* Phase 1 documentation and tracking artifacts - Record routing and helper-file changes

Success criteria:
* A superseded CD run cannot overlap its migration execution with a replacement release
* Existing and new migration jobs use and verify the same single-owner safety settings
* Runtime configuration remains valid JSON for representative special characters and fails before nginx starts when invalid
* Redirect and logout URIs retain their exact validated strings, including trailing slashes
* Browser API traffic uses documented same-origin nginx routes to internal server ingress
* Focused release-contract tests exercise the corrected behavior
* Migration rehearsal cleans temporary resources on success and failure, and `--help` requires no database tooling

Context references:
* `.copilot-tracking/reviews/quality/2026-07-28/infinite-canvas-authentication-authorization-plan-quality.md` - Findings Q-001 through Q-007
* `.copilot-tracking/reviews/2026-07-28/infinite-canvas-authentication-authorization-plan-review.md` - Phase 1 rework requirement

Dependencies:
* Completed repository-controlled portions of Steps 1.1 through 1.4

## Implementation Phase 2: Identity Persistence and Verification

<!-- parallelizable: false -->

### Step 2.1: Add principal lifecycle, mapping, audit, ownership, and visibility schema

Add explicit principal lifecycle status and deletion timestamps, reverse uniqueness for the initial one-to-one external mapping rule, authorization audit events, durable claim quota records, pending ownership transfers, and explicit patch visibility policy. Preserve internal principal UUIDs as immutable foreign keys and do not store raw tokens or external subjects in general audit records. Define schema extension points without adding delegated grants or moderator commands.

Files:
* `apps/server/src/db/schema.ts` - Lifecycle, mapping uniqueness, audit, claim, transfer, and visibility tables and constraints
* `apps/server/src/db/types.ts` - Domain-safe persistence types
* `apps/server/migrations/0006_authentication_authorization.sql` - Additive identity and policy migration
* `apps/server/migrations/meta/_journal.json` - Migration journal entry
* `apps/server/migrations/meta/0006_snapshot.json` - Reviewed schema snapshot
* `apps/server/src/db/schema.test.ts` - Constraint and default coverage

Discrepancy references:
* `DD-01` - Persist visibility now instead of extending derived lifecycle matrices

Success criteria:
* Only active principals can be authorized
* Exact issuer/subject tuples and reverse principal mappings are unique for the initial release
* Claims, transfers, lifecycle changes, and denied decisions can be audited independently of patch operations
* Fine data, aggregates, presence, search, and durable events resolve from one persisted policy model

Dependencies:
* Phase 1 migration history and release job
* Approved audit and pseudonymous-attribution retention gates before production rollout

### Step 2.2: Implement verified-token and principal-context boundaries

Install `jose` and add focused modules for configuration, remote-JWKS validation, safe auth errors, and principal context. Pin exact trusted issuer, audience, asymmetric algorithms, and delegated scope. Validate signature, lifetime, not-before, and scope; return only canonical issuer, subject, expiry, and validated claims needed for provisioning. Permit a local signed test issuer only when both `NODE_ENV=test` and `E2E_TEST_MODE=true`, and reject test configuration at production startup.

Files:
* `apps/server/package.json` - Add `jose`
* `package-lock.json` - Lock dependency graph
* `apps/server/src/auth/config.ts` - Validated issuer and test-gate configuration
* `apps/server/src/auth/tokenVerifier.ts` - JWT and JWKS validation
* `apps/server/src/auth/errors.ts` - Stable safe error mapping
* `apps/server/src/auth/tokenVerifier.test.ts` - Token, key rotation, and outage matrix

Success criteria:
* Wrong issuer, audience, algorithm, scope, signature, lifetime, or key fails closed
* Cached trusted keys validate only otherwise-valid unexpired tokens during an outage
* Unknown keys never extend token lifetime or authorization
* Production startup rejects local issuer keys and E2E bypass settings

Context references:
* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` (Lines 129-163) - Stable identity requirements and outage behavior

Dependencies:
* Step 1.1 exact issuer, audience, algorithm, and scope

### Step 2.3: Implement transactional principal resolution and lifecycle enforcement

Resolve exact `(issuer, subject)` mappings to internal principals or provision both records atomically on first use. Serialize concurrent first use, reject reverse conflicts, never merge by email, and reject disabled, deletion-pending, or deleted principals even when the token is valid. Return a narrow server-owned principal context for downstream policy evaluation.

Files:
* `apps/server/src/auth/principalContext.ts` - Verified identity to internal principal boundary
* `apps/server/src/db/repository.ts` - Atomic mapping, provisioning, and lifecycle commands
* `apps/server/src/db/principal.postgres.integration.test.ts` - Concurrency, conflicts, and lifecycle enforcement

Success criteria:
* Concurrent first use creates one principal and one mapping
* The same subject under another issuer is a distinct identity
* Email or display-name similarity never merges principals
* Local disable blocks access before provider-token expiry

Dependencies:
* Steps 2.1 and 2.2

### Step 2.4: Validate identity phase

Validation commands:
* `npm exec --workspace=apps/server -- vitest run src/auth src/db/principal.postgres.integration.test.ts` - Token and principal behavior
* `npm run lint:server` - Static validation
* `npm run build:server` - Server type and module validation

## Implementation Phase 3: Protected HTTP, Socket, and Visibility Boundaries

<!-- parallelizable: false -->

### Step 3.1: Protect HTTP resources and expose safe principal context

Add reusable Express bearer middleware, typed request context, `GET /me`, and stable errors. Protect session/quilt listing and creation, snapshots, claims, transfers, abandonment, and account lifecycle routes. Allow `GET /health` to remain anonymous only while it exposes no content or identity. Add `Authorization` to exact-origin CORS preflight. Return indistinguishable `404 resource_not_found` responses for nonexistent and nonvisible domain resources.

Files:
* `apps/server/src/auth/httpAuth.ts` - Bearer parsing and request context
* `apps/server/src/contracts.ts` - Safe profile, capability, and error contracts
* `apps/server/src/index.ts` - Protected routes, `/me`, CORS, and safe failures
* `apps/server/src/db/repository.ts` - Principal-filtered catalog and snapshot queries
* `apps/server/src/index.integration.test.ts` - HTTP auth, CORS, status, and disclosure coverage

Success criteria:
* Anonymous callers can access sign-in assets and health but no quilt catalog or content
* `/me` exposes no external subject or client-authoritative principal ID
* Protected routes distinguish authentication and global account status without revealing hidden resources

Dependencies:
* Phase 2 principal context

### Step 3.2: Authenticate Socket.IO and enforce expiry

Extend connection auth with a bearer token, verify and resolve it in async `io.use`, and write only server-derived principal ID and token expiry to socket data. Schedule disconnect no later than expiry. Authenticate before session/quilt lookup, room resolution, snapshots, presence, telemetry, replay, or mutation. Remove `testPrincipalId` and route tests through the double-gated local issuer.

Files:
* `apps/server/src/contracts.ts` - Token handshake and socket principal metadata
* `apps/server/src/auth/socketAuth.ts` - Socket middleware and expiry scheduling
* `apps/server/src/index.ts` - Install middleware before protected handlers
* `apps/server/src/index.integration.test.ts` - Transport, origin, expiry, and reconnect coverage

Success criteria:
* Polling and WebSocket connections require a valid active principal
* Sockets disconnect no later than token expiry and reconnect only with a fresh token
* Protected resource existence is not resolved before authentication
* No production or E2E contract accepts `testPrincipalId`

Dependencies:
* Phase 2

### Step 3.3: Centralize persisted visibility policy

Replace lifecycle-derived and anonymous aggregate rules with one policy evaluator backed by persisted visibility and membership. Apply it to catalogs, snapshots, aggregate counts, presence, search, durable replay, room resolution, and later mutation. Keep member read access separate from owner mutation authority.

Files:
* `apps/server/src/domain/authorizationPolicy.ts` - Central policy input and decision model
* `apps/server/src/domain/authorizationPolicy.test.ts` - Lifecycle, role, and surface matrix
* `apps/server/src/realtime/quiltRooms.ts` - Consume central decisions
* `apps/server/src/realtime/quiltRooms.test.ts` - Remove anonymous aggregate expectations
* `apps/server/src/db/repository.ts` - Policy-backed catalog and delivery queries
* `apps/server/src/index.ts` - Use decisions consistently across transports

Success criteria:
* Every protected read and subscription surface uses the same policy version
* Anonymous aggregate, presence, search, snapshot, and replay access is denied
* Members may read only policy-authorized surfaces and gain no mutation authority

Dependencies:
* Step 2.1 visibility schema
* Steps 3.1 and 3.2 transport contexts

### Step 3.4: Validate protected-boundary phase

Validation commands:
* `npm exec --workspace=apps/server -- vitest run src/domain/authorizationPolicy.test.ts src/realtime/quiltRooms.test.ts src/index.integration.test.ts` - Policy and transport boundaries
* `npm run lint:server` - Static validation
* `npm run build:server` - Server build

## Implementation Phase 4: Client Authentication Lifecycle

<!-- parallelizable: false -->

### Step 4.1: Add MSAL provider and authenticated network client

Install MSAL Browser and MSAL React, load public runtime configuration, and initialize authorization code with PKCE. Add one token-acquisition boundary for protected fetches and Socket.IO connections. Hydrate internal profile and capabilities only from `/me`; keep `clientId` as independent ephemeral presence identity.

Files:
* `apps/client/package.json` - Add MSAL packages
* `package-lock.json` - Lock dependency graph
* `apps/client/src/auth/msalConfig.ts` - Public-client configuration
* `apps/client/src/auth/AuthProvider.tsx` - Provider and redirect lifecycle
* `apps/client/src/auth/useAuthSession.ts` - Token and `/me` state machine
* `apps/client/src/network/authenticatedFetch.ts` - Bearer fetch wrapper
* `apps/client/src/network/session.ts` - Protected catalog calls
* `apps/client/src/main.tsx` - Provider composition

Success criteria:
* The SPA uses PKCE and contains no client secret
* Catalog loading waits for successful authentication and `/me`
* Internal principal context comes only from the server

Dependencies:
* Step 1.1 runtime configuration
* Step 3.1 `/me` and protected HTTP routes

### Step 4.2: Renew sockets once and clear protected state on auth loss

Send current access tokens through `auth.token`. On authentication failure or expiry, attempt one silent renewal and recreate the socket. Stop retries for interaction-required or repeated failures. Centralize protected-state clearing for sessions, selected quilt, cache, snapshots, cursors, collaborators, optimistic operations, undo data, drafts, and transport state before returning to sign-in.

Files:
* `apps/client/src/network/useSocketConnection.ts` - Token generation, renewal, and reconnect
* `apps/client/src/network/useSocketConnection.test.ts` - Valid, expiry, renewal, and stop behavior
* `apps/client/src/App.tsx` - Auth gate and centralized protected-state reset
* `apps/client/src/App.test.tsx` - No-load-before-auth and complete clearing coverage
* `apps/client/src/ui/LobbyScreen.tsx` - Sign-in and account-state surfaces
* `apps/client/src/ui/AppHeader.tsx` - Safe profile and sign-out command

Success criteria:
* Expired authentication cannot leave protected pixels, data, presence, undo state, or drafts visible
* One silent renewal can restore the connection without mixing principal state
* Interaction-required failures stop retry loops and show sign-in

Dependencies:
* Step 4.1
* Step 3.2 socket expiry contract

### Step 4.3: Validate client authentication phase

Validation commands:
* `npm exec --workspace=apps/client -- vitest run src/auth src/network src/App.test.tsx` - Auth, network, and state-clearing behavior
* `npm run lint:client` - Static validation
* `npm run build:client` - Client build

## Implementation Phase 5: Claims and Ownership Lifecycle

<!-- parallelizable: false -->

### Step 5.1: Implement atomic claims and quotas

Add a command that locks the target patch and quota records, rechecks active human principal status, unclaimed patch lifecycle, persisted claim-enabled policy, and all approved limits. Atomically set ownership, create owner membership, consume quota, and audit the result. Use an operation ID for idempotency and guarantee one winner under concurrent claims. Do not add admission, terms-acceptance, or moderation-hold predicates until those product concepts have authoritative contracts.

Files:
* `apps/server/src/db/repository.ts` - Claim transaction and quota checks
* `apps/server/src/db/schema.ts` - Persisted patch claim-enabled policy
* `apps/server/src/contracts.ts` - Claim request and safe acknowledgement
* `apps/server/src/index.ts` - Protected claim route or event
* `apps/server/src/db/ownership.postgres.integration.test.ts` - Claim concurrency, quotas, and audit

Success criteria:
* One active patch per principal per quilt is enforced
* More than three attempts per 10 minutes or one success per 24 hours across quilts is rejected safely
* Concurrent eligible claimants produce exactly one owner and complete audit records

Dependencies:
* Phases 2 and 3

### Step 5.2: Implement accepted transfer and abandonment

Add idempotent transfer creation, acceptance, cancellation, and expiry commands. Only the active intended recipient may accept within seven days; ownership changes only in that acceptance transaction. Add owner abandonment that returns a patch to unclaimed and removes owner membership atomically. Audit every attempt and transition.

Files:
* `apps/server/src/db/repository.ts` - Transfer and abandonment commands
* `apps/server/src/contracts.ts` - Transfer and abandonment contracts
* `apps/server/src/index.ts` - Protected ownership routes or events
* `apps/server/src/jobs/ownershipLifecycle.ts` - Pending-transfer expiry
* `apps/server/src/jobs/ownershipLifecycle.test.ts` - Expiry orchestration
* `apps/server/src/db/ownership.postgres.integration.test.ts` - Transaction coverage

Success criteria:
* Creating an offer never changes ownership
* Only the intended active recipient can accept before expiry
* Abandonment leaves one unclaimed patch with no owner membership

Dependencies:
* Step 5.1 ownership path

### Step 5.3: Implement recoverable account deletion and restricted operational recovery

Immediately set deletion-requesting principals to deletion pending and block all access. Permit self-service recovery for 30 days. Before completion, require all owned patches to be transferred or abandoned; do not invent forced ownership resolution. At completion, remove the external mapping and personal profile, mark the principal deleted, and preserve only approved pseudonymous attribution and audit. Add an offline break-glass command, unavailable from HTTP and Socket.IO, that can recover a deletion-pending account or cancel a pending transfer but can never assign ownership. Restrict invocation through deployment-operator Azure RBAC and require immutable operator ID, approved support ticket, reason, before/after state, and audit event. Treat unresolved ownership and retention duration as fail-closed release gates.

Files:
* `apps/server/src/db/repository.ts` - Begin, recover, and complete deletion commands
* `apps/server/src/contracts.ts` - Account lifecycle contracts
* `apps/server/src/index.ts` - Protected lifecycle routes
* `apps/server/src/jobs/principalDeletion.ts` - Due-account completion attempts
* `apps/server/src/jobs/principalDeletion.test.ts` - Deadline and blocked-completion behavior
* `apps/server/src/db/principal.postgres.integration.test.ts` - Lifecycle and data-retention behavior
* `apps/server/src/operations/principalRecovery.ts` - RBAC-invoked offline recovery and pending-transfer cancellation
* `apps/server/src/operations/principalRecovery.test.ts` - Required ticket, audit, and forbidden ownership mutation
* `.github/workflows/cd.yml` - Restricted manual recovery-job invocation boundary

Discrepancy references:
* `DR-03` - Day-30 unresolved ownership needs product/privacy approval
* `DR-04` - Audit and pseudonymous-attribution retention periods need approval
* `DR-08` - Operational recovery requires an explicit authorization and audit boundary

Success criteria:
* Deletion pending blocks valid tokens immediately
* Recovery within 30 days restores the same internal principal
* Completion fails closed while owned patches remain or retention policy is unapproved
* Completion removes mappings and profile data without erasing approved attribution or audit
* Operational recovery is unavailable to the public server, requires Azure RBAC and a support ticket, and cannot reassign a patch

Dependencies:
* Steps 5.1 and 5.2
* Product, privacy, legal, and support approval for retention and break-glass operations

### Step 5.4: Validate ownership phase

Validation commands:
* `npm exec --workspace=apps/server -- vitest run src/db/ownership.postgres.integration.test.ts src/db/principal.postgres.integration.test.ts src/jobs/ownershipLifecycle.test.ts src/jobs/principalDeletion.test.ts` - Ownership and lifecycle behavior
* `npm run lint:server` - Static validation
* `npm run build:server` - Server build

## Implementation Phase 6: Authenticated Protocol-V2 Mutations

<!-- parallelizable: false -->

### Step 6.1: Define dedicated placement and removal contracts

Add protocol-v2 placement and removal events with quilt ID, stable operation ID, canonical mutation input or tile ID, and expected revisions for every affected patch. Define typed safe acknowledgements for unauthenticated, unauthorized, stale revision, collision, invalid footprint, throttling, idempotent replay, and success. Never accept principal ID from the client.

Files:
* `apps/server/src/contracts.ts` - Protocol-v2 mutation payloads and acknowledgements
* `apps/server/src/contracts.test.ts` - Runtime contract validation
* `apps/client/src/network/useSocketConnection.ts` - Typed event surface

Success criteria:
* Placement and removal do not reuse legacy event semantics
* Every request carries a stable operation ID and complete expected patch revisions
* Errors reveal no hidden policy details or resource existence

Dependencies:
* Phase 3 authentication and policy contracts

### Step 6.2: Wire owner-only placement and implement quilt removal

Route placement to `persistQuiltTilePlacement` after adapting it to the central policy evaluator. Add patch-scoped removal with canonical footprint derivation, sorted locks, in-transaction principal and owner checks, expected per-patch revisions, spatial cleanup, patch operations, audit, and idempotency. Publish viewer-scoped events only after commit. Keep ordinary members denied and delegated/moderator mutation absent.

Files:
* `apps/server/src/db/repository.ts` - Policy-aware placement and new quilt removal transaction
* `apps/server/src/index.ts` - Thin handlers and post-commit scoped publication
* `apps/server/src/db/repository.postgres.integration.test.ts` - Placement/removal owner, member, mixed-authority, collision, revision, and idempotency cases
* `apps/server/src/index.integration.test.ts` - Safe acknowledgement and fanout behavior

Success criteria:
* Owners can mutate only when every intersected patch authorizes them
* Ordinary members and mixed-authority footprints persist no partial state
* Placement and removal retries return deterministic committed outcomes
* No mutation event is published before commit

Dependencies:
* Phase 5 production ownership path
* Step 6.1 contracts

### Step 6.3: Reconcile optimistic client state by patch revisions

Replace dormant legacy-v2 emits with the dedicated contracts. Generate stable operation IDs, capture expected revision for every canonical affected patch, and reconcile optimistic placement, removal, undo, alias interactions, cursors, and reconnect from returned patch revisions and durable event IDs.

Files:
* `apps/client/src/App.tsx` - Placement, removal, undo, and acknowledgement reconciliation
* `apps/client/src/domain/quiltCache.ts` - Multi-patch optimistic and committed revision handling
* `apps/client/src/domain/quiltCache.test.ts` - Idempotency, rollback, alias, and reconnect cases
* `apps/client/src/App.test.tsx` - Mutation integration behavior

Success criteria:
* Alias interactions produce one canonical operation
* Failed mixed-patch operations roll back all optimistic state
* Reconnect converges from per-patch cursors without duplicate mutation

Dependencies:
* Steps 6.1 and 6.2

### Step 6.4: Validate mutation phase while retaining the rollout flag

Validation commands:
* `npm exec --workspace=apps/server -- vitest run src/contracts.test.ts src/db/repository.postgres.integration.test.ts src/index.integration.test.ts` - Server mutation correctness
* `npm exec --workspace=apps/client -- vitest run src/domain/quiltCache.test.ts src/App.test.tsx` - Client reconciliation
* `npm run lint` - Cross-workspace static validation
* `npm run build` - Cross-workspace build

Keep `mutationEnabled=false` after this phase until Phase 7 passes and the owner-only E2E gate is formally separated from deferred delegated-capability acceptance criteria.

## Implementation Phase 7: Deployment, Authenticated E2E, and Rollout

<!-- parallelizable: false -->

### Step 7.1: Replace identity bypasses with a local test OIDC issuer

Add a standards-conforming local issuer and signed short-lived tokens to server integration, Playwright, and multi-replica fixtures. Exercise valid authentication, key rotation, expiry, one renewal, interaction-required clearing, claims, ownership changes, owner mutation, member denial, mixed-patch denial, and replica reconnect. Add a root script for the multi-replica configuration and run authenticated E2E in CI.

Files:
* `e2e/support/testOidcIssuer.ts` - Local issuer, JWKS, and token helpers
* `e2e/support/multiUser.ts` - Authenticated principals instead of `testPrincipalId`
* `e2e/support/startMultiReplicaServer.ts` - Double-gated issuer settings
* `e2e/authentication.spec.ts` - Sign-in, expiry, clearing, and protected visibility
* `e2e/quilt-seams.spec.ts` - Owner placement/removal and member denial
* `e2e/quilt-reconnect.spec.ts` - Authenticated cross-replica convergence
* `playwright.config.ts` - Local issuer lifecycle
* `playwright.multi-replica.config.ts` - Multi-replica issuer lifecycle
* `package.json` - Named multi-replica test command
* `.github/workflows/ci.yml` - Authenticated Playwright gate

Success criteria:
* No E2E path injects an internal principal ID
* Token expiry clears protected state and reconnect uses a newly validated token
* Owner and denied-member cases converge across two replicas

Dependencies:
* Phases 3 through 6

### Step 7.2: Configure production identity, telemetry, and fail-closed gates

Inject server issuer, audience, scope, algorithm, JWKS, origin, and policy-version settings plus client public runtime configuration. Emit redacted request, socket, operation, replica, policy, and outcome telemetry without tokens, external subjects, or email. Confirm that migration failure, invalid identity configuration, unknown keys, blocked deletion completion, and unapproved retention keep rollout disabled.

Files:
* `.github/workflows/cd.yml` - Migration ordering and environment configuration
* `infra/bicep/main.bicep` - Identity configuration and secret references
* `infra/bicep/modules/` - Container App/job inputs as required by existing module ownership
* `apps/server/src/index.ts` - Readiness and redacted telemetry
* `apps/server/src/startup/` - Fail-fast identity and migration checks
* `apps/server/README.md` - Operations and outage behavior

Success criteria:
* Production artifacts contain no local issuer key or test bypass
* Unknown key, expired token, disabled principal, or incompatible schema fails closed
* Logs and audit expose correlation and policy version without credentials or external identifiers

Dependencies:
* Phase 1 release contract
* Approved retention and ownership-resolution gates

### Step 7.3: Split owner-only and delegated E2E gates before mutation enablement

Update backlog ownership so the initial release gate covers authenticated owner success, denied member, mixed cross-patch authority, aliases, expiry reconnect, and two-replica convergence. Keep delegated-capability and moderator scenarios blocked in a later issue. Do not claim issue 98 complete while its delegated acceptance criteria remain unmet.

Discrepancy references:
* `DR-05` - Backlog treatment requires issue-owner action

Success criteria:
* The owner-only release gate has explicit acceptance criteria and evidence
* Delegated and moderator behavior remains visibly deferred
* `mutationEnabled` changes only after the owner-only gate, migration rehearsal, telemetry, and rollback approval pass

Dependencies:
* Issue owner access
* Steps 7.1 and 7.2

## Implementation Phase 8: Final Validation

<!-- parallelizable: false -->

### Step 8.1: Run focused and full project validation

Execute:
* `npm run audit`
* `npm run lint`
* `npm run build`
* `npm run test`
* `npm run test:e2e:ci`
* `npm run test:e2e:multi-replica`
* `./scripts/verify-quilt-migration.sh rehearse`

### Step 8.2: Rehearse security and rollout failure cases

Verify wrong issuer/audience/scope/algorithm, unknown key, key rotation, provider outage with cached keys, token expiry, local disable, deletion pending, hidden-versus-unknown resources, claim races, stale revisions, mixed authority, failed migration, rollback, and production rejection of test settings. Benchmark principal mapping, catalog policy, claim, transfer, placement, and removal queries at production-like cardinality before approving thresholds.

### Step 8.3: Fix minor issues and report blockers

Apply isolated lint, type, test, and configuration corrections. Record failures requiring policy changes, architecture changes, or new research as blockers rather than broadening implementation during final validation. Leave protocol-v2 mutation disabled until every release gate is evidenced.

## Dependencies

* Microsoft Entra External ID tenant and application registrations
* `jose`, `@azure/msal-browser`, and `@azure/msal-react`
* PostgreSQL for migration and concurrency validation
* Azure Container Apps deployment and one-shot migration-job permissions
* Product, privacy, legal, support, and issue-owner decisions recorded as release gates

## Success Criteria

* Stable authenticated principals protect every HTTP, Socket.IO, catalog, content, presence, search, replay, and mutation surface
* Atomic claims, transfers, abandonment, and recoverable deletion follow approved lifecycle and audit policy
* Owner-only protocol-v2 placement and removal are idempotent, all-or-nothing, and replica-convergent
* Provider outage and token expiry clear protected client state and fail closed
* Protocol-v2 mutation remains disabled until migration, security, E2E, telemetry, retention, rollback, and backlog gates pass