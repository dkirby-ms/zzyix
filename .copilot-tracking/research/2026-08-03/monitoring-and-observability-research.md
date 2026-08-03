<!-- markdownlint-disable-file -->
# Task Research: Monitoring and Observability

Research for GitHub issue #135 ([Work Item] Monitoring and observability): "Need a more comprehensive and holistic monitoring approach."

## Task Implementation Requests

* Define a focused observability approach for server and client metrics and interaction flows.
* Identify concrete implementation changes across client, server, and telemetry plumbing.
* Evaluate implementation alternatives and select one recommended approach with rationale.
* Produce a consolidated research artifact for implementation planning handoff.

## Scope and Success Criteria

* Scope: Server/client observability for zzyix, including logs, metrics, traces, and interaction-level correlation across client, server, scripts, and test automation.
* Out of Scope: Alerting, paging, and on-call notification workflows for this work item.
* Assumptions:
  * Azure deployment artifacts in infra/bicep represent the intended production deployment path.
  * Existing custom telemetry events and rollout gates are foundational and should be preserved during migration.
  * Monitoring must support realtime, multi-user collaboration reliability for quilt pathways.
* Success Criteria:
  * Current-state observability posture is inventoried with file/line evidence.
  * Gaps are mapped to production observability capabilities.
  * At least 3 alternatives are evaluated with trade-offs.
  * One selected approach is recommended with phased implementation details and measurable outcomes.

## Outline

1. Baseline repository observability inventory
2. Gap analysis against production-grade monitoring model
3. Alternatives analysis and selection
4. Implementation-ready architecture and rollout
5. Risks, mitigations, and follow-up research

## Potential Next Research

* Validate production log field schemas in live Azure Log Analytics tables before final interaction-centric dashboards and trace queries.
  * Reasoning: Correlation and troubleshooting quality depends on exact fields and cardinality.
  * Reference: .github/workflows/cd.yml
* Model telemetry ingestion cost from real workloads (14-day sample) before setting retention and sampling defaults.
  * Reasoning: Cost can become a primary operational risk post instrumentation.
  * Reference: Azure Monitor log pricing documentation
* Confirm OpenTelemetry Collector deployment shape (sidecar vs central) for each environment tier.
  * Reasoning: Topology drives reliability, cost, and operational burden.
  * Reference: OpenTelemetry Collector documentation

## Research Executed

### File Analysis

* apps/server/src/index.ts
  * Structured logging and telemetry sink wiring (`configureQuiltTelemetry`, request/socket logging, `/health`).
* apps/server/src/migration/quiltTelemetry.ts
  * Typed telemetry event model and observer hook used as event bus.
* apps/server/src/logging/redact.ts
  * Recursive sensitive-field redaction implementation.
* apps/server/src/db/repository.ts and apps/server/src/db/client.ts
  * Metric-like event emissions for latency, lock wait, pool wait, parity, and outcomes.
* apps/client/src/App.tsx and apps/client/src/render/MosaicScene.tsx
  * Canary-gated periodic runtime metrics emission and render metrics collection.
* apps/client/src/network/useSocketConnection.ts
  * Connection lifecycle logging currently using `console.*` in client runtime pathways.
* infra/bicep/main.bicep, infra/bicep/modules/monitoring.bicep, infra/bicep/modules/containerAppsEnvironment.bicep
  * Existing Log Analytics workspace and ACA environment log wiring.
* .github/workflows/cd.yml and scripts/bootstrap-cd-environment.sh
  * Deployment variables and migration-failure Log Analytics query behavior.
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md
  * Operating budget and unresolved threshold definitions relevant to SLO maturation.

### Code Search Results

* Search terms used: telemetry, observability, OpenTelemetry, Application Insights, health, metrics, traces, dashboard, alert.
* Results confirm:
  * No in-repo distributed tracing SDK instrumentation in app runtime code.
  * No codified alert/dashboards/workbooks resources in infra/bicep.
  * No dedicated observability SDK dependencies in package manifests (`@opentelemetry/*`, `applicationinsights`, `prom-client`, `pino`, `winston`, `sentry`, `datadog`, `newrelic` were not found).

### External Research

* Microsoft docs search/fetch (via subagent)
  * Foundational guidance to codify monitoring resources in Bicep and include alerts/diagnostics.
    * Source: Create monitoring resources by using Bicep
    * URL: https://learn.microsoft.com/azure/azure-resource-manager/bicep/scenarios-monitoring
  * Workspace-based Application Insights recommendations and deployment architecture notes.
    * Source: Architecture best practices for Application Insights
    * URL: https://learn.microsoft.com/azure/well-architected/service-guides/application-insights
  * OpenTelemetry enablement patterns and production environment variable guidance.
    * Source: Enable Azure Monitor OpenTelemetry for applications
    * URL: https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
  * Container Apps log and diagnostic settings requirements.
    * Source: Log storage and monitoring options in Azure Container Apps
    * URL: https://learn.microsoft.com/azure/container-apps/log-options

### Project Conventions

* Standards referenced: repository architecture and deployment patterns observed in apps/, infra/bicep, and .github/workflows.
* Instructions followed: Task Researcher mode, prompt requirements from task-research prompt, and evidence-first consolidation process.

## Key Discoveries

### Project Structure

* Server and client already emit meaningful custom telemetry events with shared domains around runtime, state mutation, and realtime collaboration.
* Infrastructure currently provisions only the baseline monitoring substrate (Log Analytics) and wires ACA environment logs, but not complete observability control plane resources.
* Release governance already enforces telemetry readiness via rollout gate variables in server startup and CD.

### Implementation Patterns

* Telemetry-first event modeling exists in code and is suitable for adapter-based export to OTel/OpenTelemetry Collector without disruptive rewrites.
* Logging maturity is mixed: structured server logging is present, but client and some server utility paths still rely on direct `console.*`.
* Health endpoint currently appears liveness-oriented and minimal, not dependency-readiness oriented.
* E2E includes trace artifacts (`trace: retain-on-failure`) and performance-budget checks, creating a strong test validation baseline for observability rollout.

### Complete Examples

```text
Server telemetry and logging anchors
- apps/server/src/index.ts:381 (log level resolution)
- apps/server/src/index.ts:448 (telemetry observer wired to logging sink)
- apps/server/src/index.ts:924 (GET /health)
- apps/server/src/index.ts:2015 (quilt_client_runtime_metrics ingestion)
- apps/server/src/index.ts:2243 (snapshot_bytes emission)
- apps/server/src/index.ts:2279 (room_churn emission)

Telemetry model
- apps/server/src/migration/quiltTelemetry.ts:31 (canonical event union)
- apps/server/src/migration/quiltTelemetry.ts:47 (configure observer)

Client runtime metrics
- apps/client/src/App.tsx:806 (10s canary-gated runtime metrics emission)
- apps/client/src/render/MosaicScene.tsx:478 (frame/draw/object metrics capture)
```

### API and Schema Documentation

* Microsoft Learn references used for selected approach:
  * https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
  * https://learn.microsoft.com/azure/well-architected/service-guides/application-insights
  * https://learn.microsoft.com/azure/container-apps/log-options
  * https://learn.microsoft.com/azure/azure-resource-manager/bicep/scenarios-monitoring
* OpenTelemetry references:
  * https://opentelemetry.io/docs/what-is-opentelemetry/
  * https://opentelemetry.io/docs/collector/

### Configuration Examples

```text
Existing infra baseline
- infra/bicep/modules/monitoring.bicep:8 (Log Analytics workspace resource)
- infra/bicep/modules/containerAppsEnvironment.bicep:24 (ACA app logs destination log-analytics)

Existing operational query path
- .github/workflows/cd.yml:475 (Log Analytics query on migration failure)
```

## Technical Scenarios

### Scenario A: Azure-native (Azure Monitor + Application Insights + OTel SDK path)

Use Azure Monitor as primary backend with workspace-based Application Insights and platform diagnostics, instrumenting app code with OTel-compatible telemetry where supported.

**Requirements:**

* Add Application Insights resource and runtime connection string wiring.
* Add diagnostics and dashboard/workbook resources in Bicep.
* Implement traces and correlated logs/metrics in app runtime.

**Preferred Approach (for this scenario):**

* Fastest path to production observability completeness with low platform-management overhead.

```text
Planned infra additions
infra/bicep/modules/monitoring.bicep        (extend)
infra/bicep/modules/diagnostics.bicep       (new)
infra/bicep/modules/visualization.bicep     (new)
infra/bicep/main.bicep                      (wire modules/outputs)
```

**Implementation Details:**

* Low-to-medium migration complexity.
* Higher lock-in and Azure-specific operational runbook bias.
* Strong immediate fit for current deployment posture.

#### Considered Alternatives

* Rejected as primary recommendation due to stronger long-term backend lock-in compared with hybrid while delivering similar near-term value.

### Scenario B: Self-hosted OSS stack (Prometheus + Grafana + Loki + Tempo/Jaeger)

Operate an independent observability platform and instrument apps for open backends.

**Requirements:**

* Stand up and operate a multi-component telemetry platform (HA, storage, upgrades, security hardening, backups, lifecycle).
* Build deployment, on-call, and incident operations for the observability platform itself.

**Preferred Approach (for this scenario):**

* Appropriate only if strict backend sovereignty or non-cloud dependency constraints dominate.

**Implementation Details:**

* Highest operational burden and staffing requirements.
* Mismatch with current repo’s cloud-native, app-first orientation.

#### Considered Alternatives

* Rejected due to operational overhead being disproportionate for current team/repo maturity and delivery priorities.

### Scenario C: Hybrid vendor-neutral OTel with Azure sink now (Selected)

Instrument application domains using OpenTelemetry-aligned contracts and introduce an OpenTelemetry Collector pipeline that exports to Azure Monitor/Application Insights now, while preserving future optionality for additional backends.

**Requirements:**

* Keep current telemetry contracts as migration control stream.
* Add collector pipeline and export adapters in phases.
* Codify monitor resources in Bicep and enforce dashboard/SLO evidence gates.

**Preferred Approach:**

* Best balance of time-to-value, operational burden, portability, and fit with existing repo patterns.

```text
Rollout areas
apps/server/src/index.ts
apps/server/src/migration/quiltTelemetry.ts
apps/server/src/db/repository.ts
apps/server/src/db/client.ts
apps/client/src/App.tsx
apps/client/src/network/useSocketConnection.ts
infra/bicep/modules/monitoring.bicep
infra/bicep/modules/diagnostics.bicep (new)
infra/bicep/main.bicep
.github/workflows/cd.yml
scripts/bootstrap-cd-environment.sh
docs/decisions/ (new SLO policy artifact)
```

**Implementation Details:**

* Medium complexity with strong evolutionary migration path.
* Preserves Azure operational acceleration while limiting lock-in risk.
* Compatible with current redaction model, rollout gates, and typed telemetry events.

#### Considered Alternatives

* Scenario A not selected because long-term coupling is higher while near-term value is similar.
* Scenario B not selected because operational complexity and ownership burden are too high for present needs.

## Selected Approach

Select Scenario C: Hybrid vendor-neutral OpenTelemetry instrumentation with Azure sink first.

Rationale:

* Strongest weighted fit to repository state: existing Azure baseline, typed telemetry model, and rollout gate culture.
* Improves portability and strategic flexibility over pure Azure-native lock-in.
* Delivers production-ready observability capabilities without adopting full self-hosted platform operations.

## Implementation Impact

### Architecture impact

* Add observability control plane resources to infra/bicep (App Insights, diagnostics, dashboards/workbooks).
* Add app instrumentation adapters for traces and metrics export through OTel pipeline while preserving existing event contracts during transition.

### Operational impact

* Add ingestion-cost and retention guardrails.
* Add interaction-centric reliability KPIs to release reviews and gate approvals.

### Delivery impact

* Enables phased rollout by domain (health/readiness, logs normalization, tracing, SLOs).
* Reuses existing E2E performance and trace artifacts for observability acceptance criteria.

## Risks and Mitigations

* Risk: Collector or export misconfiguration introduces signal drop.
  * Mitigation: Start with minimal validated pipelines and telemetry contract tests.
* Risk: Telemetry cost spikes from verbose logs/high cardinality.
  * Mitigation: Apply sampling/filtering policies and retention tiers before broad rollout.
* Risk: Governance ambiguity for SLO ownership.
  * Mitigation: Assign explicit owner matrix across server/client/infra and gate by documented evidence artifact.

## Actionable Next Steps

1. Implement infrastructure baseline in Bicep.
   * Extend infra/bicep/modules/monitoring.bicep with Application Insights.
  * Add infra/bicep/modules/diagnostics.bicep.
   * Wire modules in infra/bicep/main.bicep.
2. Wire deployment configuration.
   * Add APPLICATIONINSIGHTS_CONNECTION_STRING and selected OTEL_* settings to scripts/bootstrap-cd-environment.sh and .github/workflows/cd.yml.
3. Implement server instrumentation phase.
   * Normalize logging via structured logger; enrich health/readiness endpoints; add trace correlation IDs.
4. Implement client instrumentation phase.
   * Replace runtime console lifecycle logs with structured telemetry and correlation metadata.
5. Establish dashboards and SLO policy artifact.
  * Add source-of-truth artifact in docs/decisions or docs/operations for telemetry gate evidence.
  * Keep alerting/paging deferred for a separate follow-up work item.
6. Validate with 90-day success signals.
   * Coverage: trace/log correlation in >=90% of critical server paths.
  * Dashboard utility: key interaction regressions are diagnosable within 15 minutes using metrics + traces.
   * Reliability: telemetry pipeline drop rate <1% for critical sampled events.
   * Cost: monthly ingestion variance within approved budget threshold.

## Evidence Log

### Internal repository evidence

* Server telemetry/logging anchors:
  * apps/server/src/index.ts:381
  * apps/server/src/index.ts:448
  * apps/server/src/index.ts:924
  * apps/server/src/index.ts:2015
  * apps/server/src/index.ts:2243
  * apps/server/src/index.ts:2279
* Telemetry model:
  * apps/server/src/migration/quiltTelemetry.ts:31
  * apps/server/src/migration/quiltTelemetry.ts:47
* Redaction:
  * apps/server/src/logging/redact.ts:3
  * apps/server/src/logging/redact.ts:15
* Client runtime metrics and socket lifecycle:
  * apps/client/src/App.tsx:806
  * apps/client/src/render/MosaicScene.tsx:478
  * apps/client/src/network/useSocketConnection.ts:146
* Infrastructure baseline:
  * infra/bicep/main.bicep:39
  * infra/bicep/main.bicep:56
  * infra/bicep/modules/monitoring.bicep:8
  * infra/bicep/modules/containerAppsEnvironment.bicep:24
* Deployment/operations:
  * .github/workflows/cd.yml:475
  * scripts/bootstrap-cd-environment.sh:25
* Governance/decision context:
  * apps/server/README.md:54
  * apps/server/src/startup/rolloutGates.ts:13
  * docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:268

### External sources

* Create monitoring resources by using Bicep
  * https://learn.microsoft.com/azure/azure-resource-manager/bicep/scenarios-monitoring
* Architecture best practices for Application Insights
  * https://learn.microsoft.com/azure/well-architected/service-guides/application-insights
* Enable Azure Monitor OpenTelemetry for applications
  * https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
* Log storage and monitoring options in Azure Container Apps
  * https://learn.microsoft.com/azure/container-apps/log-options
* OpenTelemetry overview and collector docs
  * https://opentelemetry.io/docs/what-is-opentelemetry/
  * https://opentelemetry.io/docs/collector/
