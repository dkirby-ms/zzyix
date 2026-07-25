<!-- markdownlint-disable-file -->
# Implementation Details: Client Bundle Mitigation and Gate Closure

## Context Reference

Sources: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md, .copilot-tracking/research/subagents/2026-07-25/client-bundle-mitigation-research.md, and .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md.

## Implementation Phase 1: Metric Baseline and Scope Confirmation

<!-- parallelizable: false -->

### Step 1.1: Capture baseline build totals and dependency usage

Collect current client bundle totals and import-path evidence before code changes.

Files:
* apps/client/package.json - Validate scripts and dependency set
* apps/client/vite.config.ts - Confirm build/chunk settings
* apps/client/src/App.tsx - Confirm runtime primitive wiring and render-path imports
* apps/client/src/render/MosaicScene.tsx - Confirm heavy 3D imports

Success criteria:
* Baseline raw total bytes and file-level sizes are recorded in the changes log during implementation.
* Runtime primitive and icon import usage is documented.

Context references:
* .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 14-26) - Baseline evidence

Dependencies:
* None

### Step 1.2: Define implementation-time metric default

Use total raw dist asset bytes as temporary acceptance metric when owner clarification is unavailable, and apply explicit thresholds for this implementation cycle.

Files:
* .copilot-tracking/plans/logs/2026-07-25/client-bundle-mitigation-log.md - Maintain DR-01 and DD-01 visibility

Discrepancy references:
* DR-01

Success criteria:
* Metric default is explicit before change execution.
* Baseline and thresholds are explicit before code changes:
	* Baseline total assets: 1587574 bytes
	* Interim pass target: reduce by at least 100000 bytes from baseline
	* Final inherited gate: <= 30000 byte delta against pre-UX baseline
* Metric ambiguity remains tracked as an open item.

Dependencies:
* Step 1.1 completion

### Step 1.3: Validate phase changes

Validation commands:
* npm run lint --workspace=apps/client
* npm run test --workspace=apps/client -- --run
* npm run build --workspace=apps/client

## Implementation Phase 2: Low-Risk Runtime Surface Reduction

<!-- parallelizable: false -->

### Step 2.1: Remove unused toast runtime wiring if no active usage is found

Remove app-root toast provider and viewport wiring only if no functional toasts are used in runtime paths.

Files:
* apps/client/src/App.tsx - Remove ToastProvider and ToastViewport integration
* apps/client/src/ui/primitives/Toast.tsx - Remove or isolate runtime toast module if unused
* apps/client/src/ui/primitives/Toast.test.tsx - Remove or align tests with retained behavior

Success criteria:
* App behavior remains unchanged for current user-visible flows.
* Build totals show measurable post-change delta.

Context references:
* .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 30-38) - Path A

Dependencies:
* Phase 1 completion

### Step 2.2: Execute WI-05 icon adapter A/B experiment

Run controlled build comparison with and without icon adapter dependency surface.

Files:
* apps/client/src/ui/icons/index.ts - Candidate temporary removal/reintroduction during experiment
* apps/client/package.json - Candidate temporary lucide-react dependency toggle during experiment

Success criteria:
* Experiment produces deterministic before/after byte deltas.
* Decision is recorded: icon adapter is contributor or non-contributor.

Context references:
* .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 36-38, 62-66)

Dependencies:
* Step 2.1 completion

### Step 2.3: Validate phase changes

Validation commands:
* npm run lint --workspace=apps/client
* npm run test --workspace=apps/client -- --run
* npm run build --workspace=apps/client

## Implementation Phase 3: Conditional Optimization Escalation

<!-- parallelizable: false -->

### Step 3.1: Narrow primitive runtime surface when Phase 2 delta is insufficient

Reduce optional primitive surface in runtime/import paths while preserving currently required behavior.

Files:
* apps/client/src/ui/primitives/Dialog.tsx
* apps/client/src/ui/primitives/AlertDialog.tsx
* apps/client/src/ui/primitives/Tabs.tsx
* apps/client/src/ui/primitives/ToggleGroup.tsx
* apps/client/src/ui/primitives/VisuallyHidden.tsx

Success criteria:
* Optional primitive footprint is reduced with no regression in current flows.
* Measurements show additional reduction.

Dependencies:
* Phase 2 completion and insufficient delta to pass gate

### Step 3.2: Lazy-load canvas stack when required

Apply route/mode-level code-splitting for MosaicScene and related 3D dependencies if gate or performance goals remain unmet.

Files:
* apps/client/src/App.tsx
* apps/client/src/render/MosaicScene.tsx
* apps/client/src/ui/CanvasLoadingFallback.tsx (new, if needed)

Success criteria:
* Lobby initial path excludes canvas 3D stack from initial execution path.
* Loading and transition UX remains correct.

Dependencies:
* Step 3.1 completion and unresolved gate/performance gap

## Implementation Phase 4: Validation and Gate Reporting

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all validation commands for modified client scope:
* npm run lint --workspace=apps/client
* npm run test --workspace=apps/client -- --run
* npm run build --workspace=apps/client

### Step 4.2: Compute and report bundle deltas

Compute raw-byte and gzip-aware totals and compare against baseline and threshold.

Validation commands:
* cd apps/client && wc -c dist/assets/*
* cd apps/client && ls -lh dist/assets

Success criteria:
* Results are recorded in release changes log with baseline, new totals, and delta.
* Gate pass/fail is explicitly stated with metric used and all thresholds listed.

### Step 4.3: Report blocking issues and follow-on actions

If gate still fails, report unresolved blockers and recommended next wave work without broad refactor in this phase.

### Step 4.4: Produce deferred-scope completion summary

Publish a structured completion summary in the changes artifact with explicit deferred work.

Files:
* .copilot-tracking/changes/2026-07-25/client-bundle-mitigation-changes.md

Required sections:
* Completed implementation steps and validation status
* Baseline/new totals and computed deltas with metric definition
* Deferred scope items with rationale for deferral
* Suggested owner and next action for each deferred item

Dependencies:
* Phase 3 completion

## Dependencies

* Node.js npm workspace tooling
* Existing client test/build toolchain (Vitest, Vite, TypeScript)

## Success Criteria

* WI-05 experiment is completed with measurable and reproducible evidence.
* Client bundle mitigation steps are executed in low-risk sequence with tracked deltas.
* Gate outcome is reported using explicit metric and remaining ambiguity is documented.