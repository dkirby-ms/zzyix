<!-- markdownlint-disable-file -->
# Release Changes: Infinite-Canvas Authentication and Authorization

**Related Plan**: infinite-canvas-authentication-authorization-plan.instructions.md
**Implementation Date**: 2026-07-28

## Summary

Phase 1 repository prerequisites are implemented and validated. External ID tenant and application registration values remain an administrative blocker, so dependent identity implementation has not started.

## Changes

### Added

* `apps/client/public/auth-config.template.json` - Public runtime identity configuration template without secrets
* `apps/client/src/config/runtimeConfig.ts` - Validated no-cache runtime identity configuration loader
* `apps/server/migrations/meta/0003_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `apps/server/migrations/meta/0004_snapshot.json` - Restored reviewed Drizzle schema snapshot
* `apps/server/migrations/meta/0005_snapshot.json` - Restored reviewed Drizzle schema snapshot

### Modified

* `.github/workflows/cd.yml` - Validates identity configuration and runs one release-owned migration job before server rollout
* `apps/client/Dockerfile` - Generates public auth configuration at runtime and includes the shared quilt topology build input
* `apps/client/nginx.conf` - Serves runtime auth configuration with no-store caching
* `apps/client/README.md` - Documents External ID SPA registration and public runtime settings
* `apps/server/README.md` - Documents API registration, trusted token settings, and migration ownership
* `apps/server/package.json` - Pins compatible Drizzle Kit tooling for snapshot reconciliation
* `package-lock.json` - Locks the compatible Drizzle dependency graph
* `scripts/verify-quilt-migration.sh` - Rehearses fresh and upgraded schemas, parity, rollback, recovery, and retention

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

## Release Summary

Phase 1 changed 13 files: five files added and eight modified. Runtime public identity configuration, migration metadata, release-owned migration execution, documentation, and backlog decomposition are complete. Server build, client build, migration rehearsal, Drizzle consistency, runtime image checks, and diff validation passed. Phase 2 remains blocked until an authorized administrator supplies and approves the exact External ID issuer, audience, scope, client ID, redirect/logout URIs, JWKS endpoint, branding, domain, and sign-in methods.
