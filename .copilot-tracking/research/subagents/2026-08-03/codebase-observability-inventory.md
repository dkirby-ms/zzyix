# Codebase Observability Inventory (Deep Research)

Date: 2026-08-03
Repository: /home/saitcho/zzyix
Researcher Mode: Codebase investigation only (no implementation changes)

## Research Scope
- Inventory current telemetry/logging/tracing/health implementation across:
  - apps/server/src
  - apps/client/src
  - scripts
  - e2e
  - docs
- Gather evidence with workspace-relative file paths and line numbers
- Identify concrete gaps across signals: logs, metrics, traces, health checks, alerting, dashboards, SLOs
- Inventory existing observability-relevant libraries/tools in package manifests
- Recommend implementation targets in specific files/components

## Method
- Keyword and symbol scans across requested areas: apps/server/src, apps/client/src, scripts, e2e, docs.
- Focus terms included telemetry, metrics, logging, tracing, health, OpenTelemetry, App Insights, pino/winston, dashboards, SLO/SLI.
- Direct file reads used to confirm behavior and avoid false positives.
- Negative findings are explicitly marked where repo search returned no matches.

## Findings

### 1) Current implementation inventory (by signal)

#### Logs
- Structured server log pipeline exists in app runtime:
  - apps/server/src/index.ts:381 defines log-level resolution.
  - apps/server/src/index.ts:391 sets ACTIVE_LOG_LEVEL from LOG_LEVEL.
  - apps/server/src/index.ts:432 serializes and redacts context before writing.
  - apps/server/src/index.ts:448-450 attaches telemetry observer to logging sink (`quilt_migration_*` event naming).
  - apps/server/src/index.ts:902 and apps/server/src/index.ts:911 log HTTP request start/completion.
  - apps/server/src/index.ts:1766 logs per-socket event receipt in debug mode.
- Recursive telemetry redaction is implemented:
  - apps/server/src/logging/redact.ts:1 defines sensitive-key pattern.
  - apps/server/src/logging/redact.ts:3 exports recursive redaction.
  - apps/server/src/logging/redact.ts:15 enforces replacement with `[redacted]` for matching keys.
- Additional non-structured console logging exists in ops/startup/helper paths:
  - apps/server/src/db/client.ts:32 logs pg pool client errors.
  - apps/server/src/startup/validateEnv.ts:64,69,74,79,84 emits startup validation progress/errors.
  - apps/client/src/network/useSocketConnection.ts:146,155,174 logs connect/error/disconnect on client.
  - apps/client/src/App.tsx:129 logs canvas lazy-load failures.

#### Metrics
- Server-side telemetry events are implemented through an in-process observer abstraction:
  - apps/server/src/migration/quiltTelemetry.ts:1 defines legacy telemetry event union.
  - apps/server/src/migration/quiltTelemetry.ts:31-38 defines canonical telemetry event union.
  - apps/server/src/migration/quiltTelemetry.ts:47 and 51 expose configure/emit functions.
- Server emits concrete metric-like events at runtime:
  - apps/server/src/db/client.ts:52-53 emits `pool_wait` with pool queue depth/counts.
  - apps/server/src/db/repository.ts:1520 emits `dual_read_parity`.
  - apps/server/src/db/repository.ts:1842 emits `patch_lock_wait`.
  - apps/server/src/db/repository.ts:2008 and 2147 emit `mutation_latency`.
  - apps/server/src/index.ts:2243 emits `snapshot_bytes`.
  - apps/server/src/index.ts:2279 emits `room_churn`.
  - apps/server/src/index.ts:2015 handles incoming `quilt_client_runtime_metrics`.
- Client collects and submits runtime metrics:
  - apps/client/src/App.tsx:425-431 tracks telemetry counters and scene metrics refs.
  - apps/client/src/App.tsx:806 emits `quilt_client_runtime_metrics` every 10s when canary telemetry is enabled.
  - apps/client/src/render/MosaicScene.tsx:478-483 computes frameTimeMs/drawCalls/sceneObjectCount and reports via callback.
- E2E performance budget assertions exist (test-time, not production monitoring):
  - e2e/quilt-seams.spec.ts:17 defines CLIENT_BUDGETS.
  - e2e/quilt-seams.spec.ts:169-176 asserts retained patches/tiles, drawCalls, snapshotBytes, frameTimeMs.
  - e2e/quilt-seams.spec.ts:177-178 attaches measured metrics artifact.
  - apps/client/src/test/canvasTestApi.ts:40 defines metrics payload available to E2E bridge.

#### Traces
- Distributed tracing SDK instrumentation was not found in target app code.
  - Search evidence: no matches for OpenTelemetry/ApplicationInsights/prom-client/Sentry/Datadog/NewRelic under apps/server/src and apps/client/src.
- Test-level Playwright trace capture is enabled:
  - playwright.config.ts:27 sets `trace: 'retain-on-failure'`.
  - playwright.multi-replica.config.ts:28 sets `trace: 'retain-on-failure'`.

#### Health checks
- Application health endpoint exists:
  - apps/server/src/index.ts:924-925 exposes GET /health returning status/version JSON.
- Dev/test startup scripts and harnesses actively gate on health:
  - scripts/dev-test-auth.mjs:121 waits for `${serverUrl}/health`.
  - playwright.config.ts:60 waits for `${SERVER_URL}/health` webServer readiness.
  - playwright.multi-replica.config.ts:38 and 44 wait on replica /health endpoints.
- Container dependency health checks exist:
  - docker-compose.yaml:13-14 postgres healthcheck with pg_isready.
  - docker-compose.yaml:30-31 redis healthcheck with redis-cli ping.

#### Alerting and dashboards
- Policy-level expectation exists but executable alert/dashboard resources were not found in requested code areas.
  - apps/server/README.md:54 defines `AUTH_TELEMETRY_GATE_APPROVED` as requiring dashboards and alerts.
  - apps/server/README.md:83 states rollout is blocked when approvals are false/missing.
  - apps/server/src/startup/rolloutGates.ts:13 includes `AUTH_TELEMETRY_GATE_APPROVED` in required production approvals.
- No concrete runtime dashboard/alert definitions were found in apps/server/src, apps/client/src, scripts, e2e, docs.
  - Search evidence: no matches for alert-rule/dashboard provisioning keywords in those requested paths.

#### SLOs/SLIs/SLAs
- Decision-level measurement gates exist, but explicit operationalized SLO artifacts were not found.
  - docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:259 introduces operating budget gates.
  - docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:268-273 lists unresolved thresholds and measurement methods (DB, protocol, cache, frame time, etc.).
  - docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:275-276 requires percentile/failure criterion/rollback trigger metadata.

### 2) Existing observability/logging/tracing-related tools in package manifests

- No dedicated observability SDK/logging framework dependencies were found in these package manifests:
  - package.json
  - apps/server/package.json
  - apps/client/package.json
  - (Search evidence: no matches for `@opentelemetry/*`, `applicationinsights`, `prom-client`, `pino`, `winston`, `sentry`, `datadog`, `newrelic`.)
- Present building blocks relevant to instrumentation transport/execution:
  - apps/server/package.json:28 express
  - apps/server/package.json:33 socket.io
  - apps/server/package.json:26 @socket.io/postgres-adapter
  - apps/server/package.json:32 pg
  - apps/server/package.json:31 node-cron
  - apps/client/package.json:29 socket.io-client
  - playwright.config.ts:27 and playwright.multi-replica.config.ts:28 Playwright traces in test runs

### 3) Concrete gaps mapped to required signals

#### Logs
- Gap L1: Mixed logging model.
  - Structured `writeLog` exists, but direct `console.*` is still used in several runtime/operational paths.
  - Evidence: apps/server/src/db/client.ts:32, apps/server/src/startup/validateEnv.ts:64-84, apps/client/src/network/useSocketConnection.ts:146-174.

#### Metrics
- Gap M1: No pull/export metrics endpoint for infra scrapers.
  - No `/metrics` route found in apps/server/src.
  - Existing telemetry is in-process observer based (apps/server/src/migration/quiltTelemetry.ts:47,51) and logged, not exposed via exporter.
- Gap M2: Client runtime metrics are canary-gated and event-based only.
  - apps/client/src/App.tsx:801 and 806 guard/send only when `canaryTelemetryEnabled` and topology are present.

#### Traces
- Gap T1: No distributed tracing instrumentation.
  - No OpenTelemetry/App Insights tracer provider/span propagation in apps/server/src or apps/client/src.
- Gap T2: Trace capture is test-only.
  - Playwright traces exist (playwright.config.ts:27; playwright.multi-replica.config.ts:28) but not production transaction traces.

#### Health checks
- Gap H1: Health endpoint appears liveness-only.
  - apps/server/src/index.ts:924-925 returns static `{ status: 'ok', version: '0.0.0' }` and does not indicate dependency readiness.
  - [Assumption] No readiness/dependency probe fields were observed in this route.

#### Alerting
- Gap A1: Approval gate exists without in-repo enforcement artifacts in requested paths.
  - apps/server/src/startup/rolloutGates.ts:13 requires approval flags.
  - apps/server/README.md:54 describes dashboards/alerts expectation.
  - No alert rule definitions found in apps/server/src, apps/client/src, scripts, e2e, docs.

#### Dashboards
- Gap D1: Dashboard definitions not present in requested implementation/documentation paths.
  - No dashboard config files or generated dashboard JSON were found in the requested areas.

#### SLOs
- Gap S1: Decision document defines measurement categories, but no concrete SLO target file found.
  - docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:268-273 describes unresolved thresholds.
  - No concrete objective registry (e.g., per-service latency/error-budget targets) was found in requested paths.

### 4) Recommended implementation targets (specific files/components)

#### High-priority server targets
- apps/server/src/index.ts
  - Promote canonical metric events to an exporter path (in addition to log sink) near configureQuiltTelemetry wiring (around lines 448-450).
  - Add readiness semantics for `/health` (around lines 924-925), optionally split liveness/readiness.
  - Standardize all request/socket/error logging through one structured logger surface (writeLog).
- apps/server/src/migration/quiltTelemetry.ts
  - Add transport/export abstraction for telemetry backend(s) and schema versioning controls.
- apps/server/src/db/repository.ts
  - Ensure all critical DB operations emit latency + outcome dimensions consistently (existing signals at lines 1520, 1842, 2008, 2147).
- apps/server/src/db/client.ts
  - Convert pool error console logging to structured logger and include correlation fields where possible.

#### High-priority client targets
- apps/client/src/network/useSocketConnection.ts
  - Replace console logs with structured client telemetry/log events (connect_error/disconnect/reconnect lifecycle already centralized here).
  - Add explicit correlation IDs in telemetry payloads where safe.
- apps/client/src/App.tsx
  - Expand runtime metrics payload with connection quality signals and emit cadence controls; currently emits every 10s under canary gate.
- apps/client/src/render/MosaicScene.tsx
  - Add percentile/rolling-window aggregation helper integration for scene metrics before emission.

#### Script/E2E/Docs targets
- scripts/dev-test-auth.mjs
  - Emit structured startup timing for service readiness waits (issuer/server/client).
- e2e/quilt-seams.spec.ts
  - Keep/expand budget assertions into reusable SLI contract tests with versioned thresholds.
- docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md
  - Promote unresolved threshold table into concrete approved SLO document once values are measured.
- apps/server/README.md
  - Add explicit mapping from `AUTH_TELEMETRY_GATE_APPROVED` to where dashboards/alerts/SLO evidence must live.

## Evidence Index (selected high-signal references)

- apps/server/src/index.ts:381
- apps/server/src/index.ts:391
- apps/server/src/index.ts:432
- apps/server/src/index.ts:448
- apps/server/src/index.ts:902
- apps/server/src/index.ts:911
- apps/server/src/index.ts:924
- apps/server/src/index.ts:2015
- apps/server/src/index.ts:2243
- apps/server/src/index.ts:2279
- apps/server/src/migration/quiltTelemetry.ts:1
- apps/server/src/migration/quiltTelemetry.ts:31
- apps/server/src/migration/quiltTelemetry.ts:47
- apps/server/src/migration/quiltTelemetry.ts:51
- apps/server/src/logging/redact.ts:1
- apps/server/src/logging/redact.ts:3
- apps/server/src/db/client.ts:52
- apps/server/src/db/client.ts:53
- apps/server/src/db/repository.ts:1520
- apps/server/src/db/repository.ts:1842
- apps/server/src/db/repository.ts:2008
- apps/server/src/db/repository.ts:2147
- apps/client/src/App.tsx:425
- apps/client/src/App.tsx:806
- apps/client/src/App.tsx:1174
- apps/client/src/render/MosaicScene.tsx:478
- apps/client/src/render/MosaicScene.tsx:483
- apps/client/src/network/useSocketConnection.ts:87
- apps/client/src/network/useSocketConnection.ts:136
- apps/client/src/network/useSocketConnection.ts:146
- apps/client/src/network/useSocketConnection.ts:155
- apps/client/src/network/useSocketConnection.ts:174
- apps/client/src/test/canvasTestApi.ts:40
- scripts/dev-test-auth.mjs:121
- docker-compose.yaml:13
- docker-compose.yaml:30
- playwright.config.ts:27
- playwright.config.ts:60
- playwright.multi-replica.config.ts:28
- playwright.multi-replica.config.ts:38
- playwright.multi-replica.config.ts:44
- e2e/quilt-seams.spec.ts:17
- e2e/quilt-seams.spec.ts:169
- e2e/quilt-seams.spec.ts:177
- docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:259
- docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:268
- docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:273
- apps/server/README.md:54
- apps/server/README.md:87
- apps/server/README.md:163
- apps/server/src/startup/rolloutGates.ts:13

## Gaps Mapped to Signals

- Logs: mixed structured/unstructured logging; standardization incomplete.
- Metrics: event logs exist, exporter endpoint and backend integration not present in requested paths.
- Traces: no distributed tracing instrumentation in app code; only Playwright failure traces.
- Health checks: liveness endpoint present; readiness/dependency health not explicit in endpoint payload.
- Alerting: policy gates exist; concrete alert rule definitions not found in requested areas.
- Dashboards: expected by gate language; dashboard-as-code not found in requested areas.
- SLOs: measurement categories documented; concrete approved threshold registry not found.

## Existing Observability Libraries/Tools

- Logging/telemetry implementation is custom code in repository (`writeLog`, `redactTelemetry`, `emitQuiltTelemetry`) rather than third-party observability SDKs.
- No direct dependency declarations for OpenTelemetry/App Insights/Prometheus/Sentry/DataDog/New Relic/Pino/Winston in:
  - package.json
  - apps/server/package.json
  - apps/client/package.json
- Relevant runtime dependencies that observability implementation can build on:
  - apps/server/package.json:28 express
  - apps/server/package.json:33 socket.io
  - apps/server/package.json:32 pg
  - apps/client/package.json:29 socket.io-client

## Unresolved Questions

- Where should canonical telemetry events be persisted/exported in production (Log Analytics only, metrics backend, tracing backend, or mixed)?
- Is `GET /health` intended to remain liveness-only, or should it include dependency readiness and build/version metadata from package/release artifacts?
- What is the source-of-truth location for required alert/dashboard/SLO artifacts that satisfy `AUTH_TELEMETRY_GATE_APPROVED`?
- Should client-side connect/disconnect/error console logs be retained for local DX or replaced fully by structured event telemetry?
