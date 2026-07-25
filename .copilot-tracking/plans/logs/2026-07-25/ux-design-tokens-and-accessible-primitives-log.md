<!-- markdownlint-disable-file -->
# Planning Log: UX Design Tokens and Accessible UI Primitives

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* No current DR items. Previously identified DR-01 through DR-03 were addressed by adding explicit dependency installation steps, bundle-size acceptance gates, and scope guard exclusions in the plan and details files.

### Plan Deviations from Research

* DD-01: Validation command execution path differed from plan script form
  * Plan specifies: Execute `pnpm --filter client lint` and `pnpm --filter client build`
  * Implementation differs: Executed `npm --prefix apps/client run lint` and `npm --prefix apps/client run build`
  * Rationale: pnpm workspace filter did not resolve a `client` project in the current repository setup
* DD-02: Phase 2 validation command execution path differed from plan script form
  * Plan specifies: Execute `pnpm --filter client lint` and `pnpm --filter client test -- --run`
  * Implementation differs: Executed `npm run lint --workspace=apps/client` and `npm run test --workspace=apps/client -- --run`
  * Rationale: pnpm executable was not available in the environment and required workspace-filter commands could not be run as specified
* DD-03: Phase 3 validation command execution path differed from plan script form
  * Plan specifies: Execute `pnpm --filter client lint` and `pnpm --filter client test -- --run`
  * Implementation differs: Executed `npm run lint --workspace=apps/client` and `npm run test --workspace=apps/client -- --run`
  * Rationale: direct `pnpm` binary was not available in PATH for this execution shell
* DD-04: Bundle-size acceptance threshold not met in Phase 4
  * Plan specifies: total built asset size delta <= 30000 bytes
  * Implementation differs: measured delta was 411138 bytes (1176436 baseline vs 1587574 modified)
  * Rationale: introducing Radix primitives and icon dependency increased bundle size beyond gate
* DD-05: Phase 4 Step 4.2 executed with isolated remediation while bundle-size blocker remains
  * Implemented fixes: keyboard-focusable status error tooltip trigger, targeted tooltip/accessibility tests, and visually-hidden utility consolidation
  * Validation outcome: `npm run lint` pass, `npm run test --workspace=apps/client` pass (49 tests), `npm run build --workspace=apps/client` pass with unchanged chunk-size warning
  * Rationale: Step 4.2 scope allows minor local fixes; chunk-size optimization requires broader bundle strategy beyond this step

## Implementation Paths Considered

### Selected: CSS Custom Properties with Radix Headless Primitives

* Approach: Implement primitive and semantic token layers in CSS, add base accessibility styles, and wrap Radix primitives in thin local components.
* Rationale: Best fit with existing global CSS conventions, minimal disruption risk, and broad ARIA coverage.
* Evidence: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 276-327)

### IP-01: shadcn/ui plus Tailwind Migration

* Approach: Introduce shadcn/ui and Tailwind utilities as the primary component and styling foundation.
* Trade-offs: Faster visual assembly for new components, but high migration cost and style-system replacement beyond task scope.
* Rejection rationale: Conflicts with current handcrafted CSS approach and exceeds issue boundaries.

### IP-02: React Aria Hook-First Primitives

* Approach: Build custom primitives with React Aria hooks and local styling.
* Trade-offs: Strong composability and accessibility controls, but heavier implementation overhead and increased bundle/complexity risk for current needs.
* Rejection rationale: Radix provides required primitive coverage with lower integration overhead for this project.

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Add accessibility regression checks in CI - Integrate keyboard navigation and focus visibility checks for primary flows. (high)
  * Source: Planning synthesis of requirements and current absence of explicit a11y CI gates
  * Dependency: Completion of token and primitive migration
* WI-02: Add bundle analysis guardrail - Capture baseline bundle size and set acceptable deltas for UI library additions. (medium)
  * Source: Prior DR-02
  * Dependency: Radix/lucide adoption merged to main
* WI-03: Add theme extensibility plan - Define high-contrast and dark-mode semantic token layers. (low)
  * Source: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 340-341)
  * Dependency: Stable semantic token adoption
* WI-04: Reduce UI bundle overhead from primitives and icons - profile imports, split optional primitives, and trim icon surface to meet <= 30000 byte delta target. (high)
  * Source: Phase 4, Step 4.1 validation results
  * Dependency: Completion of current implementation merge and agreed optimization scope
* WI-05: Define and execute a small, measurable bundle mitigation experiment for icon adapter exports (high)
  * Source: Phase 4, Step 4.2 follow-up from unresolved size gate
  * Dependency: Agreement on acceptance metric (raw, minified, or gzip delta)
