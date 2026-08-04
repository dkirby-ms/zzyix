---
applyTo: '.copilot-tracking/changes/2026-08-03/monitoring-observability-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Monitoring and Observability

## Overview

Instrument the zzyix server and client using OpenTelemetry-aligned contracts with an Azure Monitor/Application Insights sink, extend the Bicep infra control plane with observability resources, normalize deployment configuration, and establish an SLO policy artifact — implementing GitHub issue #135.

## Objectives

### User Requirements

* Implement a comprehensive and holistic monitoring approach for zzyix — Source: GitHub issue #135, conversation context

### Derived Objectives

* Add Application Insights resource and diagnostics module to infra/bicep so that production telemetry has a queryable backend — Derived from: research finding that infra currently provisions Log Analytics only, with no Application Insights or diagnostic settings (infra/bicep/modules/monitoring.bicep:8)
* Wire APPLICATIONINSIGHTS_CONNECTION_STRING into CD pipeline (cd.yml server containerapp update steps) and document it in bootstrap-cd-environment.sh so runtime instrumentation can reach Azure Monitor — Derived from: research actionable step 2; deployment env var gap confirmed in scripts/bootstrap-cd-environment.sh and .github/workflows/cd.yml
* Add `@azure/monitor-opentelemetry` server-side SDK instrumentation via `--import` loader module so auto-instrumentation initializes before ESM static imports; enrich health endpoint and append trace correlation fields to existing log format — Derived from: research selected approach (Scenario C); server currently has no OTel SDK dependency (apps/server/package.json)
* Replace `console.*` client lifecycle logs with structured telemetry routed through the existing quilt event bus — Derived from: research finding that apps/client/src/network/useSocketConnection.ts:146 uses raw console.log/error for connection lifecycle
* Produce an SLO policy artifact in docs/decisions documenting telemetry gates, trace/log coverage targets, and cost guardrails — Derived from: research actionable next step 5; governance artifact currently absent

## Context Summary

### Project Files

* infra/bicep/modules/monitoring.bicep - Log Analytics workspace only; no Application Insights resource (lines 8-26)
* infra/bicep/modules/containerAppsEnvironment.bicep - ACA environment wired to Log Analytics via sharedKey (lines 20-39)
* infra/bicep/main.bicep - monitoring module wired at lines 39-45; outputs customerId/sharedKey but not Application Insights connection string
* apps/server/src/index.ts - writeLog function (line ~381), configureQuiltTelemetry observer (line ~448), /health endpoint (line 924), quilt_client_runtime_metrics ingestion (line 2015)
* apps/server/src/migration/quiltTelemetry.ts - typed event union (lines 1-55); configureQuiltTelemetry/emitQuiltTelemetry exports (lines 47-55)
* apps/server/src/logging/redact.ts - recursive sensitive-field redaction (lines 1-17)
* apps/client/src/network/useSocketConnection.ts - console.log/error for socket lifecycle (lines 146-158)
* apps/client/src/App.tsx - 10s canary-gated runtime metrics emission (line 806)
* apps/server/package.json - no OTel dependencies present
* apps/client/package.json - no OTel dependencies present
* scripts/bootstrap-cd-environment.sh - CD environment variable bootstrap; no APPLICATIONINSIGHTS_CONNECTION_STRING (lines 25-50)
* .github/workflows/cd.yml - Log Analytics query on migration failure (line 475)
* apps/server/src/startup/rolloutGates.ts - rollout gate validation (line 13)

### References

* .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md - Full observability research with scenario analysis, gap inventory, and actionable steps
* https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable - OTel enablement for Node.js (useAzureMonitor pattern)
* https://learn.microsoft.com/azure/well-architected/service-guides/application-insights - Workspace-based Application Insights best practices
* https://learn.microsoft.com/azure/azure-resource-manager/bicep/scenarios-monitoring - Bicep monitoring resource codification
* https://learn.microsoft.com/azure/container-apps/log-options - ACA log options and diagnostic settings

### Standards References

* infra/bicep/modules/monitoring.bicep - Existing naming/param conventions to follow (namePrefix, location)

## Implementation Checklist

### [x] Implementation Phase 1: Infrastructure Baseline (Bicep)

<!-- parallelizable: true -->

* [x] Step 1.1: Add Application Insights workspace-based resource to monitoring.bicep
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 18-55)
* [x] Step 1.2: Create infra/bicep/modules/diagnostics.bicep with ACA diagnostic settings
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 56-95)
* [x] Step 1.3: Wire Application Insights and diagnostics modules in main.bicep; output connection string
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 96-130)
* [x] Step 1.4: Validate Bicep changes
  * Run `az bicep build --file infra/bicep/main.bicep` to validate compilation
  * Skip if conflicting with other parallel Bicep phases

### [x] Implementation Phase 2: Deployment Configuration

<!-- parallelizable: true -->

* [x] Step 2.1: Add APPLICATIONINSIGHTS_CONNECTION_STRING and OTEL env vars to bootstrap-cd-environment.sh
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 131-165)
* [x] Step 2.2: Add APPLICATIONINSIGHTS_CONNECTION_STRING and OTEL env vars to server containerapp update steps in .github/workflows/cd.yml
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 166-195)

### [x] Implementation Phase 3: Server Instrumentation

<!-- parallelizable: true -->

* [x] Step 3.1: Add @azure/monitor-opentelemetry dependency to apps/server/package.json
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 196-215)
* [x] Step 3.2: Create apps/server/src/telemetry.ts --import loader module for OTel initialization
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 216-255)
* [x] Step 3.2a: Register --import ./src/telemetry.js flag in server start commands (package.json and Dockerfile)
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 256-280)
* [x] Step 3.3: Enrich /health endpoint with dependency readiness checks (DB ping)
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 246-290)
* [x] Step 3.4: Append OTel trace correlation fields to existing writeLog text output (format-preserving)
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 295-335)
* [x] Step 3.5: Validate server build and tests
  * Run `cd apps/server && npm run build && npm test` — scoped to server only

### [x] Implementation Phase 4: Client Instrumentation

<!-- parallelizable: true -->

* [x] Step 4.1: Add @opentelemetry/api dependency to apps/client/package.json
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 326-345)
* [x] Step 4.2: Replace console.log/error socket lifecycle calls in useSocketConnection.ts with structured telemetry
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 346-395)
* [x] Step 4.3: Validate client build and tests
  * Run `cd apps/client && npm run build && npm test` — scoped to client only

### [x] Implementation Phase 5: SLO Policy Artifact

<!-- parallelizable: true -->

* [x] Step 5.1: Create docs/decisions/2026-08-03-observability-slo-policy.md
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Lines 396-430)

### [x] Implementation Phase 6: Validation

<!-- parallelizable: false -->

* [x] Step 6.1: Run full project lint and build
  * `cd apps/server && npm run lint && npm run build`
  * `cd apps/client && npm run lint && npm run build`
  * `az bicep build --file infra/bicep/main.bicep`
* [x] Step 6.2: Run full test suites
  * `cd apps/server && npm test`
  * `cd apps/client && npm test`
* [x] Step 6.3: Fix minor validation issues (lint, build warnings, type errors)
* [x] Step 6.4: Report blocking issues requiring additional planning

### [x] Implementation Phase 7: Review Rework

<!-- parallelizable: true -->

* [x] Step 7.1: Route client socket lifecycle telemetry through canonical telemetry and remove the dead client OTel API stub
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Review Rework section)
* [x] Step 7.2: Harden server preload and socket auth failure handling; fix adjacent observability correctness issues
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Review Rework section)
* [x] Step 7.3: Remove the Log Analytics shared key from Bicep outputs and resolve it inside the ACA environment module
  * Details: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md (Review Rework section)
* [x] Step 7.4: Re-run focused validation for the rework slice
  * `npm run test --workspace=apps/client -- useSocketConnection`
  * `npm run lint --workspace=apps/client`
  * `npm run test --workspace=apps/server`
  * `npm run lint --workspace=apps/server`
  * `az bicep build --file infra/bicep/main.bicep`

## Planning Log

See .copilot-tracking/plans/logs/2026-08-03/monitoring-observability-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Azure CLI (`az`) with Bicep support for infra validation
* Node.js / npm for server and client package installs
* `@azure/monitor-opentelemetry` npm package (server)

## Success Criteria

* Application Insights resource exists in infra/bicep and produces a connection string output — Traces to: research actionable step 1; infra gap identified in monitoring.bicep
* APPLICATIONINSIGHTS_CONNECTION_STRING variable is documented in bootstrap-cd-environment.sh — Traces to: research actionable step 2; deployment config gap
* Server startup registers OTel SDK; useAzureMonitor() is called before request handlers — Traces to: research selected approach Scenario C; server instrumentation phase
* /health endpoint returns dependency readiness (DB status), not just liveness — Traces to: research finding "health endpoint currently appears liveness-oriented and minimal"
* writeLog entries include trace/request correlation ID — Traces to: research finding "no distributed tracing SDK instrumentation in app runtime code"
* Socket lifecycle console.log/error calls in useSocketConnection.ts are replaced with structured telemetry — Traces to: research finding at apps/client/src/network/useSocketConnection.ts:146
* SLO policy artifact exists at docs/decisions/2026-08-03-observability-slo-policy.md — Traces to: research actionable step 5; governance artifact gap
* All server and client builds pass; no new lint errors introduced
* Review rework findings are resolved: socket lifecycle telemetry reaches the canonical telemetry bus, server preload survives Azure Monitor initialization failures, socket auth failures reach connect_error, and Bicep no longer exposes the Log Analytics shared key in deployment outputs
