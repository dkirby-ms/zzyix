<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Issues Plan

* **Repository**: dkirby-ms/zzyix
* **Milestone**: Mosaic Agents MVP

## IS001 - No Change - Epic #172 parent alignment

Keep #172 as the parent epic. Current branch work maps to existing child issues and does not require changing the epic title, state, or milestone.

IS001 - Similarity: #172=Match

* IS001 - issue_number: #172
* IS001 - title: [Epic] Fantome agent design and implementation
* IS001 - state: open
* IS001 - labels: none
* IS001 - milestone: Mosaic Agents MVP
* IS001 - assignees: none

### IS001 - body

```markdown
No issue body update recommended. Keep alignment changes on child issues.
```

### IS001 - Relationships

* IS001 - parent-of - #173, #175, #176, #177, #178, #179, #180, #181, #182, #183, #184, #185, #186, #187, #188, #189, #190, #191: Existing direct sub-issues under the epic.

## IS002 - Update - #175 resident domain model and event contracts

Update #175 to note partial implementation of the runtime domain/control-plane foundation: agent principals, assignments, triggers, runs, leases, checkpoints, worker-read authorization audit, and bounded read contracts. Keep open because full resident domain concepts such as marks, motifs, visits, attention, social references, and creative memory remain product/domain work.

IS002 - Similarity: #175=Similar

* IS002 - issue_number: #175
* IS002 - title: feat(agents): add resident domain model and event contracts
* IS002 - state: open
* IS002 - labels: area:backend
* IS002 - milestone: Mosaic Agents MVP
* IS002 - assignees: none

### IS002 - body

```markdown
## Branch alignment note

Current branch implements the first runtime/control-plane slice for resident agents: durable agent assignments, triggers, runs, leases, checkpoints, worker-read authorization audit, and bounded read contracts. This satisfies the infrastructure side of the domain/event foundation.

Keep this issue open for the remaining product-domain model: resident marks, motifs, visits, attention, social references, and creative memory semantics.
```

### IS002 - Relationships

* IS002 - sub-issue-of - #172: Existing epic relationship.

## IS003 - Update - #178 resident distance and disengagement controls

Update #178 with implemented feature gates, model-free default behavior, lease-loss stop/requeue behavior, assignment gating, and production flags. Keep open because artist-facing distance, suppression, quiet-period, and move-on controls are not implemented yet.

IS003 - Similarity: #178=Similar

* IS003 - issue_number: #178
* IS003 - title: feat(agents): enforce resident distance and disengagement controls
* IS003 - state: open
* IS003 - labels: area:backend
* IS003 - milestone: Mosaic Agents MVP
* IS003 - assignees: none

### IS003 - body

```markdown
## Branch alignment note

Current branch adds runtime-side disengagement foundations: feature gates for model-free, Foundry, and structured-proposal behavior; lease-loss interruption; requeue on unavailable/lost leases; and assignment-gated reads.

Keep this issue open for user-facing controls such as artist-selected distance, suppression, quiet periods, and explicit move-on behavior across reconnects.
```

### IS003 - Relationships

* IS003 - sub-issue-of - #172: Existing epic relationship.

## IS004 - Update - #179 artist work mutation protection

Update #179 with branch evidence and ask for maintainer review on whether the read-only MVP completes the issue. The current branch strongly satisfies mutation protection by keeping canonical quilt writes under the server and limiting the worker to reads plus observation-only proposals.

IS004 - Similarity: #179=Match

* IS004 - issue_number: #179
* IS004 - title: feat(agents): protect artist work from resident mutations
* IS004 - state: open
* IS004 - labels: area:backend, area:security
* IS004 - milestone: Mosaic Agents MVP
* IS004 - assignees: none

### IS004 - body

```markdown
## Branch alignment note

Current branch implements the read-only resident-agent MVP. The worker cannot mutate canonical quilt state, cannot write canonical quilt tables through its restricted control-plane DSN, uses assignment-gated internal read routes, and can produce only observation-style proposals by default.

Recommended review decision: close this issue as completed if the accepted bar is MVP mutation prevention. Keep open only if this issue is intended to cover future mutation proposal review and approval flows.
```

### IS004 - Relationships

* IS004 - sub-issue-of - #172: Existing epic relationship.

## IS005 - Update - #180 privacy-bounded resident creative memory

Update #180 as partial. The branch implements memory-disabled defaults, redacted tool/model context, telemetry redaction, bounded payloads, and no raw prompt/model retention. It does not implement resident creative memory, retention controls, consent, deletion, or audit UX.

IS005 - Similarity: #180=Similar

* IS005 - issue_number: #180
* IS005 - title: feat(agents): add privacy-bounded resident creative memory
* IS005 - state: open
* IS005 - labels: area:security
* IS005 - milestone: Mosaic Agents MVP
* IS005 - assignees: none

### IS005 - body

```markdown
## Branch alignment note

Current branch implements privacy foundations for the MVP: memory remains disabled, tool/model context is redacted and bounded, raw prompts and model responses are not stored in telemetry, and Foundry behavior stays gated off by default.

Keep this issue open for creative memory itself, including consent, retention, deletion, sensitive-memory exclusion, and audit controls.
```

### IS005 - Relationships

* IS005 - sub-issue-of - #172: Existing epic relationship.

## IS006 - Update - #181 resident behavior tiers and cadence

Update #181 with implemented runtime cadence primitives: polling, trigger claiming, coalescing/deduplication schema, run serialization, lease renewal, stale-trigger reclaim, queue capacity guards, gateway rate/concurrency limits, and model-free default gating. Keep open for full behavior tier policy and product cadence tuning.

IS006 - Similarity: #181=Similar

* IS006 - issue_number: #181
* IS006 - title: feat(agents): orchestrate resident behavior tiers and cadence
* IS006 - state: open
* IS006 - labels: area:backend
* IS006 - milestone: Mosaic Agents MVP
* IS006 - assignees: none

### IS006 - body

```markdown
## Branch alignment note

Current branch implements runtime cadence foundations: assigned trigger polling, run serialization, lease acquisition and renewal, stale-trigger reclaim, requeue behavior, queue capacity enforcement, gateway rate/concurrency limits, and model-free default gating.

Keep this issue open for complete resident behavior tiers, fairness policy, cooldown tuning, rare-event containment, and product-specific cadence rules.
```

### IS006 - Relationships

* IS006 - sub-issue-of - #172: Existing epic relationship.

## IS007 - Update - #183 resident observability and operational controls

Update #183 with telemetry and operations evidence. Keep open for broader moderation, audit review UX, kill-switch operations, and production monitoring validation.

IS007 - Similarity: #183=Similar

* IS007 - issue_number: #183
* IS007 - title: feat(agents): add resident observability and operational controls
* IS007 - state: open
* IS007 - labels: area:backend, area:devops
* IS007 - milestone: Mosaic Agents MVP
* IS007 - assignees: none

### IS007 - body

```markdown
## Branch alignment note

Current branch adds redacted worker telemetry, server worker-read telemetry, client/server Application Insights deployment wiring, worker feature gates, restricted-role deployment verification, and operational runbook coverage.

Keep this issue open for production monitoring validation, moderation/audit review workflows, explicit kill-switch procedures, and operational dashboards/alerts.
```

### IS007 - Relationships

* IS007 - sub-issue-of - #172: Existing epic relationship.

## IS008 - Update - #184 validation across users and replicas

Update #184 with current server route authorization tests, principal integration tests, control-plane contention tests, and multi-replica reconnect validation. Keep open because end-to-end resident behavior across users and replicas is not yet implemented.

IS008 - Similarity: #184=Similar

* IS008 - issue_number: #184
* IS008 - title: test(agents): validate resident behavior across users and replicas
* IS008 - state: open
* IS008 - labels: area:realtime, area:qa
* IS008 - milestone: Mosaic Agents MVP
* IS008 - assignees: none

### IS008 - body

```markdown
## Branch alignment note

Current branch adds test coverage for worker-read authorization, app-only token handling, active agent principal resolution, lease contention, checkpoint recovery, and multi-replica reconnect behavior.

Keep this issue open for end-to-end resident behavior validation across multiple human users and server replicas once product-visible behavior exists.
```

### IS008 - Relationships

* IS008 - sub-issue-of - #172: Existing epic relationship.

## IS009 - Update - #189 resident behavior and model-output evaluation

Update #189 as partial. The branch has gateway fallback, budget, timeout, malformed-response, and read-only output-shape tests, but no model-output quality/safety evaluation suite yet.

IS009 - Similarity: #189=Similar

* IS009 - issue_number: #189
* IS009 - title: test(agents): evaluate resident behavior and model outputs
* IS009 - state: open
* IS009 - labels: area:security, area:qa
* IS009 - milestone: Mosaic Agents MVP
* IS009 - assignees: none

### IS009 - body

```markdown
## Branch alignment note

Current branch adds gateway and workflow tests for fallback behavior, request bounds, malformed provider responses, lease-loss handling, and observation-only structured output.

Keep this issue open for replayable model-output quality, safety, privacy, cost, latency, and frequency evaluation suites.
```

### IS009 - Relationships

* IS009 - sub-issue-of - #172: Existing epic relationship.

## IS010 - Update - #190 production governance

Update #190 with deployment governance evidence: managed-identity documentation, app-role token separation, restricted control-plane DSN verification, worker Container App deployment, telemetry variables, feature gates, and remaining activation prerequisites.

IS010 - Similarity: #190=Similar

* IS010 - issue_number: #190
* IS010 - title: ops(agents): govern model-assisted resident behavior in production
* IS010 - state: open
* IS010 - labels: area:devops, area:security
* IS010 - milestone: Mosaic Agents MVP
* IS010 - assignees: none

### IS010 - body

```markdown
## Branch alignment note

Current branch adds production governance foundations: worker Container App deployment, app-only agent auth settings, managed-identity activation runbook, restricted control-plane DSN verification, telemetry configuration, model-free defaults, Foundry feature gates, and bootstrap variable/secret validation.

Keep this issue open until deployment-specific Entra/RBAC configuration, Foundry activation gates, telemetry evidence, incident response, and operational budget controls are verified in the target environment.
```

### IS010 - Relationships

* IS010 - sub-issue-of - #172: Existing epic relationship.

## IS011 - Update - #191 worker runtime testing plan

Update #191 with completed branch evidence and unresolved blockers. The branch adds broad worker tests and docs but CI does not yet run worker pytest lanes, and PostgreSQL restart evidence remains gated by test environment setup.

IS011 - Similarity: #191=Match

* IS011 - issue_number: #191
* IS011 - title: [Work Item] Implement agent worker runtime testing plan
* IS011 - state: open
* IS011 - labels: type:task, area:qa
* IS011 - milestone: Mosaic Agents MVP
* IS011 - assignees: none

### IS011 - body

```markdown
## Branch alignment note

Current branch adds worker tests for workflow, supervisor, gateway, tools, checkpoints, identity, telemetry, control-plane access verification, and PostgreSQL-gated control-plane behavior. It also documents worker test prerequisites and validates syntax/build paths where local pytest execution is unavailable.

Remaining blockers:

* Add CI worker fast-suite pytest execution.
* Add CI PostgreSQL worker integration execution with migrations, restricted role preparation, and restart/checkpoint evidence.
* Produce non-skipped PostgreSQL restart evidence with AGENT_WORKER_POSTGRES_TEST_DSN.
* Add dedicated real Agent Framework runtime-contract tests if required by the issue's original scope; the current test inventory does not include a test_framework_runtime.py module.
```

### IS011 - Relationships

* IS011 - sub-issue-of - #172: Existing epic relationship.

## IS012 - No Change - Closed architecture and policy issues

The branch implements decisions captured by #173, #185, #186, #187, and #188. No reopening or update is required unless maintainers want post-implementation evidence comments.

IS012 - Similarity: #173=Match, #185=Match, #186=Match, #187=Match, #188=Match

* IS012 - issue_number: #173, #185, #186, #187, #188
* IS012 - title: Closed architecture and policy decisions under #172
* IS012 - state: closed
* IS012 - labels: mixed
* IS012 - milestone: Mosaic Agents MVP
* IS012 - assignees: none

### IS012 - body

```markdown
No change recommended. Current branch implements these already-closed decisions.
```

### IS012 - Relationships

* IS012 - sub-issue-of - #172: Existing epic relationship.

## IS013 - No Change - Product-facing resident behavior items

No change for #176, #177, and #182 from this branch. The branch builds the read-only runtime foundation but does not implement quiet witness UI behavior, social interpretation around resident marks, or gated historical/mythic resident events.

IS013 - Similarity: #176=Distinct, #177=Distinct, #182=Distinct

* IS013 - issue_number: #176, #177, #182
* IS013 - title: Product-facing resident behavior items
* IS013 - state: open
* IS013 - labels: mixed
* IS013 - milestone: Mosaic Agents MVP
* IS013 - assignees: none

### IS013 - body

```markdown
No change recommended from this branch. Keep open for future product-facing resident behavior implementation.
```

### IS013 - Relationships

* IS013 - sub-issue-of - #172: Existing epic relationship.
<!-- markdown-table-prettify-ignore-end -->