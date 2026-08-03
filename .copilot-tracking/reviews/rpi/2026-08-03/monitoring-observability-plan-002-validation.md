# RPI Validation: Monitoring and Observability — Phase 2

**Plan**: .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md  
**Changes Log**: .copilot-tracking/changes/2026-08-03/monitoring-observability-changes.md  
**Research**: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md  
**Phase**: 2 — Deployment Configuration (Steps 2.1, 2.2)  
**Validation Date**: 2026-08-03  
**Status**: PASSED

---

## Phase Requirements

| Step | Requirement | Status |
|------|-------------|--------|
| 2.1 | Add `APPLICATIONINSIGHTS_CONNECTION_STRING` and OTEL env vars to `scripts/bootstrap-cd-environment.sh` | ✅ Complete |
| 2.2 | Add `APPLICATIONINSIGHTS_CONNECTION_STRING`, `OTEL_SERVICE_NAME`, and `OTEL_SAMPLING_RATIO` to both server `az containerapp update` steps in `.github/workflows/cd.yml` | ✅ Complete |

---

## Step 2.1 Findings: scripts/bootstrap-cd-environment.sh

**Evidence file**: scripts/bootstrap-cd-environment.sh

### Plan Item: APPLICATIONINSIGHTS_CONNECTION_STRING in required variables list

**Plan spec** (details lines 131–165): Add to `usage()` required environment variables list and to the section the script reads/sets.

**Verified**:

- Line ~45 (usage block): `APPLICATIONINSIGHTS_CONNECTION_STRING` present in "Required environment variables" list. ✅
- Line ~281 (main()): `require_value "APPLICATIONINSIGHTS_CONNECTION_STRING"` enforces presence at runtime. ✅
- Lines ~321–322 (main()): `set_environment_variable ... "APPLICATIONINSIGHTS_CONNECTION_STRING" "${APPLICATIONINSIGHTS_CONNECTION_STRING}"` provisions it to the GitHub Environment. ✅

### Plan Item: OTEL env vars

**Plan spec**: "OTEL env vars" in checklist; details spec names `OTEL_SAMPLING_RATIO` as the operator-provisioned optional variable (`OTEL_SERVICE_NAME` is hardcoded in cd.yml and does not require bootstrap provisioning).

**Verified**:

- Lines ~49–51 (usage block): `OTEL_SAMPLING_RATIO` listed in "Optional environment variables". ✅
- Lines ~323–325 (main()): Conditional `set_environment_variable` for `OTEL_SAMPLING_RATIO` — provisioned only when set by operator. ✅

### Step 2.1 Summary

All specified items implemented. No issues found.

---

## Step 2.2 Findings: .github/workflows/cd.yml

**Evidence file**: .github/workflows/cd.yml

The plan details identified two `az containerapp update` invocations for the server: an initial deploy step (~line 568) and a CORS finalization step (~line 746). Both must carry the three observability variables.

### First az containerapp update (initial deploy, line 572)

```
"APPLICATIONINSIGHTS_CONNECTION_STRING=${{ vars.APPLICATIONINSIGHTS_CONNECTION_STRING }}"
"OTEL_SERVICE_NAME=zzyix-server"
"OTEL_SAMPLING_RATIO=${{ vars.OTEL_SAMPLING_RATIO || '1.0' }}"
```

- `APPLICATIONINSIGHTS_CONNECTION_STRING` — present, sourced from `vars.` (GitHub Environment variable, not a secret). ✅
- `OTEL_SERVICE_NAME=zzyix-server` — present, hardcoded as specified. ✅
- `OTEL_SAMPLING_RATIO` — present, uses `|| '1.0'` default fallback, making the operator-set var genuinely optional. ✅

### Second az containerapp update (CORS finalization, line 749)

```
"APPLICATIONINSIGHTS_CONNECTION_STRING=${{ vars.APPLICATIONINSIGHTS_CONNECTION_STRING }}"
"OTEL_SERVICE_NAME=zzyix-server"
"OTEL_SAMPLING_RATIO=${{ vars.OTEL_SAMPLING_RATIO || '1.0' }}"
```

- `APPLICATIONINSIGHTS_CONNECTION_STRING` — present. ✅
- `OTEL_SERVICE_NAME=zzyix-server` — present. ✅
- `OTEL_SAMPLING_RATIO` — present with fallback. ✅

### OTEL_SAMPLING_RATIO: Optional vs Required

The variable is correctly implemented as **optional** at the operator level:
- bootstrap-cd-environment.sh lists it as optional and provisions it only when set.
- cd.yml applies `|| '1.0'` as a safe default (full sampling), so no configuration is required to get functional telemetry.
- This matches the planning log note (line 44): "operator can override at deploy time."

### Step 2.2 Summary

Both `az containerapp update` server steps include all three required variables with correct values and sourcing.

---

## Findings Registry

| ID | Severity | Step | Description |
|----|----------|------|-------------|
| F-001 | Info | 2.2 | The `az containerapp create` path (line ~588) does **not** include the three observability env vars. The plan spec covered only `update` steps, so this is outside plan scope. On a first-ever deployment (create path), the container app would start without observability configuration until the subsequent CORS finalization `update` runs and sets them. This is a minor operational gap but not a plan violation. |

---

## Coverage Assessment

- **Step 2.1**: 100% — all required items (required var list, `require_value` call, `set_environment_variable` call, optional OTEL_SAMPLING_RATIO conditional) are present and correctly placed.
- **Step 2.2**: 100% of plan-specified targets — both `az containerapp update` steps carry all three env vars with correct syntax, sourcing, and defaults.

**Overall Phase 2 Coverage**: Complete. No plan items are missing.

---

## Clarifying Questions

None. All plan requirements were verifiable from available context.

---

## Recommended Next Validations

- [ ] **Phase 1 (Infrastructure Baseline)** — Validate infra/bicep/modules/monitoring.bicep Application Insights resource, infra/bicep/modules/diagnostics.bicep creation, and main.bicep wiring/output.
- [ ] **Phase 3 (Server Instrumentation)** — Validate telemetry.ts loader, `--import` flag in package.json and Dockerfile, writeLog trace correlation suffix, and /health DB readiness upgrade.
- [ ] **Phase 4 (Client Instrumentation)** — Validate useSocketConnection.ts console.log/error replacement.
- [ ] **Phase 5 (SLO Policy Artifact)** — Validate docs/decisions/2026-08-03-observability-slo-policy.md content against research requirements.
- [ ] **Operational gap F-001** — Confirm whether the `az containerapp create` path should also receive observability env vars; if so, raise a follow-on plan item.
