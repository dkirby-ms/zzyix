<!-- markdownlint-disable-file -->
# Implementation Details: Monitoring and Observability

## Context Reference

Sources: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md, GitHub issue #135, codebase analysis of infra/bicep, apps/server, apps/client

---

## Implementation Phase 1: Infrastructure Baseline (Bicep)

<!-- parallelizable: true -->

### Step 1.1: Add Application Insights workspace-based resource to monitoring.bicep

Add a workspace-based Application Insights resource linked to the existing Log Analytics workspace. Output the connection string so it can be consumed by the server container app.

Files:
* infra/bicep/modules/monitoring.bicep - Extend with appInsights resource and connectionString output

Key change — append after the existing Log Analytics resource (after line 26):

```bicep
// Workspace-based Application Insights linked to the Log Analytics workspace.
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

@description('The Application Insights connection string for SDK instrumentation.')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('The Application Insights instrumentation key (legacy; prefer connection string).')
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
```

Success criteria:
* `az bicep build --file infra/bicep/main.bicep` succeeds with no errors
* monitoring module outputs include appInsightsConnectionString

Context references:
* infra/bicep/modules/monitoring.bicep (Lines 8-26) - Existing Log Analytics resource and output conventions
* https://learn.microsoft.com/azure/azure-resource-manager/bicep/scenarios-monitoring - Monitoring resource patterns in Bicep
* https://learn.microsoft.com/azure/well-architected/service-guides/application-insights - Workspace-based App Insights recommendation

Dependencies:
* No prior steps required; file is standalone

---

### Step 1.2: Create infra/bicep/modules/diagnostics.bicep

Create a new diagnostics module that adds Azure Monitor diagnostic settings for the ACA environment. This routes platform metrics and logs to the Log Analytics workspace.

Files:
* infra/bicep/modules/diagnostics.bicep - New file

Full file content:

```bicep
@description('The resource ID of the ACA managed environment to configure diagnostics for.')
param acaEnvironmentId string

@description('The resource ID of the Log Analytics workspace for diagnostic log destination.')
param logAnalyticsWorkspaceId string

// Diagnostic settings for the ACA managed environment.
// Routes ContainerAppConsoleLogs and system logs to Log Analytics for queryability.
resource acaEnvironmentDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'aca-env-diagnostics'
  scope: acaEnvironmentResource
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'ContainerAppConsoleLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
      {
        category: 'ContainerAppSystemLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
  }
}

// Resolve the ACA environment resource by ID using existing() to scope the diagnostic setting.
resource acaEnvironmentResource 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: last(split(acaEnvironmentId, '/'))
}
```

Success criteria:
* File passes `az bicep build` when wired through main.bicep

Context references:
* https://learn.microsoft.com/azure/container-apps/log-options - ACA log and diagnostic settings
* infra/bicep/modules/containerAppsEnvironment.bicep (Lines 20-39) - ACA environment resource for scoping

Dependencies:
* Step 1.1 must be started so workspaceId is available; can run in parallel with 1.1

---

### Step 1.3: Wire Application Insights and diagnostics in main.bicep; output connection string

Update main.bicep to:
1. Expose appInsightsConnectionString as a top-level output so operators can copy it into the GitHub Environment (there is no server Bicep module — env vars are injected via cd.yml, see Step 2.2).
2. Add the diagnostics module invocation after containerAppsEnvironment.

Files:
* infra/bicep/main.bicep - Add diagnostics module, pass appInsightsConnectionString to server

Changes:

After the monitoring module block (after line 45), add the diagnostics module:

```bicep
// ── Observability Diagnostics ─────────────────────────────────────────────────
// Adds platform-level diagnostic settings to ACA environment routing logs/metrics to Log Analytics.
module diagnostics 'modules/diagnostics.bicep' = {
  name: 'diagnostics'
  params: {
    acaEnvironmentId: containerAppsEnvironment.outputs.environmentId
    logAnalyticsWorkspaceId: monitoring.outputs.workspaceId
  }
}
```

Add an output for the connection string (so bootstrap/CD can consume it):

```bicep
@description('Application Insights connection string for server SDK instrumentation.')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
```

Note: There is no server container app Bicep module; env vars for the server container app are injected via `az containerapp update --set-env-vars` in cd.yml (see Step 2.2).

Success criteria:
* `az bicep build --file infra/bicep/main.bicep` produces no errors
* main.bicep output includes appInsightsConnectionString

Context references:
* infra/bicep/main.bicep (Lines 39-45) - Existing monitoring module wiring
* infra/bicep/main.bicep (Lines 80-115) - Existing server/postgres module wiring pattern

Dependencies:
* Step 1.1 (monitoring.bicep appInsightsConnectionString output)
* Step 1.2 (diagnostics.bicep file)

---

### Step 1.4: Validate Bicep changes

Run Bicep compilation to validate syntax and module wiring.

Validation commands:
* `az bicep build --file infra/bicep/main.bicep` - Validates all module references and type correctness
* `az bicep build --file infra/bicep/modules/monitoring.bicep` - Isolated module validation
* `az bicep build --file infra/bicep/modules/diagnostics.bicep` - New module validation

---

## Implementation Phase 2: Deployment Configuration

<!-- parallelizable: true -->

### Step 2.1: Add APPLICATIONINSIGHTS_CONNECTION_STRING to bootstrap-cd-environment.sh

Document the new required environment variable in the bootstrap script usage block and required variable list so CD operators know to provision it.

Files:
* scripts/bootstrap-cd-environment.sh - Add APPLICATIONINSIGHTS_CONNECTION_STRING to the required vars section

In the `usage()` function's "Required environment variables" list (around line 25), add:

```bash
  APPLICATIONINSIGHTS_CONNECTION_STRING
```

Also add to the variable section that the script reads and sets for the GitHub Environment:

```bash
# Observability
APPLICATIONINSIGHTS_CONNECTION_STRING  # Application Insights connection string from Bicep output
```

Success criteria:
* Script `--help` output includes APPLICATIONINSIGHTS_CONNECTION_STRING
* No shell syntax errors (`bash -n scripts/bootstrap-cd-environment.sh`)

Context references:
* scripts/bootstrap-cd-environment.sh (Lines 25-50) - Existing variable declaration conventions

Dependencies:
* Step 1.3 (Bicep output for connection string) — logically dependent but can be implemented in parallel

---

### Step 2.2: Add APPLICATIONINSIGHTS_CONNECTION_STRING to .github/workflows/cd.yml server deployment steps

The server container app is created/updated via `az containerapp create/update --set-env-vars` in cd.yml, not via a Bicep server module. There are two `az containerapp update` invocations that set server env vars: the initial deploy step (~line 568) and the CORS finalization step (~line 746). Both must include the new variables.

Files:
* .github/workflows/cd.yml - Add APPLICATIONINSIGHTS_CONNECTION_STRING to both server `az containerapp update --set-env-vars` invocations

In each `az containerapp update` call for the server, add to the `--set-env-vars` argument list:

```bash
APPLICATIONINSIGHTS_CONNECTION_STRING="${{ vars.APPLICATIONINSIGHTS_CONNECTION_STRING }}" \
OTEL_SERVICE_NAME=zzyix-server \
OTEL_SAMPLING_RATIO="${{ vars.OTEL_SAMPLING_RATIO || '1.0' }}"
```

Use `vars.APPLICATIONINSIGHTS_CONNECTION_STRING` (GitHub Environment variable, not a secret) since the connection string identifies the Application Insights resource but is not a high-sensitivity credential — operators can choose to use a secret if policy requires it.

Success criteria:
* Both `az containerapp update` server steps in cd.yml include APPLICATIONINSIGHTS_CONNECTION_STRING
* `APPLICATIONINSIGHTS_CONNECTION_STRING` is documented as an operator-provisioned GitHub Environment variable in the usage output of bootstrap-cd-environment.sh (Step 2.1)

Context references:
* .github/workflows/cd.yml (Lines 465-480) - Existing Log Analytics env var pattern for reference
* scripts/bootstrap-cd-environment.sh (Lines 25-50) - Variable documentation conventions

Dependencies:
* Step 2.1 (bootstrap-cd-environment.sh documents the variable)
* Step 1.3 (Bicep output for connection string — operators copy this value into the GitHub Environment)

---

## Implementation Phase 3: Server Instrumentation

<!-- parallelizable: true -->

### Step 3.1: Add @azure/monitor-opentelemetry dependency to apps/server

Install the Azure Monitor OpenTelemetry distro. This package provides `useAzureMonitor()` which configures traces, metrics, and logs for Azure Monitor export while maintaining OTel API compatibility.

Files:
* apps/server/package.json - Add @azure/monitor-opentelemetry to dependencies

Command: `cd apps/server && npm install @azure/monitor-opentelemetry`

This installs the package and updates package.json and package-lock.json (or the workspace lock file at the root).

Success criteria:
* `apps/server/package.json` dependencies include `@azure/monitor-opentelemetry`
* `npm install` succeeds without audit errors blocking the install

Context references:
* apps/server/package.json (Lines 1-55) - Existing dependency conventions
* https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable - useAzureMonitor API reference

Dependencies:
* No prior steps required

---

### Step 3.2: Create apps/server/src/telemetry.ts — OTel --import loader module

In Node.js ESM, static `import` declarations in index.ts are hoisted and resolved before any module body code runs. Calling `useAzureMonitor()` inside index.ts body (even at the top) would execute AFTER express, pg, and socket.io modules are already loaded, breaking auto-instrumentation.

The correct approach for ESM is a separate loader module registered via the `--import` flag. Node.js 18.19+ evaluates `--import` modules before the entry point's static imports are processed.

Files:
* apps/server/src/telemetry.ts - New file: OTel initialization loader

Full file content:

```typescript
// OTel initialization loader — registered via --import before index.ts is evaluated.
// Must remain import-free of app code to avoid circular evaluation.
import { useAzureMonitor } from '@azure/monitor-opentelemetry'

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: Number(process.env.OTEL_SAMPLING_RATIO ?? '1.0'),
  })
}
```

Success criteria:
* File compiles without TypeScript errors (`npm run build` in apps/server)
* No imports of app-internal modules (circular evaluation risk)
* Guard allows server to start normally when APPLICATIONINSIGHTS_CONNECTION_STRING is unset

Context references:
* apps/server/package.json - `"type": "module"` confirms ESM; `tsconfig.json` for compilation target
* https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable - useAzureMonitor API

Dependencies:
* Step 3.1 (package installed)

---

### Step 3.2a: Register --import loader in server start commands

Update all server process launch commands to include `--import ./dist/telemetry.js` (production) or `--import tsx/esm --import ./src/telemetry.ts` (dev via tsx).

Files:
* apps/server/package.json - Update `start` and `dev` scripts
* apps/server/Dockerfile - Update CMD or ENTRYPOINT if it calls `node dist/index.js` directly

Changes to apps/server/package.json scripts:

```json
"start": "node --import ./dist/telemetry.js dist/index.js",
"dev": "NODE_ENV=development nodemon --exec 'node --env-file=../../.env --import tsx/esm --import ./src/telemetry.ts' src/index.ts"
```

In apps/server/Dockerfile, update the CMD to include the `--import` flag:
```dockerfile
CMD ["node", "--import", "./dist/telemetry.js", "dist/index.js"]
```

Success criteria:
* `npm start` command includes `--import ./dist/telemetry.js`
* `npm run dev` command includes `--import ./src/telemetry.ts` (via tsx)
* Existing `configureQuiltTelemetry` observer in index.ts continues to work unchanged
* Server starts without errors when APPLICATIONINSIGHTS_CONNECTION_STRING is unset

Context references:
* apps/server/package.json (Lines 6-8) - Existing start/dev script conventions
* apps/server/Dockerfile - CMD instruction pattern

Dependencies:
* Step 3.2 (telemetry.ts file exists)

---

### Step 3.3: Enrich /health endpoint with dependency readiness checks

The current /health endpoint (apps/server/src/index.ts:924) returns `{ status: 'ok', version: '0.0.0' }` with no dependency checks. This step is independent of the OTel loader. Extend it to test DB connectivity and return a readiness status.

Files:
* apps/server/src/index.ts - Update /health handler (line 924)

Replace the handler:

```typescript
app.get('/health', async (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'error'
  try {
    // Lightweight liveness probe — SELECT 1 to verify pool connectivity.
    await dbClient.query('SELECT 1')
    dbStatus = 'ok'
  } catch {
    dbStatus = 'error'
  }
  const healthy = dbStatus === 'ok'
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    version: '0.0.0',
    checks: { db: dbStatus },
  })
})
```

Where `dbClient` is the existing database client already imported in index.ts (check apps/server/src/db/client.ts for the exported pool or query interface).

Success criteria:
* GET /health returns 200 with `{ status: 'ok', checks: { db: 'ok' } }` when DB is reachable
* GET /health returns 503 with `{ status: 'degraded', checks: { db: 'error' } }` when DB is unavailable
* Existing unit tests for /health (if any) are updated to match new shape

Context references:
* apps/server/src/index.ts (Lines 922-928) - Current /health handler
* apps/server/src/db/client.ts - DB client/pool to use for probe query

Dependencies:
* No prior steps required (standalone endpoint change)

---

### Step 3.4: Append OTel trace correlation fields to existing writeLog text output (format-preserving)

The writeLog function (apps/server/src/index.ts, around line ~426) currently emits structured text lines in the format:
`[timestamp] [LEVEL] message_name {"key":"value",...}`

The cd.yml Log Analytics query at line 475 parses this text format. To avoid a breaking change, **preserve the existing text format** and append trace fields as an additional suffix when an active OTel span is present.

Files:
* apps/server/src/index.ts - Append trace suffix to writeLog (line ~426)

Add OTel API import near the server imports (after the OTel init guard in the dev startup path):

```typescript
import { trace } from '@opentelemetry/api'
```

Update the writeLog function to append trace context as a suffix (do not change the existing JSON serialization or the text prefix format):

```typescript
// Inside writeLog, after the existing line construction:
const span = trace.getActiveSpan()
const spanContext = span?.spanContext()
const traceSuffix = spanContext ? ` traceId=${spanContext.traceId} spanId=${spanContext.spanId}` : ''
// Append traceSuffix to the existing `line` string before console output
```

Result format: `[2026-01-01T00:00:00.000Z] [INFO] server_startup_begin {"key":"value"} traceId=abc123 spanId=def456`

This preserves compatibility with the existing cd.yml line 475 Log Analytics query while making trace IDs available for grep/KQL queries.

Success criteria:
* Existing log format is preserved (`[timestamp] [LEVEL] name {...}` prefix is unchanged)
* traceId/spanId suffix appears when an active OTel span is present
* No suffix when no span is active
* cd.yml Log Analytics query at line 475 continues to produce results
* redactTelemetry call is preserved

Context references:
* apps/server/src/index.ts (Lines 426-455) - writeLog function (actual line: ~426, not ~381)
* apps/server/src/logging/redact.ts (Lines 1-17) - redactTelemetry function preserved
* .github/workflows/cd.yml (Line 475) - Existing Log Analytics query that must remain functional

Dependencies:
* Step 3.1 (package installed; @opentelemetry/api is a transitive dep of @azure/monitor-opentelemetry)

---

### Step 3.5: Validate server changes

Validation commands:
* `cd apps/server && npm run lint` - Lint scope: server source
* `cd apps/server && npm run build` - TypeScript compilation
* `cd apps/server && npm test` - Unit test suite with coverage

---

## Implementation Phase 4: Client Instrumentation

<!-- parallelizable: true -->

### Step 4.1: Add @opentelemetry/api to apps/client

The client needs the OTel browser API for typed span context if structured telemetry calls are added. This is a lightweight peer dependency with no runtime overhead when no exporter is configured.

Files:
* apps/client/package.json - Add @opentelemetry/api

Command: `cd apps/client && npm install @opentelemetry/api`

Note: Client-side export to Application Insights can be deferred to follow-on work (WI-01 in the Planning Log). For this phase, the goal is to replace raw `console.*` calls with structured calls routed through the existing telemetry event model.

Success criteria:
* `apps/client/package.json` includes `@opentelemetry/api`

Context references:
* apps/client/package.json (Lines 1-40) - Existing dependency conventions

Dependencies:
* No prior steps required

---

### Step 4.2: Replace console.log/error socket lifecycle calls in useSocketConnection.ts

The socket connection lifecycle (apps/client/src/network/useSocketConnection.ts:146-158) uses `console.log` and `console.error`. Replace these with the application's structured telemetry pattern. Examine how other client files emit events and use the same pattern.

Files:
* apps/client/src/network/useSocketConnection.ts - Replace console.log (~line 146) and console.error (~line 158) in the socket connect/connect_error handlers

Pattern to follow: check how apps/client/src/App.tsx emits runtime metrics or uses any existing client-side logging utility. If no structured telemetry emission exists at the client network layer, emit custom events through a small helper that wraps `console.info`/`console.error` with structured fields (timestamp, socketId, quiltId, errorCode) — this maintains log queryability in browser devtools while providing a structured foundation.

Replacement approach:

```typescript
// Replace: console.log('✅ Socket.IO connected:', { quiltId, socketId: socket.id })
// With structured emission:
const connectionEvent = {
  event: 'socket_connected',
  quiltId,
  socketId: socket.id,
  timestamp: new Date().toISOString(),
}
// Emit via existing telemetry bus or structured helper; keep console.info fallback for dev
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.info('[socket]', connectionEvent)
}
// Route to telemetry if available (e.g., window.__zzyixTelemetry?.emit(connectionEvent))
```

For connection errors, preserve the error routing logic (renewAndReconnect, onAuthLoss) but replace the raw `console.error` with the same structured approach.

Note: the exact telemetry emission hook depends on what the client exposes. Review apps/client/src/App.tsx:806 to determine the canary telemetry gate and how to emit without breaking it.

Success criteria:
* No raw `console.log` or `console.error` calls remain in useSocketConnection.ts socket lifecycle handlers
* Connection and error events produce structured log objects with timestamp, event name, and context fields
* Existing socket logic (renewAndReconnect, onAuthLoss, lineageAttemptId) is functionally unchanged

Context references:
* apps/client/src/network/useSocketConnection.ts (Lines 140-160) - Socket lifecycle handlers with console calls
* apps/client/src/App.tsx (Lines 800-815) - Canary-gated runtime metrics pattern to follow

Dependencies:
* Step 4.1 (optional; can proceed without @opentelemetry/api if using structured helper pattern)

---

## Implementation Phase 7: Review Rework

<!-- parallelizable: true -->

### Step 7.1: Route client socket lifecycle telemetry through canonical telemetry and remove the dead client OTel API stub

The first implementation replaced raw console lifecycle logs with a helper, but that helper still wrote only to the browser console and never entered the canonical telemetry pipeline. Remove the helper and rely on the canonical telemetry events that already flow through `canonical_telemetry`, including entry readiness/failure and reconnect recovery/exhaustion. Remove `@opentelemetry/api` from the client because no browser tracer provider is initialized and the dependency contributes no runtime observability value.

Files:
* apps/client/src/network/useSocketConnection.ts - Remove console-only lifecycle helper; ensure auth callback advances on failure
* apps/client/src/network/useSocketConnection.test.ts - Cover auth callback failure progression
* apps/client/package.json - Remove `@opentelemetry/api`

Success criteria:
* Client lifecycle outcomes are represented only by canonical telemetry events that reach the server event bus
* Auth callback failure calls `callback({})` after `onAuthLoss`, allowing socket.io to emit `connect_error`
* Client tests cover the auth failure path

Dependencies:
* None

---

### Step 7.2: Harden server preload and socket auth failure handling; fix adjacent observability correctness issues

The review identified two production blockers in the server slice and two nearby low-cost correctness issues. Wrap Azure Monitor preload initialization in `try/catch` so startup degrades gracefully, redact IP addresses in log contexts, and return the package version from `/health` rather than the hardcoded placeholder.

Files:
* apps/server/src/telemetry.ts - Catch Azure Monitor initialization errors and log a degraded-startup message
* apps/server/src/logging/redact.ts - Treat `ip` as sensitive
* apps/server/src/index.ts - Use runtime package version in `/health`

Success criteria:
* Server startup continues when `useAzureMonitor()` throws
* Request IP addresses are redacted by existing telemetry logging
* `/health` returns `process.env.npm_package_version ?? '0.0.0'`

Dependencies:
* None

---

### Step 7.3: Remove the Log Analytics shared key from Bicep outputs and resolve it inside the ACA environment module

The monitoring module currently emits the Log Analytics shared key as a deployment output. Move key resolution into `containerAppsEnvironment.bicep` so the shared key never leaves the module boundary via deployment history.

Files:
* infra/bicep/modules/monitoring.bicep - Remove `sharedKey` output
* infra/bicep/modules/containerAppsEnvironment.bicep - Resolve the workspace with `existing` and call `listKeys()` locally
* infra/bicep/main.bicep - Pass workspace resource ID instead of customer ID/shared key outputs

Success criteria:
* `monitoring.bicep` no longer outputs the Log Analytics shared key
* `containerAppsEnvironment.bicep` derives customer ID and shared key from the existing workspace resource
* `az bicep build --file infra/bicep/main.bicep` succeeds

Dependencies:
* None

---

### Step 7.4: Re-run focused validation for the rework slice

Validation commands:
* `npm run test --workspace=apps/client -- useSocketConnection`
* `npm run lint --workspace=apps/client`
* `npm run test --workspace=apps/server`
* `npm run lint --workspace=apps/server`
* `az bicep build --file infra/bicep/main.bicep`

---

### Step 4.3: Validate client changes

Validation commands:
* `cd apps/client && npm run lint` - Lint scope: client source
* `cd apps/client && npm run build` - TypeScript + Vite build
* `cd apps/client && npm test` - Unit test suite

---

## Implementation Phase 5: SLO Policy Artifact

<!-- parallelizable: true -->

### Step 5.1: Create docs/decisions/2026-08-03-observability-slo-policy.md

Create a decision document establishing the observability SLO policy, telemetry gate evidence requirements, and cost guardrails. This is the governance artifact referenced in the research.

Files:
* docs/decisions/2026-08-03-observability-slo-policy.md - New SLO policy document

Document sections to include:
* Context: links to issue #135 and the monitoring-and-observability-research.md artifact
* Telemetry gate evidence: what must be present before a release is approved (trace coverage ≥90% of critical server paths, log correlation ID present in writeLog, /health includes dependency readiness)
* SLO targets (initial, to be validated over 90-day period):
  * Telemetry pipeline drop rate: <1% for critical sampled events
  * Trace/log correlation coverage: ≥90% of canonical server paths
  * Dashboard utility: key interaction regressions diagnosable within 15 minutes using metrics + traces
  * Monthly ingestion cost variance: within approved budget threshold (TBD by ops owner)
* Retention policy: default 30-day Log Analytics retention (current); upgrade path to 90-day if SLO evidence requires
* Out of scope: alerting/paging/on-call (deferred to follow-on WI-02)
* Owner matrix: server telemetry (server team), client telemetry (client team), infra/cost (platform team)

Success criteria:
* Document exists at docs/decisions/2026-08-03-observability-slo-policy.md
* Document includes all sections listed above with placeholder values for owner assignments

Context references:
* .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md - Research actionable step 5 and 90-day success signals
* docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md (Line 268) - Operating budget and threshold context

Dependencies:
* No prior steps required

---

## Implementation Phase 6: Validation

<!-- parallelizable: false -->

### Step 6.1: Run full project validation

Execute all validation commands for the project:
* `cd apps/server && npm run lint && npm run build && npm test`
* `cd apps/client && npm run lint && npm run build && npm test`
* `az bicep build --file infra/bicep/main.bicep`
* `bash -n scripts/bootstrap-cd-environment.sh` (syntax check only)

### Step 6.2: Fix minor validation issues

Iterate on lint errors, TypeScript compilation failures, and test failures. Apply fixes directly when corrections are straightforward and isolated.

### Step 6.3: Report blocking issues

When validation failures require changes beyond minor fixes:
* Document the issues and affected files
* Provide the user with next steps
* Recommend additional research and planning rather than inline fixes
* Avoid large-scale refactoring within this phase

---

## Dependencies

* Azure CLI with Bicep extension (`az bicep build`)
* Node.js 20+ and npm
* `@azure/monitor-opentelemetry` (server-side Azure Monitor OTel distro)
* `@opentelemetry/api` (client-side, lightweight)

## Success Criteria

* All Bicep modules compile; monitoring.bicep outputs appInsightsConnectionString
* scripts/bootstrap-cd-environment.sh documents APPLICATIONINSIGHTS_CONNECTION_STRING
* Server starts successfully with and without APPLICATIONINSIGHTS_CONNECTION_STRING set
* /health returns dependency readiness shape `{ status, version, checks: { db } }`
* writeLog includes traceId/spanId when OTel span is active
* useSocketConnection.ts contains no raw console.log/error in socket lifecycle handlers
* docs/decisions/2026-08-03-observability-slo-policy.md exists with all required sections
* All server and client lint, build, and test steps pass
