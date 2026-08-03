<!-- markdownlint-disable-file -->
# Review: Monitoring and Observability

## Metadata

| Field              | Value                                                                                                                   |
|--------------------|-------------------------------------------------------------------------------------------------------------------------|
| **Review Date**    | 2026-08-03                                                                                                              |
| **Related Plan**   | .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md                                        |
| **Changes Log**    | .copilot-tracking/changes/2026-08-03/monitoring-observability-changes.md                                                |
| **Research Doc**   | .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md                                          |
| **Quality Log**    | .copilot-tracking/reviews/2026-08-03/monitoring-observability-impl-quality.md                                           |
| **Overall Status** | ⚠️ Needs Rework                                                                                                         |

## Severity Summary

| Severity    | RPI | Quality | Total |
|-------------|-----|---------|-------|
| 🔴 Critical | 0   | 0       | **0** |
| 🟠 Major    | 2   | 3       | **5** |
| 🟡 Minor    | 5   | 2       | **7** |
| ℹ️ Info     | 5   | 2       | **7** |

---

## RPI Validation Results

### Phase 1: Infrastructure Baseline (Bicep) — ✅ PASSED

All Bicep steps fully implemented and verified.

| Step | Status | Evidence |
|------|--------|----------|
| 1.1 Add App Insights to monitoring.bicep | ✅ Complete | `Microsoft.Insights/components@2020-02-02` workspace-based resource with connection string output — monitoring.bicep:19 |
| 1.2 Create diagnostics.bicep | ✅ Complete | File present; `Microsoft.Insights/diagnosticSettings` routing ConsoleLog, SystemLog, AllMetrics — diagnostics.bicep:13 |
| 1.3 Wire modules + output connection string | ✅ Complete | diagnostics module wired at main.bicep:63; `output appInsightsConnectionString` at main.bicep:103 |
| 1.4 Bicep build validation | ✅ Complete | `az bicep build` passed (Phase 6 sweep per plan allowance) |

**Findings:**
- 🟡 Minor P1-M1: `diagnostics.bicep` existing() uses API `2024-03-01` — confirm it matches `containerAppsEnvironment.bicep` to avoid deployment warnings.
- ℹ️ Info P1-I1: Step 1.4 ran in Phase 6 sweep; plan explicitly permits this.

---

### Phase 2: Deployment Configuration — ✅ PASSED

All environment variable additions verified.

| Step | Status | Evidence |
|------|--------|----------|
| 2.1 APPLICATIONINSIGHTS_CONNECTION_STRING + OTEL vars in bootstrap-cd-environment.sh | ✅ Complete | Required variable enforced by `require_value`; OTEL_SAMPLING_RATIO optional per plan spec |
| 2.2 Three OTEL env vars in cd.yml containerapp update steps | ✅ Complete | Both update steps (line 572 and 749) include all three vars with `|| '1.0'` safe default |

**Findings:**
- ℹ️ Info P2-I1: `az containerapp create` path does not carry observability env vars. First-ever deployment starts unobserved until the CORS finalization `update` applies them. Outside plan scope but worth a follow-up item.

---

### Phase 3: Server Instrumentation — ✅ PASSED

All server instrumentation steps verified clean.

| Step | Status | Evidence |
|------|--------|----------|
| 3.1 @azure/monitor-opentelemetry in package.json | ✅ Complete | `"@azure/monitor-opentelemetry": "^1.19.0"` in production dependencies |
| 3.2 telemetry.ts --import loader | ✅ Complete | `useAzureMonitor()` guarded by connection string env var; sampling ratio clamped with safe fallback |
| 3.2a Register --import flag in start scripts and Dockerfile | ✅ Complete | `--import ./dist/telemetry.js` in both package.json start script and Dockerfile CMD |
| 3.3 /health DB readiness | ✅ Complete | `SELECT 1` against DB pool; returns 503 with `{ status: 'degraded' }` on failure |
| 3.4 writeLog trace correlation suffix | ✅ Complete | `traceId=… spanId=…` appended only when active span exists — format-preserving |
| 3.5 Server build/test validation | ✅ Complete | `npm run lint && npm run build && npm test` passed per changes log |

**Findings:**
- 🟡 Minor P3-M1: vitest does not preload telemetry loader — intentional isolation but worth documenting.
- ℹ️ Info P3-I1: `parseSamplingRatio` silently clamps out-of-range values without a startup log message.

---

### Phase 4: Client Instrumentation — ⚠️ PARTIAL

Step 4.1 and 4.3 passed. Step 4.2 partially meets the plan's success criterion.

| Step | Status | Evidence |
|------|--------|----------|
| 4.1 @opentelemetry/api in client package.json | ✅ Complete | `"@opentelemetry/api": "^1.9.1"` at apps/client/package.json:13 |
| 4.2 Replace console.log/error with structured telemetry | ⚠️ Partial | `emitSocketLifecycleTelemetry` helper replaces raw calls but routes to `console.info/error` only — not quilt event bus |
| 4.3 Client build/test validation | ✅ Complete | lint, build, and test passed per changes log |

**Findings:**
- 🟠 Major P4-F1: Telemetry routes to `console.info/console.error` only. The plan Derived Objective explicitly requires routing "through the existing quilt event bus." Socket lifecycle events will never reach Azure Monitor, server-side queries, or dashboards.
- 🟠 Major P4-F2: `@opentelemetry/api` is API-only. No browser OTel SDK is installed or initialized. `trace.getSpan(otelContext.active())` always returns `undefined` at runtime — correlation fields are never appended. The dependency contributes no runtime observability value.
- 🟡 Minor P4-M1: Step 4.3 validation not independently re-run.

---

### Phase 5: SLO Policy Artifact — ✅ PASSED

`docs/decisions/2026-08-03-observability-slo-policy.md` exists and meets all required content elements.

| Element | Status | Evidence |
|---------|--------|----------|
| Telemetry gates | ✅ Complete | Four pre-release gates defined (trace coverage, log correlation, health readiness, connection string deployment) |
| Trace/log coverage targets | ✅ Complete | ≥90% correlation, <1% pipeline drop, 15-minute diagnosability — matches research 90-day success signals |
| Cost guardrails | ✅ Complete | Retention policy and cost variance requirement present; specific budget threshold deferred as TBD |

**Findings:**
- 🟡 Minor P5-M1: Monthly ingestion cost threshold is `(TBD by platform owner)`. Acceptable deferral — research explicitly listed this as a follow-on modeling item.

---

### Phase 6: Validation — ✅ PASSED

All validation commands independently re-run and confirmed passing.

| Command | Status | Notes |
|---------|--------|-------|
| `apps/server npm run lint` | ✅ Passed | 1 pre-existing `no-unused-vars` warning in purge.postgres.integration.test.ts — unrelated to observability |
| `apps/client npm run lint` | ✅ Passed | Clean — no warnings or errors |
| `az bicep build --file infra/bicep/main.bicep` | ✅ Passed | Only output: informational Bicep CLI upgrade notice (v0.46.1) |
| Server/client build and test | Not re-run | Changes log attestation consistent with independently verified evidence |

**Findings:**
- 🟡 Minor P6-M1: Server/client build and full test suites not independently re-executed during review.
- ℹ️ Info P6-I1: Pre-existing `path` unused import in purge.postgres.integration.test.ts is unrelated but worth a cleanup follow-up.
- ℹ️ Info P6-I2: Bicep CLI upgrade notice (v0.46.1 available) — not a diagnostic, but CI/infra should track this.

---

## Implementation Quality Findings

See full log: [.copilot-tracking/reviews/2026-08-03/monitoring-observability-impl-quality.md]

| ID     | Severity | Category       | Summary |
|--------|----------|----------------|---------|
| IV-001 | 🟠 Major  | Security       | Log Analytics shared key exposed in Bicep deployment output — readable by any `deployments/read` principal |
| IV-002 | 🟠 Major  | Error Handling | `useAzureMonitor()` called without try/catch — SDK exception at preload crashes the server process |
| IV-003 | 🟠 Major  | Correctness    | socket.io `auth` callback not called when `acquireAccessToken` throws — handshake hangs indefinitely |
| IV-004 | 🟡 Minor  | Security/PII   | `req.ip` logged without redaction — IP addresses flow to Log Analytics unredacted |
| IV-005 | 🟡 Minor  | Correctness    | `/health` returns hardcoded `version: '0.0.0'` — not useful for incident correlation |
| IV-006 | ℹ️ Info   | Conventions    | `telemetry.ts` side-effect-on-import has no retry path — acceptable if IV-002 is fixed |
| IV-007 | ℹ️ Info   | Conventions    | `diagnostics.bicep` uses `last(split(...))` name extraction — correct; authoring-error-only risk |

---

## Validation Command Outputs

All commands run independently by Phase 6 RPI Validator:

* `apps/server npm run lint` — **PASSED** (1 pre-existing unrelated warning)
* `apps/client npm run lint` — **PASSED** (clean)
* `az bicep build --file infra/bicep/main.bicep` — **PASSED** (CLI upgrade notice only)

---

## Missing Work and Deviations

| ID    | Source     | Description |
|-------|------------|-------------|
| MW-01 | Phase 4    | Client socket lifecycle telemetry does not route through the quilt event bus — plan Derived Objective not fully met (P4-F1) |
| MW-02 | Phase 4    | `@opentelemetry/api` provides no runtime correlation value — no browser OTel SDK initialized (P4-F2, IV-003 related) |
| MW-03 | Quality    | `useAzureMonitor()` lacks error handling — server cannot survive SDK initialization failure (IV-002) |
| MW-04 | Quality    | socket.io auth callback gap — token acquisition throw causes silent connection hang (IV-003) |
| MW-05 | Security   | Bicep shared key output suppresses linter warning — PIM/access scope mitigation or design change needed (IV-001) |

---

## Follow-Up Work

### Deferred from Scope (plan-acknowledged)

* **FU-01**: Set monthly ingestion cost threshold in SLO policy once production workload data is available (P5-M1).
* **FU-02**: Confirm `az containerapp create` path gets observability env vars on first deployment (P2-I1).
* **FU-03**: Clean up pre-existing unused `path` import in `purge.postgres.integration.test.ts` (P6-I1).
* **FU-04**: Track Bicep CLI upgrade to v0.46.1 in CI/infra tooling (P6-I2).
* **FU-05**: Confirm `containerAppsEnvironment.bicep` API version matches diagnostics.bicep `existing()` reference (P1-M1).

### Discovered During Review

* **FU-06**: Route `emitSocketLifecycleTelemetry` through the quilt event bus (`socket.emit('canonical_telemetry', ...)` or `deliverTerminal` fallback) so lifecycle events reach Azure Monitor (P4-F1).
* **FU-07**: Decide: document `@opentelemetry/api` as a future stub in SLO policy, or add browser OTel SDK initialization to emit real trace context from the client (P4-F2).
* **FU-08**: Add try/catch around `useAzureMonitor()` in `telemetry.ts` so SDK initialization failures degrade gracefully rather than crashing on startup (IV-002).
* **FU-09**: Call `callback({})` in the socket.io `auth` catch block so `connect_error` fires when `acquireAccessToken` throws (IV-003).
* **FU-10**: Resolve Bicep shared key output: either invoke `listKeys()` inside `containerAppsEnvironment.bicep` directly or document and lock deployment-history access (IV-001).
* **FU-11**: Evaluate adding `\bip\b` to `SENSITIVE_KEY_PATTERN` in `redact.ts` or document IP logging as an explicit data processing decision in the SLO policy (IV-004).
* **FU-12**: Replace hardcoded `version: '0.0.0'` in `/health` with `process.env.npm_package_version` (IV-005).

---

## Overall Status

**⚠️ Needs Rework**

5 major findings require resolution before production:

* 2 RPI majors in Phase 4 — client telemetry routing incomplete and `@opentelemetry/api` has no runtime effect
* 3 implementation quality majors — SDK error handling missing, auth callback hang, shared key exposure

Phases 1, 2, 3, 5, and 6 are fully complete with only minor or informational findings.
