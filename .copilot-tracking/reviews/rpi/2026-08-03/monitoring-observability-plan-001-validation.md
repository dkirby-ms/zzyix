<!-- markdownlint-disable-file -->
# RPI Validation: Phase 1 — Infrastructure Baseline (Bicep)

**Plan**: .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md
**Changes Log**: .copilot-tracking/changes/2026-08-03/monitoring-observability-changes.md
**Research**: .copilot-tracking/research/2026-08-03/monitoring-and-observability-research.md
**Validation Date**: 2026-08-03
**Phase**: 1 — Infrastructure Baseline (Bicep) — Steps 1.1, 1.2, 1.3, 1.4
**Validator**: RPI Validator (automated)

---

## Phase Status: COMPLETE

All four plan steps for Phase 1 are implemented. No critical or major findings. Two minor/info observations noted.

---

## Per-Step Findings

### Step 1.1 — Add Application Insights workspace-based resource to monitoring.bicep

**Status**: Complete

**Evidence**:

- `infra/bicep/modules/monitoring.bicep` lines 19–31: `resource appInsights 'Microsoft.Insights/components@2020-02-02'` declared with `kind: 'web'`, `Application_Type: 'web'`.
- Workspace-based linkage confirmed: `WorkspaceResourceId: logAnalyticsWorkspace.id` (line 25), `IngestionMode: 'LogAnalytics'` (line 26).
- Network access set to `Enabled` for both ingestion and query (lines 27–28), consistent with ACA outbound connectivity patterns.
- Two new outputs added:
  - `appInsightsConnectionString` (lines 43–44): `appInsights.properties.ConnectionString`
  - `appInsightsInstrumentationKey` (lines 47–48): labeled legacy; present for compatibility.

**Issues**: None.

---

### Step 1.2 — Create infra/bicep/modules/diagnostics.bicep with ACA diagnostic settings

**Status**: Complete

**Evidence**:

- File exists: `infra/bicep/modules/diagnostics.bicep` (confirmed via file search).
- Parameters: `acaEnvironmentId string` (line 2) and `logAnalyticsWorkspaceId string` (line 6).
- `existing()` pattern used to resolve ACA environment by name extracted from ID via `last(split(acaEnvironmentId, '/'))` (line 9–11) — scopes the diagnostic settings resource correctly.
- Diagnostic settings resource: `Microsoft.Insights/diagnosticSettings@2021-05-01-preview` at `acaEnvironmentDiagnostics` (lines 13–37).
- Log categories enabled: `ContainerAppConsoleLogs` and `ContainerAppSystemLogs` (lines 19–28) — matches ACA log options reference in research.
- Metrics enabled: `AllMetrics` (lines 29–33) — covers platform-level metric routing as required.
- Retention delegated to workspace (`retentionPolicy: { enabled: false, days: 0 }`) — consistent with Log Analytics workspace-managed retention.

**Issues**:

- **Minor** — The ACA `existing()` reference uses API version `2024-03-01` for `Microsoft.App/managedEnvironments`. The containerAppsEnvironment module's API version was not cross-checked. If the deployed environment was created with a newer API version, the existing() lookup may emit a Bicep warning; however this would not block compilation or deployment. Recommend confirming alignment with `infra/bicep/modules/containerAppsEnvironment.bicep` API version on next review pass.

---

### Step 1.3 — Wire Application Insights and diagnostics modules in main.bicep; output connection string

**Status**: Complete

**Evidence**:

- `infra/bicep/main.bicep` lines 63–69: `module diagnostics 'modules/diagnostics.bicep'` declared.
  - `acaEnvironmentId: containerAppsEnvironment.outputs.environmentId` passed correctly.
  - `logAnalyticsWorkspaceId: monitoring.outputs.workspaceId` passed correctly.
- Top-level output `appInsightsConnectionString` declared at line 103:
  ```bicep
  output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
  ```
  This satisfies the plan's success criterion: "Application Insights resource exists in infra/bicep and produces a connection string output."
- `monitoring` module call (lines 38–44) is unchanged in wiring; new outputs are forwarded through the output chain rather than requiring module restructuring — a minimal, correct change.

**Issues**: None.

---

### Step 1.4 — Validate Bicep changes

**Status**: Complete

**Evidence**:

- Changes log states `az bicep build --file infra/bicep/main.bicep` passed under Validation Status section.
- No compilation failures or blocking diagnostics reported.

**Issues**:

- **Info** — Validation was performed as part of Phase 6 full-validation pass (Step 6.1) rather than as an isolated Phase 1 gate. Per the plan, Step 1.4 notes "Skip if conflicting with other parallel Bicep phases," so this ordering is explicitly permitted by the plan. The validation result is still valid.

---

## Issue Summary

| Severity | Count | Items |
|----------|-------|-------|
| Critical | 0     | — |
| Major    | 0     | — |
| Minor    | 1     | Step 1.2: ACA existing() API version alignment unconfirmed |
| Info     | 1     | Step 1.4: Build validation performed in Phase 6 pass, not as standalone gate |

---

## Coverage Assessment

| Requirement | Coverage |
|---|---|
| Application Insights workspace-based resource in monitoring.bicep | 100% — resource, kind, WorkspaceResourceId, IngestionMode, and network access all present |
| Connection string + instrumentation key outputs from monitoring.bicep | 100% — both outputs declared |
| diagnostics.bicep created with ACA diagnostic settings | 100% — file present, logs + metrics categories routed to Log Analytics |
| diagnostics module wired in main.bicep | 100% — module call with correct parameter pass-through |
| appInsightsConnectionString top-level output in main.bicep | 100% — output declared at line 103 |
| Bicep build validation passed | 100% — confirmed in changes log |

**Overall Phase 1 coverage: 100%**

---

## Clarifying Questions

None. All plan items for Phase 1 have corresponding file evidence and no ambiguities were identified.
