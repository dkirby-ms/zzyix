---
title: Infinite Canvas Authentication Plan Verification Research
description: Repository verification for authentication and authorization implementation planning
author: GitHub Copilot
ms.date: 2026-07-28
ms.topic: reference
---

## Research Scope

Status: Complete

Verify the current implementation architecture and exact planning surfaces for:

* Server token verification and principal mapping
* Schema, migrations, and repository commands
* HTTP and Socket.IO protection
* Client MSAL integration and authentication state
* Protected resource visibility
* Claim, transfer, abandonment, and account deletion
* Protocol-v2 owner-only placement and removal
* Test and deployment configuration
* Package scripts and validation commands
* Repository instructions and existing planning conventions

## Findings

### Repository State and Instructions

* Current branch: `infinite-canvas`
* No `.github/copilot-instructions.md` exists in the checkout
* The applicable Markdown and writing-style instructions require YAML frontmatter, one title supplied by frontmatter, ATX headings, ASCII punctuation, and concise technical prose
* Existing plans use `.copilot-tracking/plans/YYYY-MM-DD/*-plan.instructions.md`, target a corresponding change artifact through `applyTo`, link separate detail and log documents, enumerate an affected-files tree, mark phases with `<!-- parallelizable: ... -->`, and finish with dependencies and traceable success criteria
* `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md:64-96` is the closest plan-shape precedent
* No source code or planning artifact was modified during this research

### Server Token Verification and Principal Mapping

Current state:

* `apps/server/package.json:20-28` has no JWT or OIDC dependency. `jose` is absent from all package manifests and `package-lock.json`
* `apps/server/src/contracts.ts:240-255` defines `ConnectionAuth` and `SocketData`. The handshake accepts session, client, and protocol fields but no access token; only `SocketData.principalId` anticipates durable identity
* `apps/server/src/index.ts:1691-1755` owns all Socket.IO connection middleware. It rate-limits by address, validates only `sessionId` and `clientId`, and assigns `socket.data.principalId` exclusively from `testPrincipalId` when `E2E_TEST_MODE=true`
* `apps/server/src/db/schema.ts:61-91` already defines immutable internal principals and exact composite external mappings. The mapping primary key is `(provider_namespace, external_subject)`, but `principal_id` has only a nonunique index
* `apps/server/src/db/repository.ts:1452-1472` resolves an optional exact provider namespace and external subject in `loadQuiltDeliveryContext`. This is read-only lookup, not verified-token mapping, provisioning, status enforcement, or conflict handling

Required implementation surfaces:

* Add `jose` to `apps/server/package.json` and the root lockfile
* Add a focused server auth boundary, likely `apps/server/src/auth/config.ts`, `apps/server/src/auth/tokenVerifier.ts`, and `apps/server/src/auth/principalContext.ts`
* Keep provider claims outside domain handlers. The verifier should return a narrow verified identity containing canonical issuer, subject, audience/scope result, and expiry; principal mapping should return only the internal principal ID and local status
* Add exact issuer, audience, allowed asymmetric algorithms, required delegated scope, JWKS timeout/cache policy, and test-issuer double-gate configuration
* Add a repository command for atomic first-use principal provisioning and mapping. It must serialize the exact issuer/subject tuple, reject reverse mapping conflicts, never merge by email, and enforce the initial one-active-mapping-per-principal rule
* Extend `principals` with explicit lifecycle status and lifecycle timestamps. Existing `kind` values in `apps/server/src/db/types.ts:7-21` are not account status
* Add a unique constraint on `external_principal_mappings.principal_id` for the approved initial one-to-one identity rule

### Schema, Migrations, and Repository Commands

Existing persistence anchors:

* `apps/server/src/db/schema.ts:61-91`: `principals`, `externalPrincipalMappings`
* `apps/server/src/db/schema.ts:122-164`: patch ownership, lifecycle state, and memberships
* `apps/server/src/db/schema.ts:248-279`: durable patch operations with operation, event, and actor principal IDs
* `apps/server/src/db/repository.ts:703-915`: `persistQuiltTilePlacement`
* `apps/server/src/db/repository.ts:1148-1335`: legacy canvas-wide `persistTileRemoval`, not a patch-scoped quilt removal command
* `apps/server/src/db/repository.ts:1452-1515`: `loadQuiltDeliveryContext`
* `apps/server/src/db/repository.ts:1517-1625`: patch snapshot delivery
* `apps/server/src/db/repository.ts:1637-1682`: patch operation replay

New schema required by the confirmed product decisions:

* Principal lifecycle status: active, disabled, deletion pending, and deleted, plus deletion request, recovery deadline, and completion timestamps
* One-to-one external mapping uniqueness for the initial release
* Claim attempts or equivalent durable quota records supporting one active patch per principal per quilt, three attempts per 10 minutes, and one successful claim per 24 hours across quilts
* Pending ownership transfers with sender, recipient, patch, created time, seven-day expiry, accepted/cancelled state, and idempotency key
* General authorization and ownership audit records. `patch_operations` is mutation history, not sufficient for denied decisions, claims, transfers, abandonment, account lifecycle, or identity mapping
* Persisted visibility policy if the plan implements the accepted ADR contract rather than only the narrower authenticated-only initial baseline

Repository commands required:

* Resolve or provision active principal from verified identity
* Disable, begin deletion, recover deletion, and complete deletion
* List only quilts or sessions visible to the principal
* Atomically claim an eligible unowned patch with quota checks and audit
* Create, accept, expire, and cancel transfer
* Abandon an owned patch to unclaimed
* Resolve owned patches before deletion completion
* Persist owner-only quilt placement through the existing transaction
* Add patch-scoped quilt removal with the same canonical footprint, sorted locking, owner authorization, expected per-patch revisions, operation idempotency, spatial-reference cleanup, patch operations, and post-commit result data

Migration mechanics and risk:

* `apps/server/src/db/migrate.ts:41-78` makes production startup fail on migration-count mismatch and auto-applies only outside production
* `apps/server/src/db/migrate.ts:80-108` is the one-shot application path used by root `db:apply`
* `apps/server/migrations/0005_finite_toroidal_quilt.sql` created the current principal, mapping, patch, and operation schema
* `apps/server/migrations/meta/_journal.json:38-47` journals migration `0005`, but `apps/server/migrations/meta/` contains snapshots only through `0002_snapshot.json`
* Reconcile the Drizzle metadata history before relying on `npm run db:generate`; otherwise author and review the next SQL migration deliberately and restore metadata consistency as a prerequisite

### HTTP and Socket.IO Protection

Current HTTP boundary:

* `apps/server/src/index.ts:1323-1350` allows only `Content-Type` in CORS preflight. Bearer authentication requires adding `Authorization` and preserving exact origin allow-list behavior
* `apps/server/src/index.ts:1376-1378` exposes anonymous health data and can remain anonymous
* `apps/server/src/index.ts:1380-1426` exposes anonymous session listing and creation. Both reveal or create protected content and must require an active principal under the confirmed no-anonymous-content decision
* No `/me` route or reusable Express authentication middleware exists

Current Socket.IO boundary:

* `apps/server/src/index.ts:1691-1755` is the sole connection middleware and the correct insertion point for token verification, principal mapping, and token-expiry scheduling
* `apps/server/src/index.ts:1786-1804` loads v2 context from `socket.data.principalId` and always reports `mutationEnabled: false`
* `apps/server/src/index.ts:1856-2045` registers legacy `place_tile` and `remove_tile`; both reject protocol v2
* `apps/server/src/index.ts:2350-2571` protects v2 room subscription only through the optional principal and derived patch access. It does not establish authentication itself

Required changes:

* Add Express bearer middleware and typed request principal context before `/sessions`, future quilt catalog routes, `/me`, claims, transfers, abandonment, and account lifecycle routes
* Add `GET /me` returning safe profile and server-derived capabilities. Do not expose external subject or accept client-supplied internal principal IDs
* Extend `ConnectionAuth` with `token`, verify it in async `io.use`, map to an active internal principal, and assign the server-derived principal and token expiry to `SocketData`
* Disconnect at token expiry. Reconnection must carry a newly acquired token; the server must not extend authorization based on socket activity
* Protect all Socket.IO events, including subscriptions, snapshots, presence, telemetry, and mutations. Authentication should precede session/quilt lookup so anonymous callers cannot infer protected existence
* Return stable safe 401, 403, 404, 409, and 429 errors for HTTP and equivalent Socket.IO error data without leaking token, issuer subject, hidden resource IDs, or policy internals
* Keep `testPrincipalId` out of production contracts. Replace it with a locally signed test OIDC token accepted only when both `NODE_ENV=test` and `E2E_TEST_MODE=true`; production startup should reject test issuer or key settings

### Client MSAL and Authentication State

Current state:

* `apps/client/package.json:17-29` has no MSAL dependency. `@azure/msal-browser` and `@azure/msal-react` are absent from the lockfile
* `apps/client/src/main.tsx:1-10` renders `App` directly with no authentication provider
* `apps/client/src/network/session.ts:57-97` performs anonymous session create/list fetches and has no shared authenticated fetch wrapper
* `apps/client/src/network/session.ts:111-119` stores `clientId` in local storage. It is ephemeral transport/presence identity and must remain separate from the principal
* `apps/client/src/network/useSocketConnection.ts:27-58` constructs the socket with session/client/protocol fields only
* `apps/client/src/network/useSocketConnection.ts:69-72` only logs connection errors; no renewal or interaction-required state exists
* `apps/client/src/App.tsx:350-426` owns all application state, including session and quilt state, but no auth state
* `apps/client/src/App.tsx:488-525` loads the anonymous lobby immediately and clears protected canvas state only on manual return to lobby
* `apps/client/src/ui/LobbyScreen.tsx:41-124` is the current catalog/create/join UI
* `apps/client/src/ui/AppHeader.tsx:9-38` has no principal profile, sign-out, or account state

Likely file changes and additions:

* Add `@azure/msal-browser` and `@azure/msal-react` to `apps/client/package.json` and the root lockfile
* Add `apps/client/src/auth/msalConfig.ts`, `apps/client/src/auth/AuthProvider.tsx`, `apps/client/src/auth/useAuthSession.ts`, and `apps/client/src/network/authenticatedFetch.ts`
* Wrap `App` in the provider from `apps/client/src/main.tsx`
* Add a protected `GET /me` client and hydrate internal principal/profile state only from that response
* Change `createSession` and `listSessions` to use the shared token acquisition/fetch boundary
* Change `useSocketConnection` to receive an access-token supplier or authenticated connection generation, place the current token in `auth.token`, reconnect after one silent renewal, and stop on interaction-required failures
* Change `App` so no catalog or quilt state loads before authenticated `/me` succeeds. A centralized clear-protected-state action must clear sessions, selected session, snapshots, quilt cache, cursors, collaborators, optimistic state, undo metadata, drafts, and socket state on logout or auth expiry
* Adapt `LobbyScreen` to own sign-in/account-state flows before catalog display, and project safe profile/sign-out controls through `AppHeader`
* Keep `StatusIndicator` focused on transport health rather than making it the auth state owner

### Protected Visibility

Current state:

* `apps/server/src/db/repository.ts:681-701` lists every canvas without a principal or visibility predicate
* `apps/server/src/db/repository.ts:1452-1515` derives patch membership from owner or membership rows
* `apps/server/src/index.ts:202-217` computes `buildPatchRoomAccess` from lifecycle and membership. Anonymous aggregate access is currently enabled for active, unclaimed, and suspended patches
* `apps/server/src/realtime/quiltRooms.ts:50-63` chooses public versus principal access, and `resolveQuiltRooms` at lines 77-155 enforces the supplied decision
* `apps/server/src/realtime/quiltRooms.test.ts:62-82` explicitly expects anonymous aggregate visibility, which conflicts with the confirmed no-anonymous-quilt-content decision

Planning implications:

* Change catalog queries first so protected resources are not disclosed before socket subscription
* Centralize a policy result used by catalog, HTTP snapshots, socket room resolution, presence, event replay, aggregates, search, and mutations. Do not duplicate lifecycle matrices in route handlers
* Remove anonymous aggregate access for the initial release
* Use indistinguishable not-found behavior for nonexistent and nonvisible domain resources
* Update `buildPatchRoomAccess`, `resolveQuiltRooms`, repository listing queries, and their tests together so policy cannot drift between transports

### Claims, Transfer, Abandonment, and Deletion

No implementation exists for these workflows. Searches found no claim, transfer, abandonment, principal deletion-pending, authorization-audit, moderator, or delegated-grant schema or command.

Recommended command behavior:

* Claim locks the target patch and relevant quota records, rechecks active principal status and eligibility, changes unclaimed to active ownership, creates owner membership, consumes quota, and audits in one transaction. Exactly one concurrent claimant succeeds
* Transfer creation requires current owner authority and creates a seven-day pending offer. Ownership changes only when the active intended recipient accepts in a transaction
* Abandonment requires current owner authority and atomically clears owner membership/owner ID, returns the patch to unclaimed, and audits the transition
* Deletion request immediately changes principal status to deletion pending and blocks all access. Recovery during 30 days restores active status. Completion must resolve ownership, remove mapping and personal profile data, pseudonymize retained attribution as approved, and preserve audit under the retention decision
* Add scheduled expiry/completion jobs under `apps/server/src/jobs/`, following the existing retention-job pattern, but keep transactional commands callable directly for deterministic tests
* Moderator and delegated mutation commands remain out of initial scope. Schema/API names must not imply that `member` can edit

### Protocol-V2 Owner-Only Placement and Removal

Current placement capability:

* `apps/server/src/db/repository.ts:703-915` canonicalizes the toroidal position, derives geometry and collision footprints, locks sorted patch IDs, checks every intersected patch for active owner authority and exact expected revision, validates collision in-transaction, and writes one tile, spatial references, per-patch operations, actor principal, and revisions
* `apps/server/src/db/repository.postgres.integration.test.ts:54-244` covers seam concurrency, deterministic lock order, idempotency, unrelated-patch concurrency, no partial unauthorized/stale state, member denial, and owner success
* The placement transaction is not called from `apps/server/src/index.ts`; current references are tests only

Missing protocol and removal work:

* `apps/server/src/contracts.ts:559-606` exposes only legacy `place_tile` and `remove_tile`; there are no dedicated v2 mutation events or acknowledgements
* `apps/server/src/index.ts:1801` reports v2 mutation disabled, and handlers at lines 1856 and 1978 reject v2
* `apps/client/src/App.tsx:1147-1187` and `apps/client/src/App.tsx:1276-1342` contain dormant v2 optimistic branches, but they still emit legacy payloads with one global `expectedRevision`
* `persistQuiltTilePlacement` requires a stable `operationId` and `expectedPatchRevisions` map, so the dormant client path cannot call it correctly
* No `persistQuiltTileRemoval` exists. Legacy `persistTileRemoval` is canvas-wide and authorizes by transport `clientId`, so it must not be reused for v2

Required contract shape:

* Add dedicated v2 placement/removal payloads containing quilt ID, stable operation ID, canonical mutation input or tile ID, and expected revisions for every affected patch
* Add safe acknowledgements for unauthenticated, unauthorized, stale/out-of-order revision, collision, invalid footprint, idempotent replay, and success
* Derive principal only from `socket.data`; never accept it in mutation payloads
* Add a central policy evaluator call inside both transactions after locks are held
* Publish only after commit to viewer-scoped fine/event rooms, then reconcile using returned per-patch revisions and durable event IDs
* Update quilt cache optimistic placement, removal, undo, cursor tracking, and reconnect behavior for multi-patch results
* Keep `mutationEnabled=false` until authenticated owner placement and removal, mixed-authority cross-patch denial, expiry reconnect, and two-replica convergence gates pass

### Tests and Deployment Configuration

Existing focused tests:

* `apps/server/src/db/repository.postgres.integration.test.ts:54-244`: real PostgreSQL patch placement correctness and owner authorization
* `apps/server/src/index.integration.test.ts:887-921`: protocol-v2 authorization boundary and lifecycle-derived room access
* `apps/server/src/realtime/quiltRooms.test.ts:47-120`: canonical rooms, visibility, and budgets
* `apps/client/src/network/useSocketConnection.test.ts`: current handshake and listener behavior
* `apps/client/src/App.test.tsx`: lobby, cache, protocol, and optimistic behavior
* `e2e/quilt-seams.spec.ts:57-99`: seam subscriptions and explicit disabled-mutation assertion
* `e2e/quilt-reconnect.spec.ts:44-169`: two-replica cursor convergence using `testPrincipalId`

Required new coverage:

* Token verifier unit tests for signature, issuer, audience, algorithm, scope, lifetime, malformed token, unknown key, key rotation, cache outage, and issuer/subject tuple isolation
* Principal mapping PostgreSQL tests for first provisioning, concurrent provisioning, reverse uniqueness, disabled/deletion states, and no email merge
* Express tests for `/me`, protected listings/creation, exact CORS preflight, safe 401/403/404, and no identity leakage
* Socket tests for valid token, invalid token, origin, polling and WebSocket transports, expiry disconnect, renewed reconnect, and production rejection of test issuer configuration
* PostgreSQL concurrency tests for claims, quotas, transfer acceptance/expiry, abandonment, deletion recovery/completion, placement, and removal
* Client tests for MSAL callback/loading/interaction-required states, authenticated fetch, protected-state clearing, logout, and token-renewed socket recreation
* Playwright tests using a local test OIDC issuer and signed tokens, including authenticated catalog visibility, claim, owner mutation, denied member mutation, expiry clearing, and multi-replica reconnect

Deployment findings:

* `.github/workflows/ci.yml:1-122` runs audit, lint, unit/integration tests, and builds, but no Playwright job
* `.github/workflows/cd.yml:149-244` deploys the server with database and CORS configuration only
* `.github/workflows/cd.yml:258-333` deploys the static client and injects only `BACKEND_SERVICE_HOSTNAME`
* `.github/workflows/cd.yml` does not run `db:apply` or create an Azure Container Apps migration job
* `apps/client/Dockerfile:30-46` performs runtime substitution only for the backend hostname
* `apps/client/nginx.conf:7-42` proxies `/health`, `/sessions`, and `/socket.io`; new `/me`, quilt, claim, transfer, abandonment, and account routes need proxy coverage unless the proxy is generalized to `/api`

Deployment changes required:

* Add release-owned one-shot `db:apply` execution before rolling out server replicas that require the new schema
* Add server environment variables for trusted issuer, API audience, delegated scope, algorithms, JWKS policy, and exact origins
* Choose and implement one public client-configuration strategy: environment-specific image build arguments or a runtime-generated public config file. Current images cannot receive MSAL authority, SPA client ID, or API scope at runtime
* Add External ID redirect/logout URIs for every deployed client origin
* Ensure test issuer keys/settings are absent from production images and Container App configuration
* Add auth E2E to CI and preserve the existing multi-replica harness

## Dependencies and Order Constraints

1. Validate the target Entra External ID tenant/subscription, public client registration, API registration/scope, issuer form, redirect URIs, and selected client configuration delivery strategy.
2. Repair or explicitly account for Drizzle migration metadata before generating the auth migration.
3. Add schema for principal lifecycle, one-to-one mapping, audit, claim quotas, and transfers; add the release-owned migration job before production code depends on it.
4. Implement and test token verification independently of Express and Socket.IO. The verifier must be deterministic under local keys before transport wiring.
5. Implement transactional principal resolution/provisioning and lifecycle enforcement. Transport middleware must not ship before disabled and deletion-pending principals can be rejected locally.
6. Add protected `/me` and principal-filtered catalog/listing queries before client login exposes the lobby.
7. Protect Socket.IO connection and expiry handling before enabling protected room subscriptions or mutation.
8. Add client MSAL provider, authenticated fetch, `/me` hydration, and protected-state clearing. Only then expose the protected lobby and canvas.
9. Centralize visibility policy and apply it to catalog, snapshots, rooms, aggregates, presence, search, and replay before claiming the no-anonymous-content requirement is complete.
10. Implement claim and ownership lifecycle commands before owner-only mutation is enabled, because owner authority needs a production path to exist and change safely.
11. Wire existing quilt placement through a dedicated v2 contract, add quilt removal, and update client reconciliation. These two mutations should release together because undo currently depends on removal.
12. Replace `testPrincipalId` with the local test issuer, then run authenticated single-replica and two-replica E2E.
13. Keep protocol-v2 mutation disabled until schema rehearsal, auth expiry behavior, owner/mixed-authority tests, scoped post-commit fanout, and replica convergence pass.

Parallel work is limited. Token-verifier unit work and client sign-in UI can proceed after provider configuration is fixed, but schema/mapping precedes transport authorization, visibility precedes protected delivery, claims precede production ownership, and placement/removal contracts must precede client mutation reconciliation.

## Validation Commands

Repository scripts currently available:

```bash
npm run audit
npm run lint
npm run build
npm run test
npm run test:e2e:ci
```

Focused server and client validation during implementation:

```bash
npm run lint:server
npm run build:server
npm run test:server
npm run lint:client
npm run build:client
npm run test:client
```

Focused Vitest commands for likely touched slices:

```bash
npm exec --workspace=apps/server -- vitest run src/auth src/db/repository.postgres.integration.test.ts src/realtime/quiltRooms.test.ts src/index.integration.test.ts
npm exec --workspace=apps/client -- vitest run src/network src/auth src/App.test.tsx
```

Database and migration validation:

```bash
npm run build:server
npm run db:apply
./scripts/verify-quilt-migration.sh rehearse
```

Single-replica and multi-replica browser validation:

```bash
npm run test:e2e:ci
npm exec -- playwright test --config=playwright.multi-replica.config.ts e2e/quilt-reconnect.spec.ts
```

Document validation:

```bash
git diff --check -- .copilot-tracking/research/subagents/2026-07-28/infinite-canvas-auth-plan-verification-research.md
```

PostgreSQL integration tests require a reachable loopback PostgreSQL instance. Playwright commands install Chromium and run the configured Linux dependency preflight only through the root `test:e2e:*` scripts; the direct multi-replica command assumes Playwright is already installed.

## Gaps and Questions

* External ID availability, pricing, tenant domain, branding, sign-in methods, exact issuer, API audience, and delegated scope remain subscription-specific and cannot be proven from the repository
* The static client needs a decision between per-environment image builds and runtime public configuration. Runtime configuration avoids rebuilding the image for authority/client-ID changes and fits the existing Nginx entrypoint pattern
* The CD workflow still lacks the release-owned migration execution required by production startup. The owner, retry policy, rollback procedure, and deployment ordering need an explicit decision
* Persisted visibility schema is required by the accepted quilt ADR, while the confirmed initial product decision can be implemented as authenticated-only derived policy. The planner should state whether persisted policy is in this task or a separately gated follow-up
* Account deletion cannot complete safely without a precise rule for unresolved owned patches at day 30. Automatic abandonment, forced transfer, or blocked completion requires product/privacy approval
* Pseudonymous attribution and authorization-audit retention periods remain undefined
* Transfer disputes and account recovery lack moderator commands in the initial release. An operational support procedure and authorization boundary are still needed
* Issue 98 acceptance criteria reportedly include delegated mutation, but delegation is deferred. The backlog must split owner-only E2E from later delegation or keep the broader issue blocked
* No package script wraps the multi-replica Playwright configuration. Adding one would make CI and local validation less error-prone
* Existing CI does not run E2E, and current E2E identity bypass is not representative of production token validation

## Evidence

Primary repository evidence:

* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md`
* `apps/server/src/contracts.ts`
* `apps/server/src/index.ts`
* `apps/server/src/db/types.ts`
* `apps/server/src/db/schema.ts`
* `apps/server/src/db/repository.ts`
* `apps/server/src/db/migrate.ts`
* `apps/server/src/realtime/quiltRooms.ts`
* `apps/server/migrations/0005_finite_toroidal_quilt.sql`
* `apps/server/migrations/meta/_journal.json`
* `apps/client/src/main.tsx`
* `apps/client/src/App.tsx`
* `apps/client/src/network/session.ts`
* `apps/client/src/network/useSocketConnection.ts`
* `apps/client/src/ui/LobbyScreen.tsx`
* `apps/client/src/ui/AppHeader.tsx`
* `playwright.config.ts`
* `playwright.multi-replica.config.ts`
* `.github/workflows/ci.yml`
* `.github/workflows/cd.yml`
* `apps/client/Dockerfile`
* `apps/client/nginx.conf`
* `package.json`
* `apps/server/package.json`
* `apps/client/package.json`