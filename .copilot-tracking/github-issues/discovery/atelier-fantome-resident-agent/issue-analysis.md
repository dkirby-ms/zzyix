<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Discovery Issue Analysis - Atelier Fantome Resident Agent

* **Artifact(s)**: `.copilot-tracking/dt/atelier-fantome/agent-design.md`
* **Repository**: `dkirby-ms/zzyix`
* **Status**: Draft only. No GitHub issues have been created or modified.
* **Duplicate search**: Completed with read-only `gh` CLI searches. One direct parent match and one related historical-mosaic epic were found.

## Planning Assumptions

* The resident agent is a server-authoritative behavior system integrated with the shared mosaic world.
* Method 6 low-fidelity validation is the first implementation gate.
* Privacy, artist autonomy, non-overwrite behavior, and disengagement are release-blocking constraints.
* Historical echoes and mythic temperament are deferred until baseline trust and clarity are demonstrated.

## Planned Issues

### IS001 - Update - Establish resident agent epic and delivery contract

* **Working Title**: `feat(agents): establish Atelier Fantome resident agent delivery contract`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `Mosaic Agents MVP` (existing issue milestone)
* **Working Description**: Parent capability for the persistent resident agent, its staged delivery, behavioral constraints, dependency gates, and validation evidence. It should define the boundary between prototype behavior and production behavior and link all child work below.
* **Source**: Design Intent, Decision Summary, Method 6 Prototype Priorities

#### IS001 - Found Issue Field Values

* **Issue**: [#130 - The Atelier Phantom](https://github.com/dkirby-ms/zzyix/issues/130)
* **State**: open
* **Labels**: `needs-design, needs-architecture`
* **Milestone**: `Mosaic Agents MVP`
* **Similarity**: Match. The existing issue is the resident-agent epic; the design adds the behavioral contract, privacy boundaries, staged children, and release gates.

#### IS001 - Acceptance Criteria

* The delivery contract names baseline, frequent secondary, and rare spike behavior tiers.
* It identifies privacy, authorship, non-overwrite, non-coercion, and disengagement as non-negotiable constraints.
* It defines the dependency order and evidence required to pass each gate.
* It links the child work items in `issues-plan.md`.

### IS002 - Create - Resolve architecture and authority boundaries

* **Working Title**: `feat(agents): define resident behavior architecture and authority boundaries`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Decide where resident state, scheduling, behavior selection, persistence, and canvas mutation live. Define server authority, client rendering, event ordering, concurrency behavior, idempotency, and how the resident coexists with existing quilt and replica flows.
* **Source**: Behavioral Architecture, Memory Model, Boundary Rules

#### IS002 - Decision Gate

* Block implementation until the authority model, persistence model, replica consistency strategy, and mutation conflict rules are approved.

### IS003 - Create - Define resident domain model and event contracts

* **Working Title**: `feat(agents): add resident domain model and event contracts`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Model resident marks, motifs, visits, attention state, distance signals, social references, historical echoes, and behavior-tier metadata. Define validated server-to-client events and audit fields without storing sensitive personal context in creative memory.
* **Source**: Memory Model, Presence Rules, Social Interaction Model

#### IS003 - Decision Gate

* Block implementation until the team approves the creative-memory versus sensitive-memory schema and retention/deletion behavior.

### IS004 - Create - Prototype quiet witness presence

* **Working Title**: `feat(agents): prototype quiet witness resident presence`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Build a low-fidelity prototype for subtle glyphs, nearby traces, quiet patch visits, recurring motifs, and discoverable marks. Measure whether artists notice and interpret presence without treating it as a utility bot or experiencing it as intrusion.
* **Source**: Prototype Set A, Success Signals, Open Risks

#### IS004 - Acceptance Criteria

* Prototype signals are non-destructive and attributable to the resident.
* Test participants can discover and describe the resident presence.
* Results record intrigue, discomfort, invisibility, confusion, and perceived authorship.
* Prototype behavior can be disabled or reset without affecting artist work.

### IS005 - Create - Prototype social meaning layer

* **Working Title**: `feat(agents): prototype social interpretation around resident marks`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Prototype comments, nearby response tags, and community discussion around resident marks. Preserve multiple interpretations and prevent the system from presenting one canonical meaning.
* **Source**: Prototype Set B, Social Interaction Model

#### IS005 - Decision Gate

* Block production social features until testing shows that interpretation adds value without unacceptable confusion, harassment, or forced consensus.

### IS006 - Create - Implement attention and disengagement controls

* **Working Title**: `feat(agents): enforce resident distance and disengagement controls`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Implement artist-controlled distance signals, attention reduction, move-on behavior, quiet periods, and reliable suppression of resident activity for users or patches requesting space. Ensure controls are honored across reconnects and replicas.
* **Source**: Boundary Rules, Guardrail Test, Success Signals

#### IS006 - Decision Gate

* This is a release blocker. Do not enable autonomous resident behavior until disengagement is deterministic, observable, tested under reconnect and replica conditions, and shown not to pursue disinterested artists.

### IS007 - Create - Enforce canvas safety and authorship boundaries

* **Working Title**: `feat(agents): protect artist work from resident mutations`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Add server-side invariants preventing overwrite, deletion, impersonation, or authorship confusion. Resident marks must be distinguishable, auditable, and conflict-safe when placed near artist patches or concurrent edits.
* **Source**: Boundary Rules, Social Interaction Model

#### IS007 - Decision Gate

* Block all write-capable resident behavior until property-based and integration tests demonstrate that artist work cannot be overwritten and resident authorship is always explicit.

### IS008 - Create - Implement creative memory with privacy controls

* **Working Title**: `feat(agents): add privacy-bounded resident creative memory`
* **Working Labels**: `feature, agents, security`
* **Suggested Milestone**: `none`
* **Working Description**: Persist marks, motifs, unfinished work references, and visible interactions as creative memory while excluding sensitive personal context and emotional disclosures by default. Define consent, access, retention, deletion, redaction, and audit behavior for any explicitly invited sensitive interaction.
* **Source**: Memory Model, Boundary Rules

#### IS008 - Decision Gate

* Block implementation until privacy review approves data classification, collection boundaries, retention, deletion, access control, and threat-model coverage.

### IS009 - Create - Add resident scheduling and behavior-tier orchestration

* **Working Title**: `feat(agents): orchestrate resident behavior tiers and cadence`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Implement quiet baseline scheduling, frequent secondary behaviors, and rare event-level spikes with rate limits, cooldowns, fairness rules, deterministic replay support, and feature flags. Ensure rare behaviors cannot become the default through retries, load, or replica disagreement.
* **Source**: Behavioral Architecture, Rare Spike Behaviors, Decision Summary

#### IS009 - Decision Gate

* Block rare behavior rollout until telemetry proves frequency budgets, non-threatening outcomes, replica consistency, and a kill switch under failure conditions.

### IS010 - Create - Defer and gate historical echoes and mythic temperament

* **Working Title**: `feat(agents): add gated historical and mythic resident events`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Add sparse historical mosaic echoes and occasional symbolic mood expression only after baseline trust, clarity, and control are validated. Define attribution as interpretive rather than authoritative, avoid exact reproductions, preserve artist work, and keep event frequency bounded.
* **Source**: Historical Expression Model, Rare Spike Behaviors, Open Risks

#### IS010 - Related Existing Issue

* **Issue**: [#155 - Recreate famous historical mosaics in the app autonomously](https://github.com/dkirby-ms/zzyix/issues/155)
* **State**: open
* **Labels**: none
* **Milestone**: `Famous Mosaics replicas`
* **Similarity**: Similar, not Match. #155 targets faithful recreation of famous mosaics, while IS010 targets sparse interpretive resident events. Coordination or a sub-issue relationship may be appropriate, but the scopes and milestones differ.

#### IS010 - Human Review Trigger

* Decide whether historical echoes belong under #130, #155, or a separate gated work item. Do not create IS010 until this cross-milestone overlap is resolved.

#### IS010 - Decision Gate

* Do not implement or enable until IS004, IS006, IS007, and IS009 produce acceptable evidence and content review approves the historical and symbolic treatment.

### IS011 - Create - Add observability, moderation, and kill-switch controls

* **Working Title**: `feat(agents): add resident observability and operational controls`
* **Working Labels**: `feature, agents, infrastructure`
* **Suggested Milestone**: `none`
* **Working Description**: Instrument behavior selection, marks, visits, distance signals, suppression decisions, memory access, social activity, and rare events. Add dashboards or queryable metrics, moderation/audit trails, feature flags, emergency disablement, and safe recovery for malformed or harmful resident output.
* **Source**: Success Signals, Open Risks, Decision Gates

#### IS011 - Acceptance Criteria

* Operators can identify why a resident action occurred.
* Operators can disable baseline, social, and rare behavior tiers independently.
* Sensitive-memory access and policy violations are auditable without exposing private content.
* Metrics support intrigue versus discomfort, visibility, confusion, disengagement success, mutation conflicts, and event frequency.

### IS012 - Create - Validate resident behavior end to end

* **Working Title**: `test(agents): validate resident behavior across users and replicas`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Create unit, property, integration, end-to-end, and exploratory user-validation coverage for behavior cadence, privacy, social interpretation, authorship, non-overwrite guarantees, reconnects, multi-replica operation, and operational disablement.
* **Source**: Success Signals, Guardrail Test, Open Risks

#### IS012 - Decision Gate

* Release requires evidence from real-world or representative environment testing, not only controlled unit tests. Failed boundary, privacy, or authorship criteria block rollout.

## Proposed Dependency Order

`#130 -> IS002 -> IS003 -> IS004`

`IS003 -> IS006 -> IS007 -> IS008 -> IS009 -> IS010`

`IS004 -> IS005 -> IS012`

`IS006, IS007, IS008, IS009, IS011, IS012 -> production rollout decision`

## LLM and Agent Framework Architecture Candidates

### IS013 - Create - Decide whether resident behavior requires an LLM

* **Working Title**: `arch(agents): decide deterministic versus LLM resident behavior`
* **Working Labels**: `feature, agents, needs-architecture`
* **Suggested Milestone**: `Mosaic Agents MVP`
* **Working Description**: Compare deterministic rules, authored state machines, retrieval-assisted generation, and LLM-driven behavior against the resident's actual needs. Keep quiet presence, distance controls, authorship protection, scheduling, and safety-critical mutations deterministic unless evidence shows an LLM is necessary.
* **Decision Gate**: No model dependency or model-generated canvas mutation is approved until latency, cost, reproducibility, explainability, privacy, failure handling, and artistic value are evaluated.

### IS014 - Create - Evaluate agent framework and tool integration strategy

* **Working Title**: `arch(agents): evaluate resident agent framework and tool boundaries`
* **Working Labels**: `feature, agents, needs-architecture`
* **Suggested Milestone**: `Mosaic Agents MVP`
* **Working Description**: Evaluate whether an agent framework is needed at all, and if so, which responsibilities it should own. Define a narrow allowlisted tool interface for reading approved creative context, proposing marks, and requesting bounded actions without arbitrary database, socket, moderation, or deployment access.
* **Decision Gate**: Do not add a framework dependency until capability fit, operational burden, versioning, testability, failure recovery, and a least-privilege tool contract are documented.

### IS015 - Create - Define model policy, prompt, and memory boundaries

* **Working Title**: `security(agents): define resident model policy and prompt boundaries`
* **Working Labels**: `security, agents, needs-architecture`
* **Suggested Milestone**: `Mosaic Agents MVP`
* **Working Description**: Define system instructions, prompt construction, untrusted-content handling, output schema validation, sensitive-memory exclusion, prompt-injection defenses, content policy enforcement, and explicit invitation rules for any model-mediated interaction.
* **Decision Gate**: No LLM can receive user-authored content or memory until data-flow, prompt-injection, sensitive-data, and output-policy review passes.

### IS016 - Create - Add model gateway and provider controls

* **Working Title**: `arch(agents): isolate model providers behind a governed gateway`
* **Working Labels**: `feature, agents, infrastructure, needs-architecture`
* **Suggested Milestone**: `none`
* **Working Description**: If IS013 approves model use, isolate providers behind a server-side gateway with timeouts, retries, circuit breakers, quotas, spend limits, redaction, structured logging, regional/data-residency controls, feature flags, and a deterministic fallback path.
* **Decision Gate**: No provider SDK may be called from client code or unbounded resident loops. Production enablement requires cost, availability, privacy, and fallback evidence.

### IS017 - Create - Build resident behavior and model evaluation harness

* **Working Title**: `test(agents): evaluate resident behavior and model outputs`
* **Working Labels**: `feature, agents`
* **Suggested Milestone**: `none`
* **Working Description**: Build replayable scenarios and evaluation datasets for intrigue versus discomfort, disengagement, non-overwrite behavior, authorship clarity, social confusion, privacy leakage, prompt injection, tool misuse, latency, cost, and rare-event frequency. Compare deterministic and model-assisted variants.
* **Decision Gate**: Model-assisted behavior cannot graduate from prototype until it meets the same hard safety invariants as deterministic behavior and has reproducible regression coverage.

### IS018 - Create - Operate and govern model-assisted resident behavior

* **Working Title**: `ops(agents): govern model-assisted resident behavior in production`
* **Working Labels**: `agents, infrastructure, security`
* **Suggested Milestone**: `none`
* **Working Description**: Extend observability and operational controls for model calls, tool invocations, policy denials, prompt-injection signals, token usage, spend, latency, provider failures, fallback rates, and human review. Provide independent kill switches for model calls, tools, social behavior, and canvas writes.
* **Decision Gate**: Production operation requires auditable model/tool activity, budget alerts, incident response, data-retention controls, and a tested no-model degraded mode.

## Open Decisions Requiring Review

* Whether the resident is deterministic, model-driven, or hybrid, and where any generative component is allowed.
* Whether an LLM adds value beyond authored rules for the resident's visible behavior.
* Whether an agent framework is justified, or whether a small domain-specific orchestrator is safer and easier to test.
* Which tools, if any, the resident may invoke and whether every tool action requires a server-side proposal/approval step.
* Which model provider, deployment boundary, data region, retention policy, and cost ceiling apply if model use is approved.
* Whether resident marks are stored as first-class quilt data or a separate event stream.
* Whether distance controls are per artist, per patch, per session, or globally scoped.
* What explicit invitation means for sensitive-memory interaction and who can revoke it.
* Which moderation policy governs social interpretations and resident-generated content.
* What evidence threshold is sufficient to move from prototype to persistent production behavior.

## Duplicate Search Results

* `#130`: Match for IS001. Update the existing Atelier Phantom epic rather than create a second parent.
* `#155`: Similar to IS010. Coordinate historical mosaic behavior before assigning or creating work.
* No additional matches were found for resident agent, canvas agent, disengagement, attention, creative memory, sensitive memory, or resident marks searches.

## Architecture Finding

The repository currently has no LLM or agent-framework dependency in the client or server package manifests. The recommended architecture is deterministic-first: keep authority, scheduling, safety invariants, distance controls, and canvas mutations in the server domain layer; evaluate model assistance separately; and permit model or framework integration only through a governed server-side gateway and allowlisted tools.
<!-- markdown-table-prettify-ignore-end -->
