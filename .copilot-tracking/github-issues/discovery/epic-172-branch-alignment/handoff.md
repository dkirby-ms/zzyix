<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# GitHub Issue Operations Handoff

## Planning Files

* .copilot-tracking/github-issues/discovery/epic-172-branch-alignment/issue-analysis.md
* .copilot-tracking/github-issues/discovery/epic-172-branch-alignment/issues-plan.md
* .copilot-tracking/github-issues/discovery/epic-172-branch-alignment/planning-log.md
* .copilot-tracking/github-issues/discovery/epic-172-branch-alignment/handoff.md

## Summary

| Action    | Count |
|-----------|-------|
| Create    | 0     |
| Update    | 10    |
| Link      | 0     |
| Close     | 0     |
| Comment   | 0     |
| No Change | 8     |

The current branch aligns to existing Epic #172 backlog items. Recommended operations are issue-body updates only; no new issues, milestone changes, relationship changes, or closes are proposed for immediate execution. #179 is a close candidate after human review if the read-only MVP is accepted as completing mutation protection.

## Issues

### Create

None.

### Update

- [ ] #175: feat(agents): add resident domain model and event contracts
  - Action: Add branch alignment note
  - Changes: Record implemented runtime/control-plane slice and keep open for product-domain model completion
  - Rationale: Branch implements agent assignments, triggers, runs, leases, checkpoints, worker-read audit, and bounded read contracts

- [ ] #178: feat(agents): enforce resident distance and disengagement controls
  - Action: Add branch alignment note
  - Changes: Record runtime-side gating, lease-loss stop/requeue behavior, and assignment-gated reads; keep open for user-facing controls
  - Rationale: Branch adds backend disengagement foundations but not artist-facing controls

- [ ] #179: feat(agents): protect artist work from resident mutations
  - Action: Add branch alignment note and request close decision
  - Changes: Record read-only worker, restricted DSN verification, canonical server authority, and observation-only proposal behavior
  - Rationale: Current branch appears to satisfy MVP mutation-prevention scope, but close should wait for maintainer confirmation

- [ ] #180: feat(agents): add privacy-bounded resident creative memory
  - Action: Add branch alignment note
  - Changes: Record memory-disabled defaults, redaction, bounded context, and disabled Foundry gates; keep open for creative memory implementation
  - Rationale: Branch adds privacy foundations but not resident memory behavior

- [ ] #181: feat(agents): orchestrate resident behavior tiers and cadence
  - Action: Add branch alignment note
  - Changes: Record trigger polling, run serialization, lease renewal, stale-trigger reclaim, queue guards, and gateway rate/concurrency limits
  - Rationale: Branch adds runtime cadence primitives but not final behavior tier policy

- [ ] #183: feat(agents): add resident observability and operational controls
  - Action: Add branch alignment note
  - Changes: Record redacted worker telemetry, worker-read telemetry, Application Insights wiring, feature gates, deployment verification, and remaining ops gaps
  - Rationale: Branch substantially advances observability and controls but production monitoring workflows remain open

- [ ] #184: test(agents): validate resident behavior across users and replicas
  - Action: Add branch alignment note
  - Changes: Record app-only auth tests, agent principal tests, worker-read route tests, control-plane contention tests, and multi-replica reconnect evidence
  - Rationale: Branch covers runtime and server foundations but not full user-visible resident behavior across users/replicas

- [ ] #189: test(agents): evaluate resident behavior and model outputs
  - Action: Add branch alignment note
  - Changes: Record gateway fallback, budget, timeout, malformed-response, lease-loss, and observation-only output tests; keep open for model evaluation suite
  - Rationale: Branch tests the gateway and workflow edges but not full model-output quality/safety evaluation

- [ ] #190: ops(agents): govern model-assisted resident behavior in production
  - Action: Add branch alignment note
  - Changes: Record worker deployment, app-only auth, managed-identity runbook, restricted DSN verification, telemetry config, model-free defaults, and Foundry gates
  - Rationale: Branch adds production governance foundations but environment activation and live governance evidence remain open

- [ ] #191: [Work Item] Implement agent worker runtime testing plan
  - Action: Add branch alignment note
  - Changes: Record completed worker test inventory and remaining blockers: worker pytest CI lane, PostgreSQL integration CI lane, AGENT_WORKER_POSTGRES_TEST_DSN evidence, and possibly missing real-framework runtime-contract test module
  - Rationale: Branch partially satisfies #191 but CI and non-skipped persistence evidence remain unfinished

### Link (Sub-Issues)

None. Epic #172 already has the relevant direct sub-issues.

### Close

None pending immediate execution. Consider closing #179 only after maintainer review accepts the read-only MVP as completing mutation protection.

### Comment

None.

### No Change

- [ ] (No Change) #172: [Epic] Fantome agent design and implementation
  - Keep as the parent epic; update child issues instead.

- [ ] (No Change) #173: arch(agents): define resident behavior architecture and authority boundaries
  - Already closed and implemented by current branch architecture and authority boundaries.

- [ ] (No Change) #176: feat(agents): prototype quiet witness resident presence
  - No user-visible quiet witness prototype is implemented on this branch.

- [ ] (No Change) #177: feat(agents): prototype social interpretation around resident marks
  - No social interpretation or resident mark UI behavior is implemented on this branch.

- [ ] (No Change) #182: feat(agents): add gated historical and mythic resident events
  - No curated historical/mythic event behavior is implemented on this branch.

- [ ] (No Change) #185: arch(agents): decide deterministic versus LLM resident behavior
  - Already closed; branch implements deterministic authority with gated model behavior.

- [ ] (No Change) #186: arch(agents): evaluate resident agent framework and tool boundaries
  - Already closed; branch implements Python Agent Framework workflow with read-only tools.

- [ ] (No Change) #187: security(agents): define resident model policy and prompt boundaries
  - Already closed; branch implements prompt/model boundary foundations.

- [ ] (No Change) #188: arch(agents): isolate model providers behind a governed gateway
  - Already closed; branch implements a governed gateway/fallback path.
<!-- markdown-table-prettify-ignore-end -->