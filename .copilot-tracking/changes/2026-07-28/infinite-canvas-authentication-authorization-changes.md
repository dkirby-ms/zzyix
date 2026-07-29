<!-- markdownlint-disable-file -->
# Release Changes: Infinite-Canvas Authentication and Authorization

**Related Plan**: infinite-canvas-authentication-authorization-plan.instructions.md
**Implementation Date**: 2026-07-28

## Summary

All eight implementation phases are complete. Owner-only protocol-v2 placement and removal converge across authenticated replicas, the full security and failure matrix passes, and production startup/CD gates keep mutation disabled pending external rollout approvals.

## Changes

### Added

* `apps/client/public/auth-config.template.json` - Public runtime identity configuration template without secrets
* `apps/client/src/config/runtimeConfig.ts` - Validated no-cache runtime identity configuration loader
* `apps/client/src/config/runtimeConfig.test.ts` - Exact URI and runtime identity configuration parsing tests
* `apps/server/migrations/meta/0003_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `apps/server/migrations/meta/0004_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `apps/server/migrations/meta/0005_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `scripts/release-contract.test.mjs` - Focused workflow, runtime JSON, nginx routing, and migration-script contract tests
* `apps/server/migrations/0006_authentication_authorization.sql` - Additive identity, lifecycle, ownership, audit, and visibility schema
* `apps/server/migrations/meta/0006_snapshot.json` - Reviewed Drizzle snapshot for migration 0006
* `apps/server/src/auth/config.ts` - Fail-closed authentication configuration and test-issuer gating
* `apps/server/src/auth/config.test.ts` - Authentication configuration validation tests
* `apps/server/src/auth/errors.ts` - Stable safe authentication error mapping
* `apps/server/src/auth/tokenVerifier.ts` - Pinned JWT and JWKS verification boundary
* `apps/server/src/auth/tokenVerifier.test.ts` - Signature, claim, key rotation, and outage verification matrix
* `apps/server/src/auth/principalContext.ts` - Transactional principal resolution and lifecycle enforcement
* `apps/server/src/auth/principalContext.postgres.integration.test.ts` - Concurrent provisioning and inactive-principal tests
* `apps/server/src/db/schema.test.ts` - Identity-policy schema constraint and default tests
* `apps/server/src/auth/httpAuth.ts` - Bearer authentication and safe HTTP principal middleware
* `apps/server/src/auth/httpAuth.test.ts` - HTTP credential and safe-error tests
* `apps/server/src/auth/socketAuth.ts` - Socket handshake authentication, immutable context, and expiry enforcement
* `apps/server/src/auth/socketAuth.test.ts` - Socket credential, inactive-principal, and expiry tests
* `apps/server/src/domain/authorizationPolicy.ts` - Central persisted visibility evaluator
* `apps/server/src/domain/authorizationPolicy.test.ts` - Policy decision and fail-closed tests
* `apps/client/src/auth/AuthProvider.tsx` - Runtime-configured MSAL bootstrap and provider composition
* `apps/client/src/auth/AuthProvider.test.tsx` - MSAL bootstrap and failure-state tests
* `apps/client/src/auth/AuthSessionProvider.tsx` - Login, logout, `/me`, token acquisition, and auth-loss lifecycle
* `apps/client/src/auth/msalConfig.ts` - Authorization-code PKCE and MSAL cache configuration
* `apps/client/src/auth/msalConfig.test.ts` - Runtime-to-MSAL configuration tests
* `apps/client/src/auth/useAuthSession.tsx` - Protected authentication session context
* `apps/client/src/auth/useAuthSession.test.tsx` - Profile bootstrap, renewal, and session lifecycle tests
* `apps/client/src/network/authenticatedFetch.ts` - Bearer transport with one coalesced forced-refresh retry
* `apps/client/src/network/authenticatedFetch.test.ts` - Credential, retry, interaction-required, and leakage tests
* `apps/server/src/db/ownership.postgres.integration.test.ts` - Claim race, quota, transfer, and abandonment tests
* `apps/server/src/db/principal.postgres.integration.test.ts` - Deletion request, recovery, and blocked-completion tests
* `apps/server/src/jobs/ownershipLifecycle.ts` - Transfer expiry and ownership lifecycle job
* `apps/server/src/jobs/ownershipLifecycle.test.ts` - Lifecycle job tests
* `apps/server/src/jobs/principalDeletion.ts` - Recoverable deletion completion job
* `apps/server/src/jobs/principalDeletion.test.ts` - Deletion timing, ownership, and retention-gate tests
* `apps/server/src/operations/principalRecovery.ts` - Restricted audited recovery operations
* `apps/server/src/operations/principalRecoveryCli.ts` - Offline operational recovery command boundary
* `apps/server/src/operations/principalRecovery.test.ts` - Recovery authorization, input, audit, and ownership restrictions
* `apps/server/src/db/authorization.benchmark.test.ts` - Opt-in production-cardinality authorization regression benchmark

### Modified

* `.github/workflows/cd.yml` - Validates identity configuration, queues releases, rejects active migration executions, and reconciles single-owner job settings
* `apps/client/Dockerfile` - Generates JSON-safe public auth configuration, validates nginx before startup, and includes the shared quilt topology build input
* `apps/client/nginx.conf` - Serves no-store runtime configuration and proxies the documented same-origin API roots
* `apps/client/README.md` - Documents External ID SPA registration, exact redirect values, and same-origin API routing
* `apps/client/vite.config.ts` - Mirrors production same-origin API proxy roots during local development
* `apps/server/README.md` - Documents API registration, trusted token settings, migration ownership, and internal-ingress routing
* `apps/server/package.json` - Pins compatible Drizzle Kit tooling for snapshot reconciliation
* `package-lock.json` - Locks the compatible Drizzle dependency graph
* `package.json` - Exposes the focused release-contract test command
* `scripts/bootstrap-cd-environment.sh` - Bootstraps required public and trusted identity deployment variables
* `scripts/gh-vars.env.template` - Provides the complete identity-variable template with a same-origin API example
* `scripts/verify-quilt-migration.sh` - Rehearses migrations with scoped temporary cleanup and dependency-free help
* `apps/server/migrations/meta/_journal.json` - Registers additive authentication and authorization migration 0006
* `apps/server/src/db/schema.ts` - Adds principal lifecycle, mapping, audit, quota, transfer, and visibility persistence
* `apps/server/src/db/types.ts` - Adds domain-safe lifecycle, audit, transfer, and visibility types
* `apps/server/package.json` - Adds the `jose` JWT verification dependency
* `package-lock.json` - Locks the Phase 2 identity dependency graph
* `apps/server/src/contracts.ts` - Adds authenticated principal and safe response contracts
* `apps/server/src/index.ts` - Protects domain HTTP and Socket.IO boundaries and exposes safe `/me`
* `apps/server/src/index.integration.test.ts` - Covers authenticated routes and hidden-versus-unknown behavior
* `apps/server/src/db/repository.ts` - Applies persisted policy to catalogs, data, replay, presence, rooms, and mutation admission
* `apps/server/src/db/recovery.postgres.integration.test.ts` - Covers persisted visibility and recovery behavior
* `apps/server/src/realtime/quiltRooms.ts` - Requires authenticated policy-authorized room admission
* `apps/client/package.json` - Adds MSAL browser and React dependencies
* `apps/client/src/main.tsx` - Composes runtime auth and protected session providers
* `apps/client/src/App.tsx` - Gates and destroys the protected application subtree on auth loss
* `apps/client/src/App.test.tsx` - Covers protected-state clearing and authenticated app lifecycle
* `apps/client/src/App.css` - Styles compact authentication states and controls
* `apps/client/src/network/session.ts` - Uses authenticated transport for protected session operations
* `apps/client/src/network/useSocketConnection.ts` - Supplies `auth.token` and performs one renewal/reconnect
* `apps/client/src/network/useSocketConnection.test.ts` - Covers socket credentials and bounded renewal
* `apps/client/src/ui/AppHeader.tsx` - Displays safe profile context and sign-out control
* `package-lock.json` - Locks MSAL dependencies
* `apps/server/src/db/repository.ts` - Adds transactional claim, transfer, abandonment, deletion, and recovery commands
* `apps/server/src/contracts.ts` - Adds authenticated ownership lifecycle request and response contracts
* `apps/server/src/auth/principalContext.ts` - Enforces immediate lifecycle authorization changes
* `apps/server/src/index.ts` - Exposes protected claim, transfer, abandonment, and deletion HTTP commands
* `apps/server/src/index.integration.test.ts` - Covers safe lifecycle HTTP contracts
* `apps/server/package.json` - Adds ownership lifecycle and recovery job commands
* `.github/workflows/cd.yml` - Adds protected operational recovery job invocation
* `apps/server/src/contracts.ts` - Adds dedicated authenticated protocol-v2 placement and removal contracts
* `apps/server/src/db/repository.ts` - Adds owner-only revisioned placement and durable removal transactions
* `apps/server/src/db/repository.postgres.integration.test.ts` - Covers owner, policy, revision, collision, race, and idempotency mutation behavior
* `apps/server/src/db/recovery.postgres.integration.test.ts` - Covers removal replay and retention recovery
* `apps/server/src/index.ts` - Wires dedicated mutation events and post-commit scoped fanout
* `apps/server/src/index.integration.test.ts` - Covers mutation contracts and disabled rollout behavior
* `apps/client/src/App.tsx` - Adds rollout-gated optimistic protocol-v2 placement and removal
* `apps/client/src/domain/placementSolver.ts` - Produces complete expected patch revision footprints
* `apps/client/src/domain/quiltCache.ts` - Reconciles acknowledgements and events monotonically by patch revision
* `apps/client/src/domain/quiltCache.test.ts` - Covers stale, duplicate, rejected, and out-of-order reconciliation
* `apps/client/src/auth/TestAuthProvider.tsx` - Double-gated browser authentication against the local test issuer
* `apps/server/src/auth/testOidcIssuer.test.ts` - Local issuer rotation, expiry, unknown-key, and production-rejection tests
* `apps/server/src/logging/redact.ts` - Central telemetry redaction for identity-sensitive fields
* `apps/server/src/logging/redact.test.ts` - Redaction contract tests
* `apps/server/src/startup/rolloutGates.ts` - Fail-closed production rollout approval validation
* `apps/server/src/startup/rolloutGates.test.ts` - Startup approval and mutation-default tests
* `e2e/authentication.spec.ts` - Login, bootstrap, logout, expiry, renewal, reconnect, and hidden-state coverage
* `e2e/support/testOidcIssuer.ts` - Standards-conforming local discovery, JWKS, and token issuer
* `apps/server/src/db/migrate.test.ts` - Proves failed migrations leave no partial schema
* `apps/client/src/ui/primitives/Toast.test.tsx` - Cleans up React state before jsdom teardown
* `apps/server/package.json` - Exposes the authorization benchmark command
* `package.json` - Exposes repository-level authorization benchmark execution

### Removed

## Additional or Deviating Changes

* External ID tenant capability, branding, domain, sign-in methods, and application registration were confirmed by the authorized administrator.
  * Staging contains the required non-secret identity variables and database secret; automated checks validate HTTPS URLs, exact same-origin routing, scope-to-audience consistency, and RS256.
* GitHub issues 14 and 98 were narrowed to runtime and owner-only release criteria, and issue 94 children 102 through 108 were created and linked.
  * This preserves delegated mutation and moderator commands as visibly deferred work.
* Drizzle Kit is pinned to stable version 0.31.10.
  * The previously resolved release candidate could not import the installed Drizzle ORM package during metadata repair.
* The client Docker build now includes the shared quilt topology source.
  * The existing image build omitted a module imported by the client workspace.
* Phase 1 review findings Q-001 through Q-007 are resolved.
  * CD runs queue instead of cancelling an external migration owner, active executions fail closed, job safety settings are reconciled and verified, runtime JSON uses `jq`, exact redirect values are preserved, browser API routing is same-origin, focused contract tests cover release semantics, and migration rehearsal cleanup is scoped.
* `az resource update` reasserts the migration job trigger and persisted safety settings.
  * The installed Azure CLI does not expose `--trigger-type` on `az containerapp job update`; the workflow still uses supported job-update flags and verifies the persisted resource configuration afterward.
* Concurrent principal provisioning uses a two-key PostgreSQL advisory transaction lock.
  * Independent issuer and subject hashes serialize exact external-identity creation without treating email or display claims as merge keys.
* Migration 0006 includes a conservative visibility-policy backfill for existing patches.
  * Drizzle generates the table definition but cannot infer the required data migration, so the reviewed SQL explicitly creates one policy row per existing patch.
* Dependency installation reported four moderate workspace advisories.
  * Audit remediation is outside this phase and no unrelated dependency upgrades were attempted.
* Newly created compatibility sessions persist their quilt, patch, and visibility policy atomically.
  * The centralized evaluator fails closed when policy is absent, so session creation now establishes the complete authenticated, unclaimed, mutation-disabled graph.
* Legacy protocol admission requires visibility across every surface it exposes.
  * Legacy mutation additionally requires ownership of every exposed patch; protocol-v2 mutation remains disabled.
* The client clears protected state by unmounting the complete authenticated application subtree.
  * This destroys catalogs, selected resources, snapshots, aggregates, presence, replay/search state, optimistic queues, undo state, socket rooms, connections, and cached principal context before sign-in is shown.
* MSAL v5 supported configuration replaces obsolete legacy fields.
  * The implementation explicitly uses MSAL-managed `sessionStorage`; unsupported `navigateToLoginRequestUrl` and `storeAuthStateInCookie` fields were not added.
* Deletion completion remains blocked while ownership exists or retention approval is absent.
  * No automatic transfer or abandonment is performed at day 30, preserving DD-02 and DR-03.
* Operational recovery is isolated from HTTP and Socket.IO.
  * The command requires immutable operator identity, approved support ticket, and reason; it can recover deletion-pending accounts or cancel transfers but cannot assign ownership.
* Authenticated two-replica mutation validation remains pending.
  * Resolved by Phase 7: the local OIDC fixture proves owner placement/removal, non-owner denial, stale revisions, scoped fanout, durable replay, and convergence across replicas.
* Issue 98 keeps owner-only and delegated acceptance separate.
  * Owner-only alias mutation and two-replica criteria are initial-release gates; delegated allow, deny, expiry, revocation, and mixed-authority cases remain open under issue 107.
* Authorization benchmark ceilings are local regression guards, not production service-level objectives.
  * At 10,000 principals/mappings and 10,000 policy-protected patches, every measured operation passed its local ceiling; representative production thresholds still require approval.
* Production rollout remains disabled after implementation completion.
  * Staging migration reconciliation, restricted recovery provisioning, retention policy, telemetry, rollback, and benchmark approvals remain external gates.

## Release Summary

All eight implementation phases are complete. Full suites passed 208 server tests and 153 client tests; six owner-only browser tests, all 10 authenticated browser tests, and the authenticated multi-replica mutation gate pass. Token and JWKS failures, lifecycle disablement, hidden resources, claim races, stale revisions, mixed authority, migration rollback, recovery, and production rejection of test settings are covered. The 10,000-row authorization benchmark passes local regression ceilings. Migration rehearsal, the high-severity audit gate, release contracts, builds, lint, diagnostics, and diff validation pass. Production mutation remains disabled pending WI-08, WI-10, DR-03, DR-04, telemetry, rollback, and benchmark approvals.
