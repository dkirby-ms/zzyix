---
title: Observability Alternatives Matrix
description: Decision matrix and recommendation for observability approach alternatives in zzyix.
author: Researcher Subagent
ms.date: 2026-08-03
ms.topic: conceptual
keywords:
   - observability
   - opentelemetry
   - azure monitor
   - prometheus
   - grafana
estimated_reading_time: 12
---

## Status

Complete

## Scope

Evaluate and recommend one observability direction for zzyix across three options:

1. Azure-native: Azure Monitor and Application Insights with OpenTelemetry SDKs
2. Self-hosted OSS: Prometheus + Grafana + Loki + Tempo or Jaeger
3. Hybrid: Vendor-neutral OpenTelemetry instrumentation and collector pipeline, Azure sink first, optional multi-backend later

## Executive Summary

Option C is the recommended path. It matches the current Azure deployment shape and release controls while preserving future backend portability. It gives near-term speed similar to Option A, while avoiding a hard backend commitment that would increase migration friction if compliance, cost, or analytics requirements change.

Option A is a close second and can be implemented quickly, but it creates stronger coupling to Azure-specific telemetry semantics and workflows. Option B offers maximum control and portability, but introduces meaningful operational overhead that is disproportionate for the current team and repository maturity.

## Repository Evidence Snapshot

The current system already has strong telemetry primitives and rollout governance:

* Typed server and client telemetry events are emitted in real time, including canonical and runtime metrics paths.
* Telemetry redaction is centralized.
* Release gating enforces telemetry readiness flags before deployment.
* Infrastructure already provisions Log Analytics and wires Container Apps environment logs.

This creates a favorable base for OpenTelemetry-first adoption with staged backend strategy rather than a full greenfield observability rebuild.

## Decision Matrix

Scoring scale: 1 (weak) to 5 (strong). Weighted score is based on current repository and team context.

| Criterion | Weight | A Azure-native | B Self-hosted OSS | C Hybrid OTel + Azure now |
| --- | --- | --- | --- | --- |
| Time to value | 20% | 5 | 2 | 4 |
| Operational burden | 20% | 4 | 1 | 3 |
| Cost predictability at current scale | 15% | 3 | 3 | 4 |
| Flexibility and lock-in posture | 20% | 2 | 5 | 5 |
| Security and compliance alignment | 15% | 4 | 3 | 4 |
| Fit to repo architecture and release process | 10% | 4 | 2 | 5 |
| Weighted total | 100% | 3.65 | 2.55 | 4.10 |

## Option Analysis

## Option A Azure-native

### Architecture summary

Instrument server with Azure Monitor OpenTelemetry distro or exporter, send telemetry to Application Insights and Log Analytics, and rely on Azure-native dashboards, alerts, and KQL workflows.

### Operational burden

Low to moderate. Managed backend reduces infrastructure operations, but alert and cost governance still require ongoing ownership.

### Cost profile

Consumption based. Azure Monitor Logs pricing is primarily driven by ingestion and retention volume. This is straightforward to start but can grow quickly under verbose logging or high-cardinality event streams.

### Latency and scale fitness

Strong for current scale. Azure-hosted ingestion and query UX is mature for API and service telemetry. Browser telemetry requires care because Azure guidance does not recommend OpenTelemetry browser SDK as the primary path.

### Security and compliance considerations

Strong integration with Azure RBAC and policy controls. Data residency and retention controls are supported, but teams must explicitly tune retention and export policies.

### Team skill requirements

KQL, Azure Monitor alerting, Application Insights query and workbook practices, plus language SDK setup patterns.

### Fit to this repo

Good fit for existing Bicep and Container Apps wiring. Fastest path to standardized backend visibility from current custom telemetry signals.

## Option B Self-hosted OSS

### Architecture summary

Prometheus for metrics scraping and alerting, Loki for logs, Tempo or Jaeger for traces, Grafana for dashboards, and optional OpenTelemetry Collector for pipeline unification.

### Operational burden

High. Requires deployment, scaling, storage tuning, upgrades, HA strategy, backup, and security hardening for multiple stateful services.

### Cost profile

Potentially cost-efficient at steady state for large volumes, but with higher operator cost and higher risk of underestimating storage and reliability overhead.

### Latency and scale fitness

Excellent when well operated. Prometheus pull model and Grafana ecosystem are proven, but reliability depends on team operations maturity.

### Security and compliance considerations

Maximum control, but maximum responsibility. Identity integration, network isolation, secrets handling, and retention enforcement become first-party platform tasks.

### Team skill requirements

Prometheus internals, alertmanager, Grafana operations, Loki and Tempo or Jaeger data lifecycle operations, plus incident playbooks and platform SRE practices.

### Fit to this repo

Weak to moderate for now. The repository is application-heavy with Azure deployment automation, not platform-observability automation. This option would shift roadmap effort toward operating the telemetry platform itself.

## Option C Hybrid vendor-neutral OTel with Azure sink now

### Architecture summary

Adopt OpenTelemetry SDKs and semantic conventions in app code, introduce OpenTelemetry Collector as the control plane, export to Azure Monitor now, and keep pipeline support for additional backends later.

### Operational burden

Moderate. More moving parts than Option A, far less than full OSS stack. Collector adds operational surface but centralizes policy controls and backend routing.

### Cost profile

Balanced. Near-term Azure consumption still applies, but collector processors and routing controls improve leverage for sampling, filtering, and eventual backend diversification.

### Latency and scale fitness

Strong. Collector offloads retries, batching, and routing from app processes and supports staged scaling of telemetry pipelines.

### Security and compliance considerations

Strong if collector policies enforce redaction, transport security, and destination controls. Aligns with existing repo redaction-first posture.

### Team skill requirements

OpenTelemetry instrumentation, collector pipeline operations, and Azure Monitor baseline operations. This is a focused upskill path that does not require full LGTM platform operations immediately.

### Fit to this repo

Best fit. Preserves current Azure deployment and release guardrails while creating a durable path to multi-backend strategy if requirements evolve.

## Migration Complexity and Risk Assessment

## Option A

### Complexity

Low to medium

### Risks

* Browser instrumentation mismatch risk if teams assume full OpenTelemetry browser parity.
* Lock-in drift risk as dashboards, alerts, and runbooks become Azure-specific.
* Cost growth risk without strong ingestion and retention controls.

### Mitigations

* Use Application Insights JavaScript SDK for browser telemetry path where Azure guidance recommends it.
* Keep telemetry schemas close to OpenTelemetry semantic conventions.
* Define ingestion budgets and retention tiers before production rollout.

## Option B

### Complexity

High

### Risks

* Platform reliability risk due to self-managed stateful services.
* Operational staffing risk and on-call complexity.
* Security misconfiguration risk across multiple telemetry components.

### Mitigations

* Start with managed variants or hosted distributions if OSS path is mandatory.
* Establish dedicated SRE ownership and on-call before production cutover.
* Automate hardening baselines and upgrade policy.

## Option C

### Complexity

Medium

### Risks

* Collector misconfiguration risk during early rollout.
* Dual-path telemetry overlap risk during migration from existing custom events.
* Governance drift risk if schema ownership is unclear.

### Mitigations

* Start with minimal collector pipeline and explicit contract tests.
* Keep existing telemetry as a temporary control stream, then retire via phased gates.
* Assign telemetry schema ownership to server and client maintainers with review gates.

## Recommendation

Select Option C: Hybrid vendor-neutral OpenTelemetry with Azure sink now.

### Rationale

* It aligns with current Azure infrastructure and CD controls without forcing a platform rebuild.
* It keeps strategic optionality for future backend diversification.
* It reduces lock-in risk versus Option A while avoiding the heavy operating cost of Option B.
* It complements existing redaction, rollout-gate, and telemetry-contract patterns in this codebase.

### Why alternatives are not selected now

* Option A is not selected because backend coupling risk is higher and browser OpenTelemetry support caveats complicate a pure OTel claim.
* Option B is not selected because operational burden is too high for the current repo and team shape relative to incremental value.

## 90-Day Acceptance Criteria and Success Signals

## Acceptance criteria

1. OpenTelemetry instrumentation and schema contracts are implemented for server API request lifecycle, socket lifecycle, and key mutation operations.
2. Client telemetry path is documented and implemented with supported browser approach, mapped to shared correlation IDs.
3. OpenTelemetry Collector is deployed in non-production and production with validated retry, batching, and secure transport settings.
4. Azure dashboards and alerts exist for request latency, error ratio, socket churn, mutation outcomes, and deployment gate health.
5. Ingestion and retention budgets are defined and enforced for logs and traces.
6. Playwright E2E jobs emit trace-correlated test metadata that can be queried for regression triage.

## Measurable success signals

1. Coverage: At least 90 percent of server request paths include trace IDs and outcome status in telemetry.
2. MTTD: Median detection time for P1 observability-covered incidents drops by at least 30 percent versus the prior 30-day baseline.
3. Alert quality: At least 80 percent of production alerts are actionable and fewer than 20 percent are false positives by monthly review.
4. Cost guardrail: Monthly log ingestion remains within a predefined budget band with less than 10 percent variance unless approved.
5. Reliability: Telemetry pipeline drop rate stays below 1 percent for sampled critical events.
6. E2E diagnosability: At least 85 percent of failed Playwright runs can be mapped to trace or log evidence within 15 minutes.

## References

### Repository references

* infra/bicep/main.bicep:39
* infra/bicep/main.bicep:56
* infra/bicep/main.bicep:57
* infra/bicep/modules/containerAppsEnvironment.bicep:20
* infra/bicep/modules/containerAppsEnvironment.bicep:24
* infra/bicep/modules/monitoring.bicep:15
* apps/server/README.md:54
* apps/server/README.md:87
* apps/server/README.md:157
* apps/server/README.md:161
* apps/server/src/startup/rolloutGates.ts:13
* apps/server/src/startup/rolloutGates.ts:16
* apps/server/src/logging/redact.ts:3
* apps/server/src/logging/redact.ts:15
* apps/server/src/index.ts:924
* apps/server/src/index.ts:1712
* apps/server/src/index.ts:2015
* apps/client/src/App.tsx:806
* apps/client/src/network/useSocketConnection.ts:87
* package.json:19
* package.json:37
* package.json:42
* .github/workflows/cd.yml:264
* .github/workflows/cd.yml:572
* docker-compose.yaml:13
* docker-compose.yaml:30

### External references

* https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
* https://learn.microsoft.com/azure/azure-monitor/app/application-insights-faq
* https://learn.microsoft.com/azure/container-apps/log-options
* https://learn.microsoft.com/azure/container-apps/log-monitoring
* https://learn.microsoft.com/azure/azure-monitor/logs/cost-logs
* https://learn.microsoft.com/azure/azure-monitor/fundamentals/cost-usage
* https://opentelemetry.io/docs/what-is-opentelemetry/
* https://opentelemetry.io/docs/collector/
* https://prometheus.io/docs/introduction/overview/
* https://grafana.com/oss/loki/
* https://grafana.com/oss/tempo/
* https://www.jaegertracing.io/docs/latest/
