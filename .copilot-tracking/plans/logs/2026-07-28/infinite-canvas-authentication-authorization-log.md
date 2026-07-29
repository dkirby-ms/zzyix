<!-- markdownlint-disable-file -->
# Planning Log: Infinite-Canvas Authentication and Authorization

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-03: Product policy does not define the day-30 outcome when a deletion-pending principal still owns patches
  * Source: `.copilot-tracking/research/subagents/2026-07-28/infinite-canvas-auth-plan-verification-research.md` (Lines 320-329)
  * Reason: Phase 5 fails deletion completion closed until transfer or abandonment; forced resolution requires separate product/privacy approval
  * Impact: high
* DR-04: Pseudonymous attribution and authorization-audit retention periods remain unapproved
  * Source: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` (Lines 353-358)
  * Reason: Schema supports retention, but production completion and pruning remain gated on product, privacy, and legal approval
  * Impact: high
* DR-05: GitHub issue 98 includes delegated-capability acceptance while delegation is deferred
  * Source: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` (Lines 245-248)
  * Reason: Phase 7 requires issue-owner action to split owner-only E2E from later delegation or leave the broader issue blocked
  * Impact: medium

### Resolved Validation Findings

* DR-01: Resolved by authorized-administrator confirmation of the External ID tenant, branding, domain, sign-in methods, and SPA/API registration; published staging variables pass URL, same-origin, scope, audience, and algorithm validation
* DR-02: Resolved by Phase 1, Step 1.2, which restored reviewed snapshots 0003 through 0005 and validated fresh-versus-upgrade schema parity through migration rehearsal
* DR-06: Revalidated as resolved by Phase 1, Step 1.3, which assigns issue 14 runtime criteria, named issue 94 child ownership, dependency links, and issue 98 treatment with measurable completion criteria
* DR-07: Revalidated as resolved by limiting claim eligibility to active human principal status, unclaimed lifecycle, persisted claim-enabled policy, and approved quotas; admission, terms, and moderation predicates remain excluded until authoritative contracts exist
* DR-08: Revalidated as resolved by an offline Azure RBAC-restricted command requiring immutable operator identity, approved support ticket, reason, before/after state, and audit; it can recover deletion-pending accounts or cancel pending transfers but cannot assign ownership

### Plan Deviations from Research

* DD-01: Persist explicit visibility policy in the initial authentication schema
  * Research recommends: Either persist the accepted ADR visibility contract or document authenticated-only derived policy as a narrower initial baseline
  * Plan implements: Persisted visibility with one central evaluator in Phases 2 and 3
  * Rationale: The accepted quilt ADR requires one policy across catalogs, fine data, aggregates, presence, search, replay, and mutation; extending derived lifecycle matrices would preserve current drift
* DD-02: Require user-resolved ownership before deletion completion
  * Research recommends: Resolve ownership before completion but leaves forced resolution behavior open
  * Plan implements: Fail closed at day 30 while owned patches remain, pending approved forced-resolution policy
  * Rationale: Automatic abandonment or transfer would alter ownership without an approved actor or appeal path

### Implementation Deviations

* DD-03: Pin Drizzle Kit to stable version 0.31.10
  * Plan specifies: Reconcile migration metadata through migration 0005
  * Implementation differs: Pins the compatible stable generator while restoring snapshots
  * Rationale: The previously resolved release candidate could not import the installed Drizzle ORM package
* DD-04: Include the shared quilt topology source in the client image build
  * Plan specifies: Generate public authentication configuration at client container startup
  * Implementation differs: Also copies the existing shared client import into the Docker build context
  * Rationale: The production image build omitted a module already required by the client workspace
* DD-05: Queue CD releases and fail closed on active migration executions
  * Plan specifies: Exactly one release step applies migrations before incompatible replicas start
  * Implementation differs: Disables workflow cancellation and refuses to mutate or start the migration job while an Azure execution is active
  * Rationale: Cancelling runner-side polling does not cancel the external Azure execution, so queued releases and explicit execution checks preserve one migration owner
* DD-06: Reconcile migration job settings through the generic Azure resource surface
  * Plan specifies: Reassert and verify manual trigger, parallelism, completion count, timeout, and retries on every deployment
  * Implementation differs: Uses supported Container Apps update flags plus `az resource update` for trigger and persisted configuration fields
  * Rationale: `az containerapp job update` does not expose a trigger-type option; post-update verification fails closed on drift
* DD-07: Use same-origin browser API routing
  * Plan specifies: Supply a browser-reachable API origin while the server retains internal ingress
  * Implementation differs: Requires the configured API origin to equal the registered client origin and proxies explicit API roots through nginx and Vite
  * Rationale: This keeps the server private, avoids a second public origin, and gives future protected routes one documented browser boundary
* DD-08: Serialize first-login provisioning with two-key advisory locks
  * Plan specifies: Concurrent exact identity resolution converges to one immutable principal and mapping
  * Implementation differs: Uses PostgreSQL transaction advisory locks over independent issuer and subject hashes before querying or inserting
  * Rationale: This follows existing transaction-lock patterns and avoids invalid NUL-delimited PostgreSQL text while preserving exact tuple concurrency
* DD-09: Backfill conservative persisted visibility in migration 0006
  * Plan specifies: Every patch resolves from one explicit persisted visibility policy
  * Implementation differs: Adds reviewed data-migration SQL after generated schema SQL to create policy rows for existing patches
  * Rationale: Drizzle cannot infer required backfill semantics, and leaving existing patches without policy would violate fail-closed consistency
* DD-10: Require complete visibility for legacy protocol admission
  * Plan specifies: One persisted policy controls each protected surface
  * Implementation differs: Admits the monolithic legacy protocol only when every surface it exposes is visible and permits its mutation path only with ownership of every exposed patch
  * Rationale: The legacy contract cannot selectively hide fields, so all-surfaces admission prevents policy bypass while protocol-v2 remains disabled
* DD-11: Persist complete policy graphs during compatibility session creation
  * Plan specifies: Missing policy fails closed
  * Implementation differs: Session creation atomically creates the compatibility quilt, unclaimed patch, and authenticated mutation-disabled visibility policy
  * Rationale: A session without its policy graph would become immediately inaccessible under the required fail-closed evaluator
* DD-12: Clear client state by destroying the authenticated application subtree
  * Plan specifies: Every protected artifact is cleared before rendering signed-out state
  * Implementation differs: Auth loss unmounts the complete protected App subtree instead of individually resetting each state container
  * Rationale: Lifecycle teardown also disconnects sockets and prevents newly added protected caches from surviving because an explicit reset list was missed
* DD-13: Use current MSAL v5 configuration fields
  * Plan specifies: Configure MSAL authorization code with PKCE and browser-managed token cache
  * Implementation differs: Uses supported MSAL v5 configuration with explicit `sessionStorage` and omits removed legacy navigation and cookie fields
  * Rationale: The installed MSAL types reject obsolete fields while preserving the required authentication and storage behavior

## Implementation Paths Considered

### Selected: Entra External ID SPA Tokens with Server-Validated Principals

* Approach: Use authorization code with PKCE in the SPA, REST bearer tokens, Socket.IO `auth.token`, `jose` verification, exact issuer/subject mappings, PostgreSQL policy, and owner-only transactional commands
* Rationale: It supports public self-service users, stateless validation across replicas, immediate local disable, and provider-independent durable domain identity
* Evidence: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` (Lines 129-163)

### IP-01: Backend-for-Frontend Cookie Session

* Approach: Proxy browser identity through an application session cookie and keep provider tokens server-side
* Trade-offs: Reduces browser token exposure, but requires same-site routing, CSRF protection, distributed session storage, and additional Socket.IO session operations
* Rejection rationale: It adds an operating plane and deployment topology work not required for the initial public SPA integration

### IP-02: Azure Container Apps Built-In Authentication

* Approach: Delegate token validation and user context to platform authentication on each Container App
* Trade-offs: Reduces some middleware, but separate client and API apps do not share one automatic session boundary and domain policy/mapping still remains necessary
* Rejection rationale: It does not remove the core principal, lifecycle, visibility, Socket.IO, and transaction requirements

### IP-03: Entra Workforce Tenant

* Approach: Authenticate users through an organization workforce tenant
* Trade-offs: Familiar Microsoft administration, but membership and invitations are organization-controlled
* Rejection rationale: It conflicts with the confirmed public self-service community audience

### IP-04: Auth0 Fallback

* Approach: Use Auth0 SPA authorization code with PKCE and preserve the same server verifier and issuer/subject mapping boundary
* Trade-offs: Technically suitable and architecture-compatible, but adds a vendor and operating plane
* Rejection rationale: Retain only if target-subscription validation proves Entra External ID unsuitable

## Suggested Follow-On Work

Items identified during planning that fall outside current implementation scope.

* WI-15: Correct staging same-origin configuration — Set `SERVER_CORS_ORIGIN` to the exact absolute HTTPS client origin and rerun release validation (blocking priority, small effort)
  * Source: Phase 12 external evidence reconciliation
  * Dependency: Staging environment administration access
* WI-16: Configure staging release protections — Add required reviewers and approval variables for retention, telemetry, rollback, deletion completion, migration rehearsal, owner E2E, mutation rollback, and benchmark approval (blocking priority, medium effort)
  * Source: Phase 12 external evidence reconciliation
  * Dependency: Repository and environment administration access
* WI-17: Reconcile issues 14 and 98 — Separate owner-only release acceptance from delegated and broader protocol-v2 scope without closing unmet criteria (blocking priority, small effort)
  * Source: Phase 12 external evidence reconciliation
  * Dependency: Issue owner access

* WI-13: Apply operational recovery infrastructure in staging — Deploy the declared recovery job and custom invocation role, then verify the workflow identity can invoke only that job (blocking priority, small effort)
  * Source: Phase 11, Step 11.2
  * Dependency: Staging Azure access and secret-backed deployment parameters
* WI-14: Require authenticated multi-replica branch check — Add the named CI check to repository branch protection (blocking priority, small effort)
  * Source: Phase 11, Step 11.3
  * Dependency: Repository administration access

### Review Remediation Intake

* DD-14: Fresh full review supersedes the all-phases-complete release claim
  * Plan specifies: The original eight implementation phases are complete
  * Implementation differs: Phases 9 through 12 now track critical and major remediation from the 2026-07-29 review
  * Rationale: Fresh validators found authorization replay, deletion operations, boundary, rollout, and coverage defects that require explicit implementation and validation

* WI-01: Delegated mutation grants and moderator commands — Add scoped grants, audited moderator assignment, dispute handling, and delegated E2E after policy approval (high priority, large effort)
  * Source: Research potential next work and confirmed initial-release deferral
  * Dependency: Stable production identity and owner-only mutation rollout
* WI-02: Audited multi-provider identity linking — Add proof-of-control, conflict, unlink, recovery, and takeover-resistant workflows (medium priority, medium effort)
  * Source: Confirmed one-mapping initial decision
  * Dependency: Principal lifecycle and authorization audit in production
* WI-03: Operational recovery governance review — Reassess RBAC roles, support-ticket controls, and intervention scope before adding moderator commands (medium priority, small effort)
  * Source: Resolved DR-08 and research remaining validation
  * Dependency: Production use of the restricted recovery command
* WI-04: Retention policy implementation — Apply approved audit and pseudonymous-attribution durations with pruning and legal-hold behavior (high priority, medium effort)
  * Source: DR-04
  * Dependency: Product, privacy, and legal approval
* WI-05: Production authorization benchmarks — Measure mapping, policy listing, claim, transfer, placement, and removal latency at representative cardinality (high priority, medium effort)
  * Source: Research remaining validation
  * Dependency: Implemented schema and representative data
* WI-06: Legacy protocol and storage retirement — Remove protocol v1 and obsolete compatibility data only after authenticated v2 canary and rollback gates pass (high priority, large effort)
  * Source: Accepted quilt rollout contract
  * Dependency: This plan, production benchmark, canary evidence, and rollback approval
* WI-08: Validate migration-job reconciliation in staging — Run CD against the target subscription and verify active-execution refusal, resource-setting reconciliation, migration completion, and subsequent rollout ordering (blocking priority, small effort)
  * Source: Phase 1, Step 1.5 review rework
  * Dependency: Staging deployment access
* WI-09: Review moderate dependency advisories — Assess the four moderate workspace advisories reported during `jose` installation and remediate without destabilizing identity dependencies (medium priority, small effort)
  * Source: Phase 2 dependency installation
  * Dependency: Phase 2 dependency graph
* WI-10: Provision restricted operational recovery — Create the dedicated Container Apps recovery job, configure `RECOVERY_JOB_NAME`, assign narrow Azure RBAC, and require reviewers on the `operational-recovery` GitHub Environment (blocking priority, medium effort)
  * Source: Phase 5 operational recovery implementation
  * Dependency: Staging deployment access and support governance approval
* WI-11: Approve production authorization budgets — Repeat the 10,000-row benchmark on representative production infrastructure and approve service budgets for mapping, policy, claim, transfer, placement, and removal (blocking priority, small effort)
  * Source: Phase 8 local benchmark evidence
  * Dependency: Representative production infrastructure and service-owner approval
* WI-12: Approve telemetry and rollback gates — Review redacted telemetry fields, alert thresholds, rollback criteria, and accountable approvers before mutation enablement (blocking priority, small effort)
  * Source: Phase 7 rollout gates and Phase 8 validation
  * Dependency: Staging evidence and operational approval

### Resolved Implementation Dependency

* Phase 6, Step 6.4: Resolved by Phase 7's double-gated local OIDC issuer and passing authenticated two-replica owner-mutation convergence gate.

## User Decisions

* ID-01: External ID tenant and application configuration — Confirmed complete by the authorized administrator
  * Rationale: Published staging variables and secret presence were independently validated without exposing secret values
