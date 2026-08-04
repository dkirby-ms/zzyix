<!-- markdownlint-disable-file -->
# RPI Validation: Phase 4 — Client Instrumentation

**Plan**: .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md
**Changes Log**: .copilot-tracking/changes/2026-08-03/monitoring-observability-changes.md
**Research Document**: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md
**Phase**: 4 — Client Instrumentation (Steps 4.1, 4.2, 4.3)
**Validated**: 2026-08-03
**Overall Status**: Partial

---

## Phase 4 Plan Requirements

| Step | Requirement | Status |
|------|-------------|--------|
| 4.1 | Add `@opentelemetry/api` dependency to `apps/client/package.json` | Passed |
| 4.2 | Replace console.log/error socket lifecycle calls in `useSocketConnection.ts` with structured telemetry | Partial |
| 4.3 | Validate client build and tests | Passed |

---

## Step 4.1 — Dependency Addition

**Finding**: PASSED

- **Evidence**: `apps/client/package.json` line 13: `"@opentelemetry/api": "^1.9.1"` is present in `dependencies`.
- **Changes log match**: "apps/client/package.json — Added `@opentelemetry/api` dependency." (Changes, Modified section)
- No deviation from plan.

---

## Step 4.2 — Replace console.log/error with Structured Telemetry

**Finding**: PARTIAL — plan success criterion met at surface level; two substantive deviations from Derived Objectives.

### What Was Implemented

A `emitSocketLifecycleTelemetry` helper was added at `apps/client/src/network/useSocketConnection.ts` lines 23–46:

```typescript
const emitSocketLifecycleTelemetry = (
  event: string,
  payload: Record<string, unknown>,
  level: SocketTelemetryLevel = 'info',
): void => {
  const spanContext = trace.getSpan(otelContext.active())?.spanContext()
  const telemetryEvent: Record<string, unknown> = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  }
  if (spanContext) {
    telemetryEvent.traceId = spanContext.traceId
    telemetryEvent.spanId = spanContext.spanId
  }
  if (level === 'error') {
    console.error('[socket_lifecycle]', telemetryEvent)
    return
  }
  console.info('[socket_lifecycle]', telemetryEvent)
}
```

The helper is invoked at three socket lifecycle points:

- `socket.on('connect', ...)` → `emitSocketLifecycleTelemetry('socket_connected', { quiltId, socketId, connectionEpoch })` — line ~183
- `socket.on('connect_error', ...)` → `emitSocketLifecycleTelemetry('socket_connect_error', { quiltId, code, message }, 'error')` — line ~191
- `socket.on('disconnect', ...)` → `emitSocketLifecycleTelemetry('socket_disconnected', { quiltId, reason })` — line ~210

No raw `console.log` calls remain in `useSocketConnection.ts`. The only `console.*` calls present are the `console.error` (line 42) and `console.info` (line 46) inside the helper itself.

### Positive Evidence

- Raw ad-hoc `console.log` call sites are eliminated. ✅
- Structured payload enforced: `event`, `timestamp`, spread `payload`. ✅
- `[socket_lifecycle]` prefix tag enables log filtering. ✅
- All three primary socket lifecycle events (connected, connect_error, disconnect) are covered. ✅
- Typed `SocketTelemetryLevel` separates info vs error paths. ✅

---

### Finding 1 (Major): Telemetry Does Not Route to Any Observability Backend

**Severity**: Major

**Description**: The plan Derived Objective for Phase 4 states:

> "Replace `console.*` client lifecycle logs with structured telemetry routed through the existing quilt event bus"
> — `monitoring-observability-plan.instructions.md`, Derived Objectives

The implementation routes through `console.info` / `console.error` only. Events are written to the browser's DevTools console and are not transmitted to the server, Azure Monitor, or any observability backend. The quilt event bus (`socket.emit('canonical_telemetry', ...)`) — which the server already ingests and can forward to Azure Monitor — is not used.

**Impact**: Client socket lifecycle events will not appear in Azure Monitor queries, dashboards, or SLO data. The primary value of the instrumentation — surfacing connection failures and lifecycle patterns in the observability backend — is not achieved. A `connect_error` event that should trigger an alert trace will silently disappear when the browser tab is closed.

**Evidence**:
- Helper implementation: `apps/client/src/network/useSocketConnection.ts` lines 42, 46 (`console.error`, `console.info`)
- Quilt event bus not used: no `socket.emit('canonical_telemetry', ...)` call within `emitSocketLifecycleTelemetry`
- Research requirement: `.copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md`, Actionable Step 4 — "Replace runtime console lifecycle logs with structured telemetry and correlation metadata."
- Plan Derived Objective: "routed through the existing quilt event bus" (plan file, Derived Objectives section)

**Recommended Remediation**: Route through `socket.emit('canonical_telemetry', ...)` (or the `deliverTerminal` fallback that is already present in the file) instead of or in addition to `console.info/console.error`. The `deliverTerminal` function already handles the offline case with a `fetch` fallback.

---

### Finding 2 (Major): OTel Span Context Enrichment Is Inert Without Browser SDK

**Severity**: Major

**Description**: The helper imports `context` and `trace` from `@opentelemetry/api` and calls `trace.getSpan(otelContext.active())` to obtain span context for trace correlation enrichment. The `@opentelemetry/api` package is API-only — it defines the surface but relies on a registered SDK provider for actual context propagation. No browser OTel SDK (e.g. `@opentelemetry/sdk-web`, `@opentelemetry/sdk-trace-web`) is installed or initialized anywhere in the client codebase. Without a registered provider, `trace.getSpan(otelContext.active())` returns `undefined` at runtime; the `if (spanContext)` guard means `traceId` and `spanId` are never appended to any event.

**Impact**: The OTel trace correlation fields advertised by the implementation are inert in all deployed environments. The `@opentelemetry/api` dependency contributes no observable value to runtime telemetry without a corresponding SDK provider registration.

**Evidence**:
- Import: `apps/client/src/network/useSocketConnection.ts` lines 2–3 — `import { context as otelContext, trace } from '@opentelemetry/api'`
- Span context guard: lines 28–32 — `const spanContext = trace.getSpan(otelContext.active())?.spanContext()`; fields only appended `if (spanContext)`
- No browser OTel SDK added: `apps/client/package.json` contains `@opentelemetry/api` only; no `@opentelemetry/sdk-web`, `@opentelemetry/sdk-trace-web`, or equivalent
- No OTel provider registration found in `apps/client/src/**` (grep confirms no `TracerProvider`, `WebTracerProvider`, or `registerInstrumentations`)

**Recommended Remediation**: Either (a) accept that span context enrichment is a future capability stub and document it as such, or (b) install and initialize a browser OTel SDK (e.g. in `apps/client/src/main.tsx`) before the app mounts.

---

### Finding 3 (Minor): console.error Retained Inside Helper

**Severity**: Minor

**Description**: The plan success criterion states "console.log/error calls are replaced with structured telemetry." The helper itself still calls `console.error` (line 42) and `console.info` (line 46). This is expected for a browser-local logging helper and is not a blocking concern, but `console.error` was not eliminated — it was moved behind indirection. The changes log correctly describes this as replacement "via helper," which accurately characterizes the change.

**Evidence**: `apps/client/src/network/useSocketConnection.ts` lines 42 (`console.error`), 46 (`console.info`)

**Note**: This is consistent with the changes log description and does not represent a regression.

---

## Step 4.3 — Client Build and Test Validation

**Finding**: PASSED (per changes log self-report)

- Changes log states: "`cd apps/client && npm run lint && npm run build && npm test` passed" (Validation Status section)
- Additional log note: "Client build reported existing Vite chunk-size warnings and a config-native compatibility warning for `__dirname` usage in `apps/client/vite.config.ts` — pre-existing, did not block build/test."
- No new lint errors attributable to Phase 4 changes were reported.

Independent verification of build/test execution was not performed by this validation pass; finding is based on changes log evidence.

---

## Coverage Assessment

| Plan Item | Implemented | Evidence Quality |
|-----------|-------------|-----------------|
| 4.1 — @opentelemetry/api in package.json | Yes | Strong — file confirmed |
| 4.2 — console.log calls replaced | Yes (partial) | Strong — no raw console.log remains; structured helper in place; but routing deviates from Derived Objective |
| 4.2 — Routing through quilt event bus | No | Strong — console.info/error only; no socket.emit or deliverTerminal in helper |
| 4.2 — OTel trace correlation functional | No | Strong — no browser SDK registered; span context always undefined |
| 4.3 — Client build and tests pass | Yes (per report) | Moderate — self-reported in changes log |

---

## Findings Summary

| ID | Severity | Step | Summary |
|----|----------|------|---------|
| F1 | Major | 4.2 | Telemetry events routed to console only; quilt event bus not used; events never reach any observability backend |
| F2 | Major | 4.2 | `@opentelemetry/api` span context enrichment is inert at runtime; no browser OTel SDK registered |
| F3 | Minor | 4.2 | `console.error` retained inside helper; not a regression but `console.error` not eliminated |

**Severity counts**: Critical 0 · Major 2 · Minor 1 · Info 0

---

## Clarifying Questions

1. **Intended routing**: Was routing through the browser console (`console.info/console.error`) intentional, with the quilt event bus deferred to a follow-on item? Or was the quilt event bus routing inadvertently omitted?
2. **Browser OTel SDK**: Is the `@opentelemetry/api` usage intended as a stub for future SDK initialization, or was a browser SDK initialization step expected as part of this phase?
3. **deliverTerminal reuse**: Was `deliverTerminal` (the offline-safe `socket.emit` + `fetch` fallback already in the file) considered as the implementation vehicle for the structured lifecycle events?

---

## Recommended Next Steps (Not Completed in This Session)

- [ ] Verify that `emitSocketLifecycleTelemetry` can be refactored to call `deliverTerminal` (or `socket.emit('canonical_telemetry', ...)`) so events reach the server-side ingestion path.
- [ ] Evaluate whether a browser OTel SDK initialization (e.g. in `main.tsx`) is in scope, or document the `@opentelemetry/api` enrichment as a deferred capability in the SLO policy.
- [ ] Confirm client build validation independently (re-run `cd apps/client && npm run lint && npm run build && npm test`).
- [ ] Validate Phase 5 (SLO Policy Artifact) and Phase 6 (Full Validation) separately.
