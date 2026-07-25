<!-- markdownlint-disable-file -->
# Task Review: Client Bundle Mitigation and Gate Closure

## Metadata

| Field              | Value                                                                                                         |
|--------------------|---------------------------------------------------------------------------------------------------------------|
| Review Date        | 2026-07-25                                                                                                    |
| Plan               | .copilot-tracking/plans/2026-07-25/client-bundle-mitigation-plan.instructions.md                             |
| Changes Log        | .copilot-tracking/changes/2026-07-25/client-bundle-mitigation-changes.md                                     |
| Research Document  | .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md                                   |
| Planning Log       | .copilot-tracking/plans/logs/2026-07-25/client-bundle-mitigation-log.md                                      |
| Impl Validation    | .copilot-tracking/reviews/impl/2026-07-25/client-bundle-mitigation-impl-validation.md                        |
| RPI Validations    | .copilot-tracking/reviews/rpi/2026-07-25/ (phases 001–004)                                                   |
| Overall Status     | ⚠️ Needs Rework                                                                                               |

## Severity Summary

| Severity | Count | Sources                                              |
|----------|-------|------------------------------------------------------|
| Critical | 0     | —                                                    |
| Major    | 2     | IV-001 (CSS tokens), IV-002 (ErrorBoundary missing)  |
| Minor    | 7     | 4 RPI traceability gaps + IV-003 (test coverage)     |

---

## Phase Validation Results

All four phases received a **PASS** verdict from RPI Validators. No major or critical RPI findings.
Minor findings are traceability and documentation gaps only.

### Phase 1 — Metric Baseline and Scope Confirmation: PASS

| Step | Status | Notes |
|------|--------|-------|
| 1.1 Capture baseline build totals and runtime import evidence | PASS | Byte counts, asset breakdown, and import paths recorded with commands cited |
| 1.2 Define implementation-time gate metric default | PASS | Raw-byte metric declared; thresholds set; DR-01 open tracking in place |
| 1.3 Validate phase changes (lint/test/build) | PASS | All three passed |

Minor findings:
* P1-M1: Observed baseline (1,588,100 bytes) diverges from inherited baseline (1,587,574 bytes) by +526 bytes with no explanation of source.
* P1-M2: Lint/test/build results reported post-implementation rather than as a Phase 1-scoped checkpoint, reducing per-phase traceability.

### Phase 2 — Low-Risk Runtime Surface Reduction: PASS

| Step | Status | Notes |
|------|--------|-------|
| 2.1 Remove unused toast runtime wiring | PASS | `Toast`/`Toaster` absent from `App.tsx` (confirmed); changes log confirms removal |
| 2.2 Execute WI-05 icon adapter A/B experiment | PASS | Both variants measured at 1,569,001 bytes; 0-byte delta documented |
| 2.3 Validate phase changes | PASS | Lint, 54 tests, build all passed |

Minor findings:
* P2-M1: Planning log reuses the WI-05 label for a new MosaicScene attribution task, creating naming ambiguity with the completed icon experiment.
* P2-M2: Step 2.3 validation reported as a combined Phase 2+3 pass rather than an isolated Phase 2 checkpoint.

### Phase 3 — Conditional Optimization Escalation: PASS

| Step | Status | Notes |
|------|--------|-------|
| 3.1 Narrow optional primitive runtime surface | PASS (analysis-only) | Import scan confirmed no optional wrappers in active paths; analysis-only outcome documented in DD-02 |
| 3.2 Apply lazy-loading boundary for canvas stack | PASS | `React.lazy` + `Suspense` implemented; `CanvasLoadingFallback` added; chunk split confirmed in build |

Minor findings:
* P3-M1: No scan artifact (e.g. grep output) preserved to independently corroborate the absence claim in Step 3.1.
* P3-M2: Async lazy idiom (`lazy(async () => …)`) noted vs standard `.then()` form — both are correct; no action required. Style note only.

### Phase 4 — Validation and Gate Reporting: PASS

| Step | Status | Notes |
|------|--------|-------|
| 4.1 Run full client validation | PASS | lint, tests, build all passed |
| 4.2 Compute raw and gzip-aware bundle deltas | PASS | Cumulative delta −18,573 bytes reported; gzip-aware output included |
| 4.3 Report unresolved blockers and follow-on actions | PASS | DR-01, DD-02, DD-03 all disclosed with rationale |
| 4.4 Produce deferred-scope summary artifact | PASS | Three deferred items with rationale and owners recorded in changes log |

Minor findings:
* P4-M1: Per-phase byte deltas (Phase 2 vs Phase 3 contribution) not individually recorded; only the cumulative −18,573-byte total is present. Research doc specifies "record per-phase delta and cumulative delta."
* P4-M2: Gate failure causal justification split across changes log and planning log; changes log alone does not fully explain why the threshold was unreachable.

### Success Criteria Validation

| Criterion | Met | Evidence |
|-----------|-----|----------|
| WI-05 experiment executed with reproducible build-delta evidence | Yes | Both variants at 1,569,001 bytes; 0-byte delta documented in changes log |
| Low-risk changes implemented before chunking escalation | Yes | Path A then Path C then Path B sequence followed as planned |
| Bundle gate outcome explicitly reported with metric and ambiguity tracked | Yes | DR-01 open, gate result documented with raw-byte metric |
| Deferred scope summarized with rationale and next owner | Yes | Three items with rationale and suggested owners in changes log |

---

## Implementation Quality Findings

Full report: `.copilot-tracking/reviews/impl/2026-07-25/client-bundle-mitigation-impl-validation.md`

### IV-001 — Undefined CSS Custom Properties [Major]

`CanvasLoadingFallback.css` references four CSS custom properties that do not exist in the design token system. Each silently falls back to its CSS initial value, making the loading fallback render as a transparent/unstyled block with a non-functional spinner in all environments.

| Property used      | Defined? | Visible effect               | Correct token             |
|--------------------|----------|------------------------------|---------------------------|
| `--radius-xl`      | No       | Hard corners                 | `--radius-component`      |
| `--color-surface`  | No       | Invisible background         | `--color-surface-primary` |
| `--color-text-muted` | No     | Unintended text/spinner color| `--color-feedback-muted`  |
| `--color-brand`    | No       | Invisible spinner accent     | `--color-accent-primary`  |

Note: `--color-border-subtle` is correctly used.

**Fix**: Replace the four property names with their correct semantic tokens. Local fix only; no structural changes needed.

### IV-002 — No ErrorBoundary Paired with Suspense [Major]

The `Suspense` boundary at `App.tsx` line 971 has no paired `ErrorBoundary`. Dynamic import failures (chunk load errors, network flakiness, partial deployments) propagate to React's root, unmounting the entire application. No `ErrorBoundary` exists anywhere in the codebase.

**Fix**: Wrap the `Suspense` boundary with a React `ErrorBoundary` rendering a recoverable error state with a retry affordance.

### IV-003 — No Test Coverage for CanvasLoadingFallback [Minor]

`CanvasLoadingFallback` is a new presentational component with zero test coverage. Given the CSS token defect above, a smoke render test would catch regressions in markup structure and ARIA attribute presence.

**Positive findings**: React.lazy async wrapper is correct for the named export; Suspense placement is architecturally sound; accessibility attributes (`role="status"`, `aria-live="polite"`, `aria-hidden="true"`) are correct; TypeScript reports no errors; no OWASP concerns introduced.

---

## Validation Commands

| Command | Status | Output |
|---------|--------|--------|
| `npm run lint --workspace=apps/client` | PASS | `oxlint` — no errors or warnings |
| `npm run test --workspace=apps/client -- --run` | PASS | 54 tests passed |
| `npm run build --workspace=apps/client` | PASS | Chunks emitted as expected; size warning for MosaicScene chunk (>500 kB after minification — expected, pre-existing) |

Build output after implementation:

| Asset | Raw | Gzip |
|-------|-----|------|
| `index-CNS0gPrd.js` (initial route) | 533.43 kB | 163.67 kB |
| `MosaicScene-MCBM82wc.js` (deferred) | 1,021.24 kB | 273.01 kB |
| `index-kmlmpeOW.css` | 14.32 kB | 3.81 kB |

Bundle delta:
* Inherited baseline: 1,587,574 bytes raw total
* Final total after implementation: 1,569,001 bytes raw total
* Net delta: **−18,573 bytes**
* Interim pass target (−100,000 bytes): **not met** — disclosed in changes log

---

## Missing Work and Deviations

| ID    | Type      | Description                                                                                   | Severity |
|-------|-----------|-----------------------------------------------------------------------------------------------|----------|
| DD-02 | Deviation | Phase 3.1 executed as analysis-only; no source edits made (optional primitives not in active import paths) | Documented, justified |
| DD-03 | Deviation | Interim mitigation byte target not met (−18,573 vs. −100,000 required)                        | Documented, justified |
| DR-01 | Open Item | Bundle gate metric contract (raw/gzip/initial-route) remains ambiguous; stakeholder clarification needed | Open |
| IV-001 | Missing   | CSS tokens in `CanvasLoadingFallback.css` are incorrect — component renders broken in all envs | Major |
| IV-002 | Missing   | No ErrorBoundary for `Suspense` boundary — chunk load failure crashes entire app               | Major |

---

## Follow-Up Recommendations

### Deferred from Scope (from changes log)

* Define canonical gate metric contract (raw/gzip/initial-route). Owner: product/engineering lead for performance governance.
* Add CI budget enforcement once metric contract is finalized. Owner: build/release engineering.
* Perform package-attribution run for `MosaicScene` chunk to identify next low-risk reductions. Owner: client performance maintainer.

### Discovered During Review (new items)

* **[High] Fix IV-001**: Correct the four undefined CSS tokens in `CanvasLoadingFallback.css` (`--radius-xl` → `--radius-component`, `--color-surface` → `--color-surface-primary`, `--color-text-muted` → `--color-feedback-muted`, `--color-brand` → `--color-accent-primary`).
* **[High] Fix IV-002**: Add a React `ErrorBoundary` wrapping the `Suspense` boundary in `App.tsx` to handle chunk load failures gracefully.
* **[Low] Add IV-003**: Add a minimal render test for `CanvasLoadingFallback` asserting `role="status"` is present and `aria-hidden` is set on the spinner span.
* **[Low] Hygiene P4-M1**: Record per-phase byte deltas in future implementation cycles (not just cumulative delta) per research doc measurement guidance.
* **[Low] Hygiene P2-M1**: Rename the new MosaicScene attribution follow-on work item from WI-05 to WI-06 (or similar) to avoid label collision with the completed icon adapter experiment.

---

## Reviewer Notes

The core implementation is mechanically correct and architecturally sound. The lazy boundary placement, named-export handling, and accessibility attributes are all right. The two major findings (IV-001, IV-002) are local and self-contained — both require only targeted edits with no structural rework. Neither affects the validity of the bundle-split itself.

The interim gate miss (−18,573 bytes vs. −100,000 bytes target) is properly disclosed and justified. The initial-route payload improvement from the chunk split is material even though total raw output was not reduced enough to clear the raw-byte threshold. DR-01 (metric contract ambiguity) is the root cause and remains correctly tracked as open.

Recommend resolving IV-001 and IV-002 before merging this branch.
