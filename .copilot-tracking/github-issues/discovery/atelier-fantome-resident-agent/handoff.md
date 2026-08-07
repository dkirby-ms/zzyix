<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# GitHub Issue Planning Handoff

## Planning Files

* `.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issue-analysis.md`
* `.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md`
* `.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/planning-log.md`
* `.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/handoff.md`

## Summary

| Action | Count |
|--------|-------|
| Create | 17 issues |
| Update | 0 |
| Link | 0 live links; draft parent-child relationships documented |
| Close | 0 |
| Comment | 0 |
| No Change | 0 |

**Execution status**: Complete. Seventeen new issues were created, assigned to `Mosaic Agents MVP`, and linked under #172. #174 was closed as an accidental duplicate of #175.

**Execution status note**: The #155 historical-mosaic overlap remains documented on #182 for follow-up. #130 was not duplicated; #172 is the requested implementation parent.

## Issues

### Update

- [x] (No Change) #130 `[Epic] The Atelier Phantom`
  - Rationale: Existing parent proposal was intentionally left unchanged because the requested new issues were created under #172.

### Create

- [x] #173 `feat(agents): define resident behavior architecture and authority boundaries`
  - Labels: `feature, agents`, Milestone: none
  - Body: Decide server authority, persistence, replica consistency, event ordering, idempotency, and mutation conflicts.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #175 `feat(agents): add resident domain model and event contracts`
  - Labels: `feature, agents`, Milestone: none
  - Body: Model resident marks, motifs, visits, attention, social references, and memory classification.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #176 `feat(agents): prototype quiet witness resident presence`
  - Labels: `feature, agents`, Milestone: none
  - Body: Method 6 low-fidelity prototype for subtle, discoverable, non-destructive resident presence.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #177 `feat(agents): prototype social interpretation around resident marks`
  - Labels: `feature, agents`, Milestone: none
  - Body: Prototype comments and response tags while preserving multiple interpretations.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #178 `feat(agents): enforce resident distance and disengagement controls`
  - Labels: `feature, agents`, Milestone: none
  - Body: Artist-controlled distance, suppression, quiet periods, and move-on behavior across replicas and reconnects.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #179 `feat(agents): protect artist work from resident mutations`
  - Labels: `feature, agents`, Milestone: none
  - Body: Server invariants against overwrite, deletion, impersonation, and authorship confusion.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #180 `feat(agents): add privacy-bounded resident creative memory`
  - Labels: `feature, agents, security`, Milestone: none
  - Body: Creative memory with sensitive-memory exclusion, consent, retention, deletion, and audit controls.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #181 `feat(agents): orchestrate resident behavior tiers and cadence`
  - Labels: `feature, agents`, Milestone: none
  - Body: Cadence, cooldowns, rate limits, fairness, replay, feature flags, and rare-event containment.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #182 `feat(agents): add gated historical and mythic resident events`
  - Labels: `feature, agents`, Milestone: none
  - Body: Sparse historical echoes and symbolic mood events behind evidence and content gates.
  - Parent: #172
  - Similarity: Similar to #155, `Recreate famous historical mosaics in the app autonomously`; relationship and milestone require review.

- [x] #183 `feat(agents): add resident observability and operational controls`
  - Labels: `feature, agents, infrastructure`, Milestone: none
  - Body: Telemetry, moderation, audit, feature flags, kill switches, and recovery controls.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #184 `test(agents): validate resident behavior across users and replicas`
  - Labels: `feature, agents`, Milestone: none
  - Body: Unit, property, integration, end-to-end, and representative environment validation.
  - Parent: #172
  - Similarity: Not assessed.

- [x] #185 `arch(agents): decide deterministic versus LLM resident behavior`
  - Labels: `feature, agents, needs-architecture`, Milestone: `Mosaic Agents MVP`
  - Body: Decide whether any resident capability requires an LLM versus deterministic behavior.
  - Parent: #172
  - Similarity: No matching issue found.

- [x] #186 `arch(agents): evaluate resident agent framework and tool boundaries`
  - Labels: `feature, agents, needs-architecture`, Milestone: `Mosaic Agents MVP`
  - Body: Evaluate framework use and define least-privilege resident tools.
  - Parent: #172
  - Similarity: No matching issue found.

- [x] #187 `security(agents): define resident model policy and prompt boundaries`
  - Labels: `security, agents, needs-architecture`, Milestone: `Mosaic Agents MVP`
  - Body: Define prompt, memory, injection, content-policy, and structured-output boundaries.
  - Parent: #172
  - Similarity: No matching issue found.

- [x] #188 `arch(agents): isolate model providers behind a governed gateway`
  - Labels: `feature, agents, infrastructure, needs-architecture`, Milestone: none
  - Body: Add a governed server-side provider gateway only if model use is approved.
  - Parent: #172
  - Similarity: No matching issue found.

- [x] #189 `test(agents): evaluate resident behavior and model outputs`
  - Labels: `feature, agents`, Milestone: none
  - Body: Build replayable quality, safety, privacy, tool, latency, cost, and frequency evaluations.
  - Parent: #172
  - Similarity: No matching issue found.

- [x] #190 `ops(agents): govern model-assisted resident behavior in production`
  - Labels: `agents, infrastructure, security`, Milestone: none
  - Body: Operate model calls and tools with audit, budgets, retention, incident response, and kill switches.
  - Parent: #172
  - Similarity: No matching issue found.

## Review Decision

Execution completed. The remaining follow-up is to resolve the documented relationship between #182 and #155 during implementation planning.
<!-- markdown-table-prettify-ignore-end -->
