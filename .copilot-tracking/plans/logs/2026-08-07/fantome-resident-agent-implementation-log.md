<!-- markdownlint-disable-file -->
# Planning Log: Fantome Resident Agent Implementation

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-01: Entra app-registration and tenant topology are not fully confirmed.
  * Source: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 49-52)
  * Reason: The research identifies the need for a distinct app-only token path but does not provide tenant-specific registration IDs, role assignment process, or issuer and audience values.
  * Impact: high
* DR-02: Initial trigger producers and coalescing semantics remain undefined.
  * Source: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 53-56)
  * Reason: Queue bounds and idempotency need product policy choices about what constitutes meaningful resident-agent work.
  * Impact: medium
* DR-03: Production operating limits are unresolved.
  * Source: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 57-59)
  * Reason: Retention, backoff, queue size, model budget, latency, ingress policy, and cost thresholds require deployment-specific policy values.
  * Impact: medium
* DR-04: Worker-to-server internal ingress and restricted PostgreSQL role topology need environment confirmation.
  * Source: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 357-366)
  * Reason: Infrastructure implementation depends on final ACA networking, managed identity, and database role assignment decisions.
  * Impact: medium

### Plan Deviations from Research

* DD-01: Agent principals are pre-provisioned and never auto-created.
  * Research recommends: Unknown agent identities must be rejected because existing principal auto-provisioning creates `human` principals.
  * Plan implements: A dedicated agent lookup path that accepts only active, pre-provisioned `agent` principals.
  * Rationale: This preserves an auditable identity boundary and avoids silent elevation or accidental human-principal creation.
* DD-02: Worker canonical reads use server HTTP routes instead of Socket.IO subscriptions.
  * Research recommends: Fine-grained snapshots and replay are currently Socket.IO-only, while worker HTTP routes do not exist.
  * Plan implements: Versioned worker-only HTTP routes backed by repository authorization-aware reads.
  * Rationale: HTTP routes give the Python worker typed contracts and app-only auth without exposing Socket.IO or broad event surfaces.
* DD-03: Worker writes directly only to the restricted control-plane schema.
  * Research recommends: The worker may write only a new restricted schema and must not write canonical quilt state.
  * Plan implements: Direct PostgreSQL access for leases, triggers, runs, checkpoints, tool outcomes, model metadata, and lifecycle audit, with grants denied on canonical tables.
  * Rationale: Lease claim and checkpoint operations need transactional locality, while canonical quilt authority remains server-owned.
* DD-04: Agent Framework is used inside an explicit supervisor and graph Workflow, not as a broad Harness runtime.
  * Research recommends: Use Python Agent Framework with explicit Workflow and defer Harness features that exceed the V1 threat model.
  * Plan implements: A Python supervisor around a graph Workflow, fake gateway first, governed model gateway second, and memory disabled.
  * Rationale: Supervisor-owned leases, retries, and checkpoints make failure behavior explicit and testable.
* DD-05: Host Python validation command unavailable in current environment.
  * Plan specifies: Run `python -m pytest apps/agent-worker/tests` during Phase 3 validation.
  * Implementation differs: Worker tests were authored, but execution is blocked because the host lacks `python` alias and `pytest` tooling.
  * Rationale: Proceeded with code implementation and alternate compile/docker validation to maintain phase momentum.

## Implementation Paths Considered

### Selected: Separate Python worker with restricted control plane and server-owned reads

* Approach: Create `apps/agent-worker` as a Python Microsoft Agent Framework worker with a supervisor and graph Workflow. Give it direct PostgreSQL access only to a restricted agent-control-plane schema and typed app-only HTTP access to server-owned canonical read routes.
* Rationale: This satisfies the accepted Python runtime, one-active-workflow-per-quilt, recovery, server authority, no Socket.IO, no broad canonical database access, memory-disabled prompt policy, managed identity, telemetry, and independent deployment requirements.
* Evidence: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 340-355)

### IP-01: Put the resident loop in the TypeScript server

* Approach: Add background resident-agent scheduling and model calls inside the existing server process.
* Trade-offs: Reuses existing server infrastructure, but couples public serving to long-running workflow, lease renewal, model dependency, and failure isolation concerns.
* Rejection rationale: It conflicts with the accepted Python Agent Framework architecture and weakens runtime isolation.

### IP-02: Use Agent Framework Harness for V1

* Approach: Build the worker around Agent Framework Harness capabilities for planning, memory, compaction, approval, and broad tools.
* Trade-offs: Provides a broader agent runtime, but introduces memory, approval, and tool surfaces outside the read-only MVP threat model.
* Rejection rationale: The accepted architecture explicitly defers Harness-style capabilities until a later security decision.

### IP-03: Give the worker broad canonical database access

* Approach: Allow the Python worker to query canonical quilt tables directly for snapshots and replay.
* Trade-offs: Reduces server route work, but bypasses authorization-aware repositories and makes observation look like authority.
* Rejection rationale: It violates the server-only canonical authority boundary and least-privilege database design.

### IP-04: Put all worker state behind server APIs

* Approach: Keep leases, triggers, checkpoints, runs, and audit entirely behind TypeScript server endpoints.
* Trade-offs: Centralizes service ownership, but makes high-frequency transactional lease and checkpoint operations remote and increases server responsibilities.
* Rejection rationale: A restricted control-plane schema gives stronger transactional behavior while still denying canonical writes.

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Confirm Entra app-role topology - Decide same-tenant role assignment versus separate agent API registration, then document issuer, audience, role name, and managed identity assignment. (priority: high, effort: medium)
  * Source: DR-01 and research follow-up items.
  * Dependency: Must complete before production auth rollout.
* WI-02: Define trigger policy - Select initial trigger producers, deduplication keys, coalescing behavior, pending queue bounds, and feature-gate defaults. (priority: medium, effort: medium)
  * Source: DR-02.
  * Dependency: Required before enabling non-test trigger producers.
* WI-03: Set operating limits - Define retention, retry, backoff, model budget, latency targets, redaction policy, and cost guardrails. (priority: medium, effort: medium)
  * Source: DR-03.
  * Dependency: Required before Foundry activation beyond fake-gateway validation.
* WI-04: Verify ACA ingress and database role design - Confirm internal worker-to-server route access, private PostgreSQL connectivity, and least-privilege grant mechanics in the target deployment topology. (priority: medium, effort: medium)
  * Source: DR-04.
  * Dependency: Required before production deployment.
* WI-05: Seed and operate agent principal provisioning - Define repeatable provisioning and deprovisioning for `app:<applicationId>` agent principals before runtime activation. (priority: high, effort: low)
  * Source: Phase 1 implementation.
  * Dependency: Required before worker authentication is enabled in shared environments.
* WI-06: Align deployment configuration for app-only worker auth - Set and validate `AUTH_AGENT_TRUSTED_ISSUER`, `AUTH_AGENT_API_AUDIENCE`, and `AUTH_AGENT_REQUIRED_ROLE` for each environment. (priority: high, effort: low)
  * Source: Phase 1 implementation.
  * Dependency: Required before worker route rollout.
* WI-07: Expand restricted-role negative coverage - Add explicit denial tests for worker role writes on additional canonical authorization and ownership tables. (priority: low, effort: low)
  * Source: Phase 2 implementation.
  * Dependency: Recommended before broad rollout.
* WI-08: Normalize Python runtime tooling for CI and local validation - Ensure `python` alias and `pytest` are available so Phase 3 and Phase 5 required commands can run unchanged. (priority: high, effort: low)
  * Source: Phase 3 validation execution.
  * Dependency: Required before final validation sign-off.
* WI-09: Confirm deployment activation prerequisites - Verify ACA internal ingress, restricted PostgreSQL grants, Entra app-role topology, and production operating limits before enabling worker gates. (priority: high, effort: medium)
  * Source: Phase 4 deployment implementation.
  * Dependency: Required before production activation.
* WI-10: Add worker restart e2e fixture - Exercise a real worker process restart and checkpoint recovery in the multi-replica test environment. (priority: high, effort: medium)
  * Source: Phase 5 validation.
  * Dependency: Requires Python test tooling and worker process orchestration.
