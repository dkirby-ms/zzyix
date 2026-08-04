<!-- markdownlint-disable-file -->
# Implementation Quality: Monitoring and Observability

## Metadata

| Field | Value |
|---|---|
| **Validation Date** | 2026-08-03 |
| **Scope** | Security, Correctness, Error Handling, Type Safety, Conventions |
| **Status** | Needs Rework — 3 Major, 2 Minor, 2 Info |
| **Files Assessed** | apps/server/src/telemetry.ts, apps/server/src/index.ts (/health + writeLog), apps/client/src/network/useSocketConnection.ts, infra/bicep/modules/diagnostics.bicep, infra/bicep/modules/monitoring.bicep |

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| Major | 3 |
| Minor | 2 |
| Info | 2 |

No critical issues identified. Three major issues require resolution before production: Azure Monitor SDK called without error handling, socket.io auth callback can hang if token acquisition throws, and Log Analytics shared key exposed in Bicep deployment outputs. Two minor issues concern IP address logging without redaction and a hardcoded health endpoint version.

---

## Security

### IV-001 [Major] Log Analytics shared key exposed in Bicep output

`monitoring.bicep` outputs the workspace primary shared key with `#disable-next-line outputs-should-not-contain-secrets` suppressing the linter. ARM deployment outputs are stored in the resource group's deployment history and are readable by any identity with `Microsoft.Resources/deployments/read` — a broader access set than explicit secret consumers.

**Evidence:** `infra/bicep/modules/monitoring.bicep` Lines 36–41

```bicep
#disable-next-line outputs-should-not-contain-secrets
output sharedKey string = logAnalyticsWorkspace.listKeys().primarySharedKey
```

**Recommendation:** Remove the `sharedKey` output from `monitoring.bicep` and invoke `listKeys()` directly inside `containerAppsEnvironment.bicep`, keeping the key out of the parent output chain. Alternatively, document and lock deployment-history read access to the deployment service principal only.

---

## Error Handling

### IV-002 [Major] `useAzureMonitor()` called at module scope without error handling

`telemetry.ts` calls `useAzureMonitor()` as a module-level side effect with no try/catch. An unhandled exception crashes the Node.js process before `index.ts` starts, preventing server startup.

**Evidence:** `apps/server/src/telemetry.ts` Lines 20–26

**Recommendation:**

```typescript
try {
  useAzureMonitor({ ... })
} catch (error) {
  console.error('[telemetry] Azure Monitor initialization failed; continuing without telemetry', error)
}
```

---

## Correctness

### IV-003 [Major] socket.io `auth` callback never invoked when `acquireAccessToken` throws

When `acquireAccessToken()` throws, the catch block calls `onAuthLoss` but returns without calling `callback()`. The socket handshake hangs indefinitely rather than advancing to `connect_error`.

**Evidence:** `apps/client/src/network/useSocketConnection.ts` Lines 84–101

**Recommendation:** Call `callback({})` in the catch block after `onAuthLoss` so socket.io emits `connect_error`.

---

### IV-004 [Minor] `req.ip` is logged as PII without redaction

`SENSITIVE_KEY_PATTERN` in `redact.ts` does not match the key `ip`. Client IP addresses flow into Log Analytics unredacted.

**Evidence:** `apps/server/src/index.ts` Lines 907–927; `apps/server/src/logging/redact.ts` Line 1

**Recommendation:** Add `\bip\b` to `SENSITIVE_KEY_PATTERN`, remove `ip` from log context, or document IP logging as an explicit decision in the SLO policy.

---

### IV-005 [Minor] `/health` returns hardcoded `version: '0.0.0'`

Hardcoded version is not useful for correlating responses during incidents or mixed-replica rollouts.

**Evidence:** `apps/server/src/index.ts` Lines 929–943

**Recommendation:** Use `process.env.npm_package_version ?? '0.0.0'` or a build-time `VERSION` env var.

---

## Conventions (Info)

### IV-006 [Info] `telemetry.ts` side-effect-on-import pattern has no retry path

Idiomatic for OTel preloads and consistent with `--import` startup contract. No structural concern. Acceptable if IV-002 is addressed.

### IV-007 [Info] `diagnostics.bicep` uses `last(split(...))` to resolve resource name

Correct and works with well-formed ARM resource IDs. Risk is limited to parameter authoring error and cannot occur at runtime.

---

## Confirmed Quality

* `parseSamplingRatio` correctly clamps NaN, negative, and >1 values.
* `writeLog` trace suffix injection is gated on `trace.getActiveSpan()?.spanContext()` — no-ops cleanly with no active span.
* `emitSocketLifecycleTelemetry` is typed and routes error-level events to `console.error`.
* `diagnostics.bicep` correctly uses `existing` scope and routes both console/system logs plus AllMetrics.
* No hardcoded secrets or credentials found in any changed file.
* TypeScript types used correctly throughout; no new type errors introduced.
* Dockerfile and `package.json` start scripts align correctly with `--import ./dist/telemetry.js`.
