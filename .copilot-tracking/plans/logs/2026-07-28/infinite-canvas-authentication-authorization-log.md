<!-- markdownlint-disable-file -->
# Planning Log: Infinite-Canvas Authentication and Authorization

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-01: External ID tenant availability, pricing, custom domain, branding, and sign-in methods cannot be proven from the repository
  * Source: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` (Lines 353-358)
  * Reason: Phase 1 makes target-subscription validation a prerequisite and records exact configuration only after validation
  * Impact: high
* DR-02: Drizzle snapshot metadata stops at 0002 while the migration journal reaches 0005
  * Source: `.copilot-tracking/research/subagents/2026-07-28/infinite-canvas-auth-plan-verification-research.md` (Lines 75-82)
  * Reason: Phase 1 requires repair before auth migration generation; the plan does not fabricate snapshots
  * Impact: high
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
* WI-07: Complete External ID tenant and application registration — Have an authorized administrator approve the external tenant, branding, domain, sign-in methods, SPA/API registrations, delegated scope, and environment values (blocking priority, small effort)
  * Source: Phase 1, Step 1.1
  * Dependency: External ID administrative access and product approval
* WI-08: Validate migration-job reconciliation in staging — Run CD against the target subscription and verify active-execution refusal, resource-setting reconciliation, migration completion, and subsequent rollout ordering (blocking priority, small effort)
  * Source: Phase 1, Step 1.5 review rework
  * Dependency: WI-07 approved environment values and staging deployment access
