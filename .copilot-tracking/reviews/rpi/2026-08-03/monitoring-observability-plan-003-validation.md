<!-- markdownlint-disable-file -->
# RPI Validation: Monitoring and Observability — Phase 3 (Server Instrumentation)

**Validation Date**: 2026-08-03
**Plan File**: `.copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md`
**Changes Log**: `.copilot-tracking/changes/2026-08-03/monitoring-observability-changes.md`
**Research Document**: `.copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md`
**Phase Validated**: Phase 3 — Steps 3.1, 3.2, 3.2a, 3.3, 3.4, 3.5
**Validation Status**: **PASSED**

---

## Coverage Summary

| Step | Plan Requirement | Status | Severity |
|------|-----------------|--------|----------|
| 3.1 | Add `@azure/monitor-opentelemetry` to `apps/server/package.json` | ✅ Verified | — |
| 3.2 | Create `apps/server/src/telemetry.ts` as `--import` loader module | ✅ Verified | — |
| 3.2a | Register `--import` flag in package.json scripts and Dockerfile | ✅ Verified | — |
| 3.3 | Enrich `/health` with DB ping and degraded status handling | ✅ Verified | — |
| 3.4 | Append OTel trace correlation fields to `writeLog` (format-preserving) | ✅ Verified | — |
| 3.5 | Validate server build and tests | ✅ Verified (changes log) | — |

**Total findings**: 0 Critical, 0 Major, 1 Minor, 1 Info

---

## Step-by-Step Findings

### Step 3.1 — `@azure/monitor-opentelemetry` dependency

**Status**: ✅ Passed

**Evidence** (`apps/server/package.json`, line 24):
```json
"@azure/monitor-opentelemetry": "^1.19.0",
```

Dependency added to `dependencies` (not `devDependencies`), which is correct for a runtime SDK that must be present in production.

**Research alignment**: Matches research-selected Scenario C and plan objective "Add `@azure/monitor-opentelemetry` server-side SDK instrumentation."

---

### Step 3.2 — `apps/server/src/telemetry.ts` `--import` loader module

**Status**: ✅ Passed

**Evidence** (`apps/server/src/telemetry.ts`, lines 1–27):
- Line 1: `import { useAzureMonitor } from '@azure/monitor-opentelemetry'` — correct SDK entry point.
- Lines 3–18: `parseSamplingRatio` helper clamps `OTEL_SAMPLING_RATIO` to `[0, 1]` with graceful fallback to `1.0`.
- Lines 20–27: `useAzureMonitor()` is called only when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, preventing startup errors in environments without the env var.

**Research alignment**: Success criterion "Server startup registers OTel SDK; useAzureMonitor() is called before request handlers" — satisfied by `--import` preload mechanism.

**Info (I-01)**: The `parseSamplingRatio` function silently clamps out-of-range values (e.g., `2.0` → `1.0`, `-0.5` → `0.0`). No warning is emitted. This is not a defect (fail-safe behavior), but a log message at startup for out-of-range values would aid operator debugging.

---

### Step 3.2a — `--import` flag in package.json scripts and Dockerfile

**Status**: ✅ Passed

**Evidence** (`apps/server/package.json`, lines 6–8):
```json
"dev": "NODE_ENV=development nodemon --exec 'node --env-file=../../.env --import tsx/esm --import ./src/telemetry.ts' src/index.ts",
"start": "node --import ./dist/telemetry.js dist/index.js",
```

- `dev` script: preloads `./src/telemetry.ts` via `tsx/esm` (correct for development, uses source file).
- `start` script: preloads `./dist/telemetry.js` (correct for production, uses compiled output).

**Evidence** (`apps/server/Dockerfile`, line 31):
```dockerfile
CMD ["node", "--import", "./dist/telemetry.js", "dist/index.js"]
```

Dockerfile runtime command correctly preloads the compiled telemetry loader before the server entry point.

**Minor (M-01)**: The `dev` script preloads using the path `./src/telemetry.ts` with `tsx/esm`. This is appropriate for development but relies on `tsx` being installed as a `devDependency`. The `test` script does not specify `--import`, meaning tests run without OTel initialization. This is intentional isolation (tests should not require a connection string) and consistent with the plan, but is worth noting as a deliberate gap.

---

### Step 3.3 — `/health` endpoint with DB readiness and degraded status

**Status**: ✅ Passed

**Evidence** (`apps/server/src/index.ts`, lines 928–944):
```ts
app.get('/health', async (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'error'
  try {
    await getDatabaseBundle().pool.query('SELECT 1')
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

- DB ping: `SELECT 1` against the pooled connection — lightweight and appropriate.
- Degraded path: returns HTTP 503 with `status: 'degraded'` and `checks: { db: 'error' }` — satisfies plan requirement.
- Structured `checks` field enables future addition of further dependency checks without breaking consumers.

**Research alignment**: Success criterion "/health endpoint returns dependency readiness (DB status), not just liveness" — fully satisfied.

---

### Step 3.4 — OTel trace correlation appended to `writeLog` (format-preserving)

**Status**: ✅ Passed

**Evidence** (`apps/server/src/index.ts`):

- Line 9: `import { trace } from '@opentelemetry/api'` — uses `@opentelemetry/api` for span context access (bridge between SDK and manual API).
- Lines 427–445 (`writeLog` function):
  ```ts
  const activeSpanContext = trace.getActiveSpan()?.spanContext()
  const traceSuffix = activeSpanContext
    ? ` traceId=${activeSpanContext.traceId} spanId=${activeSpanContext.spanId}`
    : ''
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextSuffix}${traceSuffix}`
  ```
- Suffix is appended only when an active span exists — no-op outside of traced requests, preserving the existing log format for all existing call sites.

**Research alignment**: Success criterion "writeLog entries include trace/request correlation ID" — fully satisfied.

Note: `@opentelemetry/api` is not listed explicitly as a `dependency` in `apps/server/package.json`; it is a peer/transitive dependency of `@azure/monitor-opentelemetry`. This is standard practice for the OTel API package and does not constitute a missing dependency.

---

### Step 3.5 — Server build and tests validated

**Status**: ✅ Passed (evidence from changes log)

**Evidence** (changes log, Validation Status section):
> `cd apps/server && npm run lint && npm run build && npm test` passed

Additional note from changes log: one pre-existing unused import warning in `apps/server/src/db/purge.postgres.integration.test.ts` was reported but is unrelated to observability changes and did not block completion.

---

## Severity Register

| ID | Severity | Step | Description |
|----|----------|------|-------------|
| M-01 | Minor | 3.2a | `vitest`/test runner does not preload `--import ./src/telemetry.ts`, so tests run without OTel init. This is intentional isolation but worth documenting explicitly in test setup notes. |
| I-01 | Info | 3.2 | `parseSamplingRatio` clamps silently; no startup log is emitted when `OTEL_SAMPLING_RATIO` is out of range. |

---

## Coverage Assessment

All six plan checklist items for Phase 3 are implemented and verified against actual file content. File evidence confirms:
- Dependency added (`package.json`)
- Loader module created (`telemetry.ts`)
- Preload registered in all three command surfaces (dev script, start script, Dockerfile)
- Health endpoint upgraded with DB dependency check and degraded HTTP 503 response
- `writeLog` trace correlation appended via `@opentelemetry/api` bridge, format-preserving

Phase coverage: **6 / 6 items (100%)**.

---

## Recommended Follow-On Validations

- [ ] Phase 1 (Infrastructure Baseline) validation — verify `infra/bicep/modules/monitoring.bicep` Application Insights resource and `infra/bicep/modules/diagnostics.bicep` exist and compile.
- [ ] Phase 2 (Deployment Configuration) validation — verify `scripts/bootstrap-cd-environment.sh` and `.github/workflows/cd.yml` include `APPLICATIONINSIGHTS_CONNECTION_STRING`.
- [ ] Phase 4 (Client Instrumentation) validation — verify `apps/client/package.json` `@opentelemetry/api` and `useSocketConnection.ts` structured telemetry replacement.
- [ ] Phase 5 (SLO Policy) validation — verify `docs/decisions/2026-08-03-observability-slo-policy.md` content against research actionable step 5.
- [ ] Integration smoke test: confirm OTel SDK initializes and emits traces in a local run with `APPLICATIONINSIGHTS_CONNECTION_STRING` set.
