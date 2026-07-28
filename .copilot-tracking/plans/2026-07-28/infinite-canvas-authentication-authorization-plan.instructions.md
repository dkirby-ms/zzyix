---
applyTo: '.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Infinite-Canvas Authentication and Authorization

## Overview

Integrate Microsoft Entra External ID with server-validated durable principals, protect every quilt surface, implement audited ownership lifecycle, and enable owner-only protocol-v2 mutations behind fail-closed rollout gates.

## Objectives

### User Requirements

* Treat authentication and authorization as the next critical-path infinite-canvas work — Source: attached research task request
* Add the minimum production server and client identity integration for public self-service users — Source: confirmed product decisions and attached research
* Separate runtime identity integration from broader patch policy in GitHub issues 14 and 94 — Source: attached research task request
* Implement stable principal mapping, protected client context, atomic claims, transfer, abandonment, and recoverable deletion — Source: confirmed product decisions
* Identify and sequence missing owner-only protocol-v2 placement and removal work — Source: attached research task request
* Keep delegated mutation and moderator commands out of the initial release — Source: confirmed product decisions

### Derived Objectives

* Validate External ID and repair migration/release prerequisites before schema-dependent implementation — Derived from: subscription-specific provider settings and incomplete Drizzle snapshots
* Map exact verified `(issuer, subject)` tuples to immutable internal principal UUIDs — Derived from: multi-replica stateless token verification and durable PostgreSQL authorization
* Persist one visibility policy and use it across catalog, snapshot, aggregate, presence, search, replay, and mutation — Derived from: accepted quilt ADR and current policy drift
* Clear every protected client artifact at auth expiry or interaction-required failure — Derived from: approved provider-outage behavior
* Keep protocol-v2 mutation disabled until owner-only E2E, migration, telemetry, retention, and rollback gates pass — Derived from: accepted quilt rollout contract

## Context Summary

### Project Files

* `apps/server/src/index.ts` - Current anonymous HTTP boundary, Socket.IO middleware, policy wiring, and disabled v2 mutation
* `apps/server/src/contracts.ts` - Current handshake and protocol contracts without production credentials or dedicated v2 mutation events
* `apps/server/src/db/schema.ts` - Existing principals, external mappings, patch ownership, memberships, and operations
* `apps/server/src/db/repository.ts` - Existing owner-aware placement transaction and missing identity/lifecycle/removal commands
* `apps/server/src/realtime/quiltRooms.ts` - Current derived visibility and room authorization
* `apps/client/src/main.tsx` - Client provider composition point
* `apps/client/src/network/session.ts` - Anonymous catalog transport
* `apps/client/src/network/useSocketConnection.ts` - Current token-free Socket.IO handshake
* `apps/client/src/App.tsx` - Protected state, optimistic mutation, and clearing boundary
* `.github/workflows/ci.yml` - Build/test pipeline without authenticated Playwright
* `.github/workflows/cd.yml` - Deployment pipeline without migration ownership or identity configuration

### References

* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` - Primary architecture, product decisions, sequence, contracts, tests, and rollout guidance
* `.copilot-tracking/research/subagents/2026-07-28/infinite-canvas-auth-plan-verification-research.md` - Verified code anchors, likely file changes, commands, and dependency order
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Accepted stable-principal, visibility, ownership, mutation, and rollout contract

### Standards References

* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md` - Markdown structure and frontmatter conventions
* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md` - Documentation voice and clarity conventions
* `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/prompt-builder.instructions.md` - Instructions-file authoring requirements

## Architecture Overview

```text
Browser SPA + MSAL -- PKCE --> Entra External ID
Browser -- bearer / auth.token --> Express + Socket.IO replicas
API -- jose + pinned issuer/JWKS --> verified external identity
API -- exact issuer/subject --> active internal principal in PostgreSQL
Principal + persisted policy --> catalog, rooms, reads, ownership, mutation
Owner mutation --> sorted patch locks --> commit --> scoped fanout
```

## Affected Files Tree

```text
apps/
  client/
    Dockerfile
    nginx.conf
    public/auth-config.template.json
    src/
      auth/{msalConfig,AuthProvider,useAuthSession}.*
      config/runtimeConfig.*
      network/{authenticatedFetch,session,useSocketConnection}.*
      ui/{LobbyScreen,AppHeader}.*
      {main,App}.*
  server/
    migrations/0006_*.sql
    src/
      auth/{config,errors,tokenVerifier,principalContext,httpAuth,socketAuth}.*
      db/{schema,types,repository}.*
      domain/authorizationPolicy.*
      jobs/{ownershipLifecycle,principalDeletion}.*
      realtime/quiltRooms.*
      {contracts,index}.*
e2e/
  authentication.spec.ts
  support/testOidcIssuer.ts
.github/workflows/{ci,cd}.yml
infra/bicep/
package.json
package-lock.json
playwright*.config.ts
```

## Design Patterns

* External identity adapter: provider claims terminate at a narrow verified-identity boundary
* Immutable internal principal: domain ownership and attribution never depend on email, token, session, or client ID
* Policy decision point: one persisted policy model controls all protected surfaces
* Transactional command model: claim, transfer, abandonment, deletion, placement, and removal recheck authority under locks
* Fail-closed auth lifecycle: token expiry, unknown keys, blocked principals, and incomplete policy gates remove access
* Additive migration and gated enablement: schema and authenticated behavior deploy before mutation is enabled

## Implementation Checklist

### [ ] Implementation Phase 1: Provider and Release Prerequisites

<!-- parallelizable: false -->

* [ ] Step 1.1: Validate External ID and fix the public configuration contract
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 12-40)
* [x] Step 1.2: Repair migration metadata and establish release-owned migration execution
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 41-65)
* [x] Step 1.3: Decompose runtime identity and patch policy backlog
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 66-87)
* [x] Step 1.4: Validate prerequisite phase
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 88-94)
* [x] Step 1.5: Resolve Phase 1 release-contract review findings
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Phase 1, Step 1.5)

### [ ] Implementation Phase 2: Identity Persistence and Verification

<!-- parallelizable: false -->

* [ ] Step 2.1: Add principal lifecycle, mapping, audit, ownership, and visibility schema
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 99-123)
* [ ] Step 2.2: Implement verified-token and principal-context boundaries
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 124-147)
* [ ] Step 2.3: Implement transactional principal resolution and lifecycle enforcement
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 148-165)
* [ ] Step 2.4: Validate identity phase
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 166-172)

### [ ] Implementation Phase 3: Protected HTTP, Socket, and Visibility Boundaries

<!-- parallelizable: false -->

* [ ] Step 3.1: Protect HTTP resources and expose safe principal context
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 177-195)
* [ ] Step 3.2: Authenticate Socket.IO and enforce expiry
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 196-214)
* [ ] Step 3.3: Centralize persisted visibility policy
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 215-235)
* [ ] Step 3.4: Validate protected-boundary phase
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 236-242)

### [ ] Implementation Phase 4: Client Authentication Lifecycle

<!-- parallelizable: false -->

* [ ] Step 4.1: Add MSAL provider and authenticated network client
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 247-269)
* [ ] Step 4.2: Renew sockets once and clear protected state on auth loss
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 270-290)
* [ ] Step 4.3: Validate client authentication phase
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 291-297)

### [ ] Implementation Phase 5: Claims and Ownership Lifecycle

<!-- parallelizable: false -->

* [ ] Step 5.1: Implement atomic claims and quotas
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 302-320)
* [ ] Step 5.2: Implement accepted transfer and abandonment
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 321-340)
* [ ] Step 5.3: Implement recoverable account deletion and restricted operational recovery
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 341-371)
* [ ] Step 5.4: Validate ownership phase
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 372-378)

### [ ] Implementation Phase 6: Authenticated Protocol-V2 Mutations

<!-- parallelizable: false -->

* [ ] Step 6.1: Define dedicated placement and removal contracts
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 383-399)
* [ ] Step 6.2: Wire owner-only placement and implement quilt removal
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 400-419)
* [ ] Step 6.3: Reconcile optimistic client state by patch revisions
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 420-437)
* [ ] Step 6.4: Validate mutation phase while retaining the rollout flag
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 438-447)

### [ ] Implementation Phase 7: Deployment, Authenticated E2E, and Rollout

<!-- parallelizable: false -->

* [ ] Step 7.1: Replace identity bypasses with a local test OIDC issuer
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 452-475)
* [ ] Step 7.2: Configure production identity, telemetry, and fail-closed gates
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 476-496)
* [ ] Step 7.3: Split owner-only and delegated E2E gates before mutation enablement
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 497-512)

### [ ] Implementation Phase 8: Final Validation

<!-- parallelizable: false -->

* [ ] Step 8.1: Run focused and full project validation
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 517-527)
* [ ] Step 8.2: Rehearse security and rollout failure cases
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 528-531)
* [ ] Step 8.3: Fix minor issues and report blockers
  * Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md` (Lines 532-536)

## Planning Log

See `.copilot-tracking/plans/logs/2026-07-28/infinite-canvas-authentication-authorization-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Validated Microsoft Entra External ID tenant, SPA registration, API registration, delegated scope, and redirect/logout URIs
* Reconciled Drizzle migration history and release-owned one-shot migration execution
* `jose`, `@azure/msal-browser`, and `@azure/msal-react`
* PostgreSQL for migration, lifecycle, ownership, and concurrency tests
* Product, privacy, legal, support, and issue-owner approvals identified as release gates
* Local OIDC issuer for representative integration and Playwright identity tests

## Success Criteria

* Every quilt resource and real-time surface requires a server-validated active principal — Traces to: authenticated-only user requirement
* Exact external identities map transactionally to immutable internal principals without email merging — Traces to: one-identity-per-principal decision
* Claims, transfers, abandonment, deletion, policy decisions, placement, and removal are atomic and auditable — Traces to: ownership lifecycle requirements
* Auth expiry or provider failure clears all protected client state and fails closed — Traces to: approved outage behavior
* Owner-only protocol-v2 placement and removal pass replica-convergent E2E before enablement — Traces to: mutation sequencing requirement
* Delegated mutation, moderator commands, and multi-provider linking remain explicitly deferred — Traces to: confirmed initial-release scope
