<!-- markdownlint-disable-file -->
# Release Changes: Infinite-Canvas Authentication and Authorization

**Related Plan**: infinite-canvas-authentication-authorization-plan.instructions.md
**Implementation Date**: 2026-07-28

## Summary

Phase 1 repository prerequisites and review rework are implemented and validated. External ID tenant and application registration values remain an administrative blocker, so dependent identity implementation has not started.

## Changes

### Added

* `apps/client/public/auth-config.template.json` - Public runtime identity configuration template without secrets
* `apps/client/src/config/runtimeConfig.ts` - Validated no-cache runtime identity configuration loader
* `apps/client/src/config/runtimeConfig.test.ts` - Exact URI and runtime identity configuration parsing tests
* `apps/server/migrations/meta/0003_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `apps/server/migrations/meta/0004_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `apps/server/migrations/meta/0005_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `scripts/release-contract.test.mjs` - Focused workflow, runtime JSON, nginx routing, and migration-script contract tests

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

### Removed

## Additional or Deviating Changes

* External ID subscription validation and tenant/app registration remain incomplete.
  * Repository and Azure CLI access cannot prove External ID administrative permission or approve branding, domains, and sign-in methods.
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

## Release Summary

Phase 1 changed 19 repository files: seven files added and 12 modified. Runtime public identity configuration, migration metadata, exclusive release-owned migration execution, same-origin API routing, release-contract tests, documentation, and backlog decomposition are complete. Client and server lint and builds, five release-contract tests, four runtime configuration tests, migration rehearsal, runtime image checks, diagnostics, and diff validation passed. Phase 2 remains blocked until an authorized administrator supplies and approves the exact External ID issuer, audience, scope, client ID, redirect/logout URIs, JWKS endpoint, branding, domain, and sign-in methods, followed by a staging deployment that verifies the Azure migration-job reconciliation against the target subscription.
