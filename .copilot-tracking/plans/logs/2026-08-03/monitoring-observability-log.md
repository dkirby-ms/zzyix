<!-- markdownlint-disable-file -->
# Planning Log: Monitoring and Observability

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-01: OpenTelemetry Collector sidecar vs central deployment topology
  * Source: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Potential Next Research section)
  * Reason: Selected approach (Scenario C) starts with direct SDK export to Azure Monitor via `@azure/monitor-opentelemetry` without a separate Collector process. The Collector topology decision is deferred until ingestion volume and multi-backend requirements justify the operational cost.
  * Impact: low — the SDK export path is valid for current scale; Collector can be added later as WI-03

* DR-02: Ingestion cost modeling from real workloads (14-day sample)
  * Source: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Potential Next Research section)
  * Reason: Cost modeling requires production traffic data not yet available. The SLO policy artifact (Phase 5) documents a budget threshold placeholder; actual sampling rates and retention tiers are deferred until post-deployment data is collected.
  * Impact: medium — sampling ratio defaults to 1.0 initially; revisit after 30 days of production data

* DR-03: Production log field schema validation in live Log Analytics tables
  * Source: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Potential Next Research section)
  * Reason: Correlation query quality depends on exact field names in ContainerAppConsoleLogs_CL. This validation requires a deployed Application Insights resource. Deferred to post-deployment operational validation.
  * Impact: medium — does not block instrumentation but affects dashboard/query accuracy on first use

* DR-04: Dashboard and workbook Bicep resources
  * Source: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Scenario C Rollout Areas)
  * Reason: Workbook/dashboard Bicep resources are not included in Phase 1 because the field schemas (DR-03) need validation before queries can be authored. Deferred to WI-04.
  * Impact: low — telemetry pipeline is functional without pre-built dashboards

* DR-05: Alert/paging resources
  * Source: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Scope and Success Criteria — Out of Scope)
  * Reason: Explicitly out of scope for this work item per research definition. Deferred to WI-02.
  * Impact: none for this plan

### Plan Deviations from Research

* DD-01: Client OTel export deferred
  * Research recommends: Add client telemetry with correlation metadata routed to Azure Monitor
  * Plan implements: Replace console.* with structured telemetry objects; defer browser-to-Azure-Monitor export pipeline to follow-on work (WI-01)
  * Rationale: Browser-side Application Insights SDK adds meaningful bundle weight and requires CORS configuration for the Application Insights endpoint. The structured telemetry helper pattern in Phase 4 improves log quality and provides the foundation without coupling to the cloud export in this iteration.

* DD-02: Sampling ratio hardcoded to 1.0 initially
  * Research recommends: Apply sampling/filtering policies and retention tiers before broad rollout
  * Plan implements: `OTEL_SAMPLING_RATIO` environment variable with default 1.0 (full sampling); operator can override at deploy time
  * Rationale: Full sampling during initial rollout maximizes trace coverage for observability baseline measurement. Adjust to <1.0 after cost data is collected per DR-02.

* DD-06: Client lifecycle telemetry uses structured helper logging rather than direct canonical event-bus emission
  * Research recommends: Route lifecycle telemetry through existing telemetry model when feasible
  * Plan implements: Structured `console.info`/`console.error` helper events with timestamp, quilt ID, socket ID/reason, and optional OTel trace context in `useSocketConnection.ts`
  * Rationale: Existing typed canonical telemetry union only supports entry and reconnect terminal events. Structured helper preserves existing behavior while removing raw console lifecycle logs and keeping queryable payloads for dev diagnostics.

* DD-07: Review rework removed the client OpenTelemetry API stub and canonicalized lifecycle telemetry
  * Plan originally implemented: A client `@opentelemetry/api` dependency plus a console-only lifecycle helper in `useSocketConnection.ts`
  * Implementation now differs: Lifecycle outcomes rely on canonical telemetry events already emitted through `canonical_telemetry`, and the unused client OTel API dependency was removed
  * Rationale: Independent review confirmed the helper never entered the telemetry pipeline and the client OTel API had no runtime effect without a browser tracer provider

---

## Implementation Paths Considered

### Selected: Scenario C — Hybrid vendor-neutral OTel with Azure Monitor sink

* Approach: Instrument using OpenTelemetry-aligned contracts (`@azure/monitor-opentelemetry` SDK), export to Azure Monitor/Application Insights, extend Bicep with observability control plane resources. Preserve existing typed telemetry event contracts during transition.
* Rationale: Best balance of time-to-value, operational burden, portability, and fit with existing repo patterns. Avoids full Azure lock-in while delivering production-grade observability.
* Evidence: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Selected Approach section)

### IP-01: Scenario A — Azure-native (Azure Monitor + Application Insights, no OTel portability layer)

* Approach: Instrument directly with Azure Application Insights SDK (`applicationinsights` npm package) without OTel API abstraction.
* Trade-offs: Faster initial wiring with fewer abstraction layers; however, higher long-term vendor lock-in because application code would depend on Azure-specific SDK calls rather than OTel-standard spans and metrics.
* Rejection rationale: Near-term value is similar to Scenario C, but portability is worse. `@azure/monitor-opentelemetry` provides OTel compatibility at minimal additional effort, making Scenario C strictly better on the portability dimension.

### IP-02: Scenario B — Self-hosted OSS (Prometheus + Grafana + Loki + Tempo/Jaeger)

* Approach: Deploy a full self-hosted observability stack alongside the application.
* Trade-offs: Maximum backend portability and sovereignty; however, requires operating a multi-component platform (HA, storage, lifecycle, security) as a separate concern.
* Rejection rationale: Operational overhead disproportionate for current team/repo maturity. Current deployment targets Azure Container Apps; standing up a separate OSS platform contradicts the cloud-native, app-first orientation of the codebase.

---

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Client-side Azure Monitor export pipeline — Add browser-side Application Insights SDK (or @opentelemetry/sdk-trace-web with Azure exporter) to route client telemetry to Azure Monitor for end-to-end trace correlation (medium priority)
  * Source: DD-01 deferral; .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (client instrumentation phase)
  * Dependency: Phase 4 of this plan (structured client telemetry helper must exist first)

* WI-02: Alerting and on-call policy — Define alert rules, notification channels, and on-call runbook for SLO breach conditions (medium priority)
  * Source: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Out of Scope — explicitly deferred)
  * Dependency: SLO policy artifact (Phase 5 of this plan) and 30+ days of baseline metrics

* WI-03: OpenTelemetry Collector deployment — Evaluate and implement Collector sidecar or centralized Collector for multi-backend export and sampling policy enforcement (low priority)
  * Source: DR-01; .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md (Potential Next Research)
  * Dependency: Production traffic volume data; WI-01 for full client-to-server trace chain

* WI-04: Observability dashboards and workbooks in Bicep — Codify Azure Monitor Workbooks for interaction-centric reliability KPIs and quilt pathway diagnostics (medium priority)
  * Source: DR-03, DR-04; research Scenario C rollout areas
  * Dependency: Application Insights deployed (Phase 1 of this plan) + 14-day log field schema validation (DR-03)

* WI-05: Sampling and retention cost governance — After 30 days of production ingestion, tune `OTEL_SAMPLING_RATIO`, Log Analytics retention tiers, and define a formal budget threshold in the SLO policy (medium priority)
  * Source: DR-02; DD-02
  * Dependency: Phase 1 + Phase 2 deployed to production environment

---

## Validator Findings — Addressed (2026-08-03)

Items raised by Plan Validator and resolved in planning files.

* DD-03 (CRITICAL, resolved): Step 2.2 referenced a non-existent Bicep server module. No server container app Bicep module exists; env vars are injected via `az containerapp update --set-env-vars` in .github/workflows/cd.yml. Step 2.2 was replaced with a cd.yml update step. Step 1.3 erroneous "server module params" instruction was removed.
  * Resolution: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md Step 2.2 rewritten; plan and details both updated.

* DD-04 (MAJOR, resolved): The original Step 3.4 proposed switching writeLog to JSON output, which would have silently broken the cd.yml Log Analytics query at line 475. Resolution: Step 3.4 now preserves the existing text format and appends `traceId=<id> spanId=<id>` as a format-compatible suffix.
  * Resolution: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md Step 3.4 rewritten.

* DD-05 (MAJOR, resolved): The original Step 3.2 proposed calling `useAzureMonitor()` inside index.ts body, which would execute after ESM static imports hoisted express/pg/socket.io, breaking auto-instrumentation. Resolution: Step 3.2 now creates a separate `apps/server/src/telemetry.ts` loader module; Step 3.2a wires it as a `--import` flag in start commands.
  * Resolution: .copilot-tracking/details/2026-08-03/monitoring-observability-details.md Steps 3.2 and 3.2a replaced.

* DR-06 (MINOR, noted): apps/server/src/db/repository.ts and apps/server/src/db/client.ts listed as Scenario C rollout areas have no explicit enrichment step. pg auto-instrumentation covers the query spans; custom event trace correlation in these files is deferred to WI-04 (dashboard validation) or a dedicated follow-on step.
  * Resolution: Accepted as minor; deferred to WI-04 scope.

## Review Rework Findings — Addressed (2026-08-03)

* RR-01: Client socket lifecycle telemetry now relies on canonical telemetry events that reach the existing server event bus.
  * Resolution: Removed the console-only helper from `apps/client/src/network/useSocketConnection.ts`; canonical entry and reconnect events remain the source of truth.

* RR-02: Client auth callback failures now advance to `connect_error` instead of hanging the handshake.
  * Resolution: The auth callback now invokes `callback({})` after `onAuthLoss` when token acquisition throws, and the new unit test covers the path.

* RR-03: Azure Monitor preload failures no longer crash the server before startup.
  * Resolution: Wrapped `useAzureMonitor()` in `apps/server/src/telemetry.ts` with a degrading `try/catch` path.

* RR-04: Log Analytics shared key is no longer exposed in Bicep deployment outputs.
  * Resolution: Removed the `sharedKey` output from `infra/bicep/modules/monitoring.bicep` and resolved the key inside `infra/bicep/modules/containerAppsEnvironment.bicep`.

* RR-05: Adjacent observability correctness issues were resolved during the rework.
  * Resolution: `apps/server/src/logging/redact.ts` now redacts `ip`, and `/health` returns `process.env.npm_package_version ?? '0.0.0'`.

* RR-06: `westcentralus` does not support `Microsoft.Insights/components` deployments and the same unstamped resource names cannot be redeployed into a different location.
  * Resolution: Added top-level `deploymentLocation` and `deploymentStamp` parameters. The host parameter file now targets a same-region `westus3` staging stack with stamped names, allowing the existing westcentralus stack to remain up while the westus3 stack is deployed idempotently.

* RR-07: The stamped `principal-recovery` Container Apps job name exceeded the service's 32-character limit.
  * Resolution: Shortened the resource name suffix to `-recovery` and added `namePrefix` to the custom role-definition GUID so simultaneous regional stacks in the same resource group do not contend for one role definition.

* RR-08: The principal recovery job is not required for this deployment.
  * Resolution: Removed the recovery Bicep module, its main-template parameters/output, the manual CD workflow path, and the server recovery CLI, operation, tests, and package command.
