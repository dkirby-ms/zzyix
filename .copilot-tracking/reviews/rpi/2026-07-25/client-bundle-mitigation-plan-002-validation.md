<!-- markdownlint-disable-file -->
# RPI Validation: Phase 2 — Low-Risk Runtime Surface Reduction

**Plan**: client-bundle-mitigation-plan.instructions.md
**Changes log**: client-bundle-mitigation-changes.md
**Research document**: client-bundle-mitigation-research.md
**Phase**: 2
**Validated**: 2026-07-25

---

## Phase Status: PASS

All three phase steps are confirmed implemented and validated. No critical or major findings. One minor documentation note recorded.

---

## Step Results

### Step 2.1: Remove unused toast runtime wiring

- **Status**: PASS
- **Evidence**:
  - Changes log, Implementation Outcomes → Phase 2 and Phase 3 Mitigations: "Removed app-root toast runtime wiring from `apps/client/src/App.tsx`."
  - Changes log, Modified list: "`apps/client/src/App.tsx` - Removed root toast provider wiring and introduced `React.lazy` + `Suspense` split for `MosaicScene`."
  - File verification: `grep` for `Toast`, `toast`, or `Toaster` in `apps/client/src/App.tsx` returns no matches, confirming the import and runtime wiring are absent from the live file.
- **Findings**:
  - None.

---

### Step 2.2: Execute WI-05 icon adapter A/B experiment

- **Status**: PASS
- **Evidence**:
  - Changes log, Implementation Outcomes → Phase 2 and Phase 3 Mitigations:
    - "Variant A (normal adapter): total raw bytes 1569001"
    - "Variant B (adapter detached from `lucide-react`): total raw bytes 1569001"
    - "Experiment result: 0-byte delta, icon adapter currently non-contributor."
  - The experiment directly fulfills WI-05 by producing a quantified, auditable before/after measurement.
- **Findings**:
  - **Minor**: The experiment result (0-byte delta) is documented in the changes log but no corresponding checklist annotation appears in the plan or planning log explicitly closing WI-05. The plan item is marked `[x]` complete, but the planning log's Suggested Follow-On Work section still lists WI-05 as "Perform package-attribution run (visualizer/rollup stats) for `MosaicScene` chunk" — which redefines WI-05 from the original icon-adapter experiment into a new scope. This creates a naming ambiguity in the planning artifact but does not affect the completeness of the icon A/B experiment itself.

---

### Step 2.3: Validate phase changes

- **Status**: PASS
- **Evidence**:
  - Changes log, Validation Status:
    - "`npm run lint --workspace=apps/client` — passed"
    - "`npm run test --workspace=apps/client -- --run` — passed (54 tests)"
    - "`npm run build --workspace=apps/client` — passed"
- **Findings**:
  - **Minor**: The changes log does not distinguish between a Phase 2-only validation pass and the combined Phase 2+3 validation pass. Lint, test, and build results are reported once for the full implementation rather than per-phase. This is consistent with efficient practice but slightly reduces traceability for Phase 2 specifically.

---

## Research Alignment

Research document Path A (Lines 40-50, Candidate Implementation Paths → Path A) specifies:

1. *"Remove app-root toast runtime plumbing if no active toast flow exists."*
   - Step 2.1 satisfies this directly. Toast import and wiring are confirmed absent from `App.tsx`.

2. *"Keep tooltip path because it is actively used in status error detail UX."*
   - Not explicitly confirmed in the changes log, but no tooltip removal is recorded in the Added/Modified/Removed sections. The Tooltip import remains out of scope for Phase 2 removal, consistent with the research constraint.

3. *"Run WI-05 experiment by comparing build totals with and without icon adapter dependency surface."*
   - Step 2.2 satisfies this directly. Both variants were built and measured; the 0-byte delta result is documented.

Research document Path A risk profile states *"Low functional risk, low migration cost, expected byte reduction may be modest."* The changes log confirms this expectation held: the net reduction attributable to Phase 2 specifically (toast removal) is modest and consistent with the research estimate. No functional regressions were recorded.

Research Alignment: **Satisfied**.

---

## Phase Findings Summary

| Severity | Count | Items |
|----------|-------|-------|
| Critical | 0     | —     |
| Major    | 0     | —     |
| Minor    | 2     | WI-05 label reuse in planning log creates naming ambiguity; combined validation pass reduces per-phase traceability |

---

## Recommended Next Validations

- [ ] Validate Phase 1 against plan checklist (baseline capture and metric default confirmation).
- [ ] Validate Phase 3 against plan checklist (primitive surface scan execution and lazy-loading boundary implementation).
- [ ] Validate Phase 4 against plan checklist (full validation run, delta reporting, deferred scope artifact).
- [ ] Confirm Tooltip import retention in `App.tsx` against research Path A constraint (active-use justification).
- [ ] Confirm WI-05 naming in the planning log is intentionally redefined or should be relabeled to avoid confusion with the completed icon adapter experiment.

---

## Clarifying Questions

1. **WI-05 redefinition**: The planning log's Suggested Follow-On Work section lists WI-05 as a new MosaicScene attribution run, while the original plan uses WI-05 for the icon adapter experiment. Was this intentional renaming, or should a new WI number be assigned to the MosaicScene attribution task?
2. **Per-phase validation gates**: Is a combined lint/test/build pass (covering all phases together) acceptable for Step 2.3, or does the plan require an isolated Phase 2-only validation checkpoint before Phase 3 changes are applied?
