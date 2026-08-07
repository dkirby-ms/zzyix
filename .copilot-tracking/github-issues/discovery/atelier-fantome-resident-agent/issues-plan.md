<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Issues Plan

* **Repository**: `dkirby-ms/zzyix`
* **Milestone**: none assigned
* **Execution status**: Executed. Seventeen new issues were created under #172 with the `Mosaic Agents MVP` milestone. #174 was closed as an accidental duplicate of #175.

## IS001 - Update - Establish resident agent epic and delivery contract

Parent tracking issue for the staged resident-agent capability. It defines behavior tiers, non-negotiable boundaries, dependency gates, and evidence required for rollout.

IS001 - Similarity: #130=Match (existing Atelier Phantom epic covers the same parent capability).

* IS001 - issue_number: `#130`
* IS001 - title: `feat(agents): establish Atelier Fantome resident agent delivery contract`
* IS001 - state: open
* IS001 - labels: `needs-design, needs-architecture`
* IS001 - milestone: `Mosaic Agents MVP`
* IS001 - assignees: none

### IS001 - body

```markdown
## Summary

Establish the staged delivery contract for the Atelier Fantome resident agent, including behavior tiers, trust and privacy boundaries, decision gates, dependencies, and validation evidence.

## Acceptance Criteria

* Baseline, frequent secondary, and rare spike behaviors are explicitly separated.
* Privacy, artist autonomy, non-overwrite behavior, non-coercion, and disengagement are release-blocking constraints.
* Child work is ordered from low-fidelity validation through production rollout.
* Prototype and production scope are clearly distinguished.
```

### IS001 - Relationships

* IS001 - parent-of - #173 and #175 through #190 under #172: Staged resident-agent work created and linked.

## IS002 - Create - Resolve architecture and authority boundaries

Decide the server/client authority, state ownership, persistence, replica consistency, event ordering, and mutation conflict strategy before implementation.

* IS002 - issue_number: `#173`
* IS002 - title: `feat(agents): define resident behavior architecture and authority boundaries`
* IS002 - state: not created
* IS002 - labels: `feature, agents`
* IS002 - milestone: none
* IS002 - assignees: none

### IS002 - body

```markdown
## Summary

Define the resident behavior architecture and authority boundaries across server, client, persistence, sockets, and multi-replica operation.

## Decision Gate

Do not implement autonomous behavior until authority, persistence, replica consistency, event ordering, idempotency, and mutation conflict rules are approved.
```

## IS003 - Create - Define resident domain model and event contracts

Define the domain objects and transport events for marks, motifs, visits, attention state, social references, memory classification, and behavior-tier metadata.

* IS003 - issue_number: `#175`
* IS003 - title: `feat(agents): add resident domain model and event contracts`
* IS003 - state: not created
* IS003 - labels: `feature, agents`
* IS003 - milestone: none
* IS003 - assignees: none

### IS003 - body

```markdown
## Summary

Add the resident domain model and validated event contracts while separating creative memory from sensitive memory.

## Decision Gate

Approve data classification, retention, deletion, and transport boundaries before persistence or client integration.
```

## IS004 - Create - Prototype quiet witness presence

Build and evaluate the low-fidelity baseline presence around artist patches, with resettable non-destructive signals.

* IS004 - issue_number: `#176`
* IS004 - title: `feat(agents): prototype quiet witness resident presence`
* IS004 - state: not created
* IS004 - labels: `feature, agents`
* IS004 - milestone: none
* IS004 - assignees: none

### IS004 - body

```markdown
## Summary

Prototype subtle glyphs, nearby traces, quiet patch visits, recurring motifs, and discoverable marks.

## Acceptance Criteria

* Signals are non-destructive and explicitly attributable to the resident.
* Testing records intrigue, discomfort, invisibility, confusion, and perceived authorship.
* Behavior can be disabled or reset without affecting artist work.
```

## IS005 - Create - Prototype social meaning layer

Prototype comments, nearby response tags, and community interpretation around resident marks without forcing a canonical meaning.

* IS005 - issue_number: `#177`
* IS005 - title: `feat(agents): prototype social interpretation around resident marks`
* IS005 - state: not created
* IS005 - labels: `feature, agents`
* IS005 - milestone: none
* IS005 - assignees: none

### IS005 - body

```markdown
## Summary

Prototype social meaning-making around resident marks through comments and nearby response tags.

## Decision Gate

Do not enable production social behavior until testing shows useful interpretation without unacceptable confusion, harassment, or forced consensus.
```

## IS006 - Create - Implement attention and disengagement controls

Implement artist-controlled distance signals, attention reduction, quiet periods, and move-on behavior across reconnects and replicas.

* IS006 - issue_number: `#178`
* IS006 - title: `feat(agents): enforce resident distance and disengagement controls`
* IS006 - state: not created
* IS006 - labels: `feature, agents`
* IS006 - milestone: none
* IS006 - assignees: none

### IS006 - body

```markdown
## Summary

Ensure the resident reliably reduces attention and moves on when artists or patches request distance.

## Release Gate

Autonomous resident behavior remains disabled until disengagement is deterministic, observable, tested through reconnect and replica scenarios, and shown not to pursue disinterested artists.
```

## IS007 - Create - Enforce canvas safety and authorship boundaries

Add server-side invariants and tests that prevent overwrite, deletion, impersonation, and authorship confusion.

* IS007 - issue_number: `#179`
* IS007 - title: `feat(agents): protect artist work from resident mutations`
* IS007 - state: not created
* IS007 - labels: `feature, agents`
* IS007 - milestone: none
* IS007 - assignees: none

### IS007 - body

```markdown
## Summary

Protect artist work from resident mutations and make resident authorship explicit and auditable.

## Release Gate

Block write-capable resident behavior until property-based and integration tests prove artist work cannot be overwritten and resident marks are always attributable.
```

## IS008 - Create - Implement creative memory with privacy controls

Persist creative memory while excluding sensitive context by default and defining explicit invitation, access, retention, deletion, and audit behavior.

* IS008 - issue_number: `#180`
* IS008 - title: `feat(agents): add privacy-bounded resident creative memory`
* IS008 - state: not created
* IS008 - labels: `feature, agents, security`
* IS008 - milestone: none
* IS008 - assignees: none

### IS008 - body

```markdown
## Summary

Add privacy-bounded creative memory for marks, motifs, unfinished work references, and visible interactions.

## Release Gate

Privacy review must approve classification, collection boundaries, retention, deletion, access control, and threat-model coverage before implementation is enabled.
```

## IS009 - Create - Add resident scheduling and behavior-tier orchestration

Implement cadence, cooldowns, rate limits, fairness, deterministic replay, feature flags, and independent behavior-tier controls.

* IS009 - issue_number: `#181`
* IS009 - title: `feat(agents): orchestrate resident behavior tiers and cadence`
* IS009 - state: not created
* IS009 - labels: `feature, agents`
* IS009 - milestone: none
* IS009 - assignees: none

### IS009 - body

```markdown
## Summary

Orchestrate quiet baseline behavior, frequent secondary behavior, and rare event-level spikes.

## Release Gate

Rare behavior cannot roll out until frequency budgets, non-threatening outcomes, replica consistency, telemetry, and an emergency kill switch are validated.
```

## IS010 - Create - Defer and gate historical echoes and mythic temperament

Add sparse historical and symbolic events only after trust, clarity, control, and content review gates pass.

* IS010 - issue_number: `#182`
* IS010 - title: `feat(agents): add gated historical and mythic resident events`
* IS010 - state: not created
* IS010 - labels: `feature, agents`
* IS010 - milestone: none
* IS010 - assignees: none

IS010 - Similarity: #155=Similar (historical mosaic automation overlaps, but #155 targets faithful famous-mosaic recreation rather than sparse interpretive resident events).

### IS010 - body

```markdown
## Summary

Add sparse historical mosaic echoes and occasional symbolic mood expression as gated rare events.

## Release Gate

Require acceptable evidence from quiet presence, disengagement, canvas safety, and behavior-tier orchestration, plus content review of historical and symbolic treatment.
```

## IS011 - Create - Add observability, moderation, and kill-switch controls

Instrument behavior and provide operator controls for telemetry, moderation, audit, feature flags, and emergency disablement.

* IS011 - issue_number: `#183`
* IS011 - title: `feat(agents): add resident observability and operational controls`
* IS011 - state: not created
* IS011 - labels: `feature, agents, infrastructure`
* IS011 - milestone: none
* IS011 - assignees: none

### IS011 - body

```markdown
## Summary

Add queryable telemetry, moderation and audit trails, independent feature flags, emergency disablement, and safe recovery.

## Acceptance Criteria

* Operators can explain why an action occurred.
* Behavior tiers can be disabled independently.
* Sensitive-memory access and policy violations are auditable without exposing private content.
* Metrics cover visibility, discomfort, confusion, disengagement, conflicts, and event frequency.
```

## IS012 - Create - Validate resident behavior end to end

Create unit, property, integration, end-to-end, and real-world validation for behavior, privacy, social interpretation, authorship, replicas, reconnects, and operations.

* IS012 - issue_number: `#184`
* IS012 - title: `test(agents): validate resident behavior across users and replicas`
* IS012 - state: not created
* IS012 - labels: `feature, agents`
* IS012 - milestone: none
* IS012 - assignees: none

### IS012 - body

```markdown
## Summary

Validate the resident against behavioral, privacy, social, authorship, replica, reconnect, and operational requirements.

## Release Gate

Release requires representative real-world environment evidence. Failed boundary, privacy, or authorship criteria block rollout.
```

## Relationships

* IS001 - parent-of - IS002 through IS012: Resident-agent delivery program.
* IS002 - blocks - IS003: Architecture controls domain contracts.
* IS003 - blocks - IS004, IS006, IS007, IS008, IS009: Domain and event contracts precede implementation.
* IS004 - informs - IS005 and IS012: Quiet-presence evidence informs social and overall validation.
* IS006, IS007, IS008, IS009, IS011, IS012 - gates - IS010 and production rollout.

## IS013 - Create - Decide deterministic versus LLM resident behavior

Compare deterministic rules, state machines, retrieval-assisted generation, and LLM-driven behavior. Keep safety-critical and visible mutation behavior deterministic unless an LLM is justified by evidence.

* IS013 - issue_number: `#185`
* IS013 - title: `arch(agents): decide deterministic versus LLM resident behavior`
* IS013 - state: not created
* IS013 - labels: `feature, agents, needs-architecture`
* IS013 - milestone: `Mosaic Agents MVP`
* IS013 - assignees: none

### IS013 - body

```markdown
## Summary

Decide whether an LLM is necessary for any resident capability. Evaluate artistic value, latency, cost, reproducibility, explainability, privacy, and failure behavior against a deterministic baseline.

## Decision Gate

Do not add a model dependency or allow model-generated canvas mutations until the evaluation is approved.
```

## IS014 - Create - Evaluate resident agent framework and tool boundaries

Evaluate whether an agent framework is justified and define a least-privilege allowlisted tool contract if one is selected.

* IS014 - issue_number: `#186`
* IS014 - title: `arch(agents): evaluate resident agent framework and tool boundaries`
* IS014 - state: not created
* IS014 - labels: `feature, agents, needs-architecture`
* IS014 - milestone: `Mosaic Agents MVP`
* IS014 - assignees: none

### IS014 - body

```markdown
## Summary

Evaluate agent framework options versus a domain-specific orchestrator. Define allowlisted tools for approved reads, mark proposals, and bounded actions without arbitrary database, socket, moderation, or deployment access.

## Decision Gate

Do not add a framework dependency until capability fit, operational burden, versioning, testability, recovery, and least privilege are documented.
```

## IS015 - Create - Define model policy, prompt, and memory boundaries

Define prompt construction, untrusted-content handling, structured output validation, sensitive-memory exclusion, prompt-injection defenses, content policy, and explicit invitation rules.

* IS015 - issue_number: `#187`
* IS015 - title: `security(agents): define resident model policy and prompt boundaries`
* IS015 - state: not created
* IS015 - labels: `security, agents, needs-architecture`
* IS015 - milestone: `Mosaic Agents MVP`
* IS015 - assignees: none

### IS015 - body

```markdown
## Summary

Define the policy and prompt boundary for any model-assisted resident behavior.

## Decision Gate

No model may receive user-authored content or memory until data-flow, prompt-injection, sensitive-data, and output-policy review passes.
```

## IS016 - Create - Add governed model gateway

If model use is approved, isolate providers behind a server-side gateway with resilience, quotas, redaction, regional controls, feature flags, and deterministic fallback.

* IS016 - issue_number: `#188`
* IS016 - title: `arch(agents): isolate model providers behind a governed gateway`
* IS016 - state: not created
* IS016 - labels: `feature, agents, infrastructure, needs-architecture`
* IS016 - milestone: none
* IS016 - assignees: none

### IS016 - body

```markdown
## Summary

Add a server-side model gateway only if the deterministic-versus-LLM decision approves model assistance.

## Decision Gate

Provider calls cannot originate from client code or unbounded resident loops. Production enablement requires cost, availability, privacy, and fallback evidence.
```

## IS017 - Create - Build resident behavior and model evaluation harness

Build replayable evaluations for behavior quality, hard safety invariants, privacy, tool misuse, prompt injection, latency, cost, and rare-event frequency.

* IS017 - issue_number: `#189`
* IS017 - title: `test(agents): evaluate resident behavior and model outputs`
* IS017 - state: not created
* IS017 - labels: `feature, agents`
* IS017 - milestone: none
* IS017 - assignees: none

### IS017 - body

```markdown
## Summary

Create replayable scenarios and regression datasets for deterministic and model-assisted resident behavior.

## Decision Gate

Model-assisted behavior must meet the same non-overwrite, authorship, disengagement, privacy, and policy invariants as deterministic behavior.
```

## IS018 - Create - Operate and govern model-assisted resident behavior

Extend operational controls for model calls, tools, policy denials, prompt injection, spend, latency, provider failures, fallback, and independent kill switches.

* IS018 - issue_number: `#190`
* IS018 - title: `ops(agents): govern model-assisted resident behavior in production`
* IS018 - state: not created
* IS018 - labels: `agents, infrastructure, security`
* IS018 - milestone: none
* IS018 - assignees: none

### IS018 - body

```markdown
## Summary

Add production governance for model-assisted behavior, including auditable model and tool activity, budgets, retention, incident response, and no-model degraded mode.

## Decision Gate

Production operation requires tested kill switches for model calls, tools, social behavior, and canvas writes.
```

## Existing Issue Relationships Requiring Review

* #130 is the direct parent match for IS001 and remains separate from the new #172 implementation epic.
* #155 is related to IS010 and is assigned to the separate `Famous Mosaics replicas` milestone. Resolve whether IS010 becomes a child, coordination item, or remains separate before execution.
* #173 and #175 through #190 are linked sub-issues of #172 and assigned to `Mosaic Agents MVP`.
* #174 was closed as a duplicate of #175 after an interrupted creation attempt.
* IS013 blocks IS014, IS016, IS017, and IS018: model and framework choices must be justified before implementation or operations.
* IS014 blocks any agent-framework integration: tool permissions and recovery must be defined first.
* IS015 blocks IS016 and any model-mediated memory or user-content flow.
* IS016 blocks model-assisted production behavior; IS017 is required before rollout.
* IS017 and IS018 gate production model use.
<!-- markdown-table-prettify-ignore-end -->
