<!-- markdownlint-disable-file -->
# Planning Log: Canvas-First Responsive App Shell

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None.

### Plan Deviations from Research

* None.

## Implementation Paths Considered

### Selected: Canvas-first two-column shell with AppHeader and local canvas actions

* Approach: Introduce AppHeader and CanvasActionBar, split palette to dedicated region, keep behavior handlers in App state owner, gate technical diagnostics behind debug resolver
* Rationale: Directly satisfies issue #77 requirements while minimizing interaction-model changes
* Evidence: .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md (Scenario 2 and Selected Approach sections)

### IP-01: Minimal relocation within existing sidebar-first grid

* Approach: Keep current shell structure and move only rotate/mirror controls nearer to canvas
* Trade-offs: Lowest churn and risk, but insufficient alignment with canvas-first dominance and header consolidation goals
* Rejection rationale: Under-delivers against accepted scope and likely fails visual dominance criteria

### IP-02: Canvas-primary with collapsible drawer palette

* Approach: Replace fixed palette region with drawer/collapsible panel across small and medium widths
* Trade-offs: Strongest canvas emphasis, but introduces focus management and interaction complexity outside current scope
* Rejection rationale: Exceeds issue scope (mobile bottom-sheet and gesture expansions excluded) and raises regression risk

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Lobby visual continuity alignment — Evaluate rendering AppHeader in lobby mode for consistent app identity and navigation model (medium)
  * Source: Open question in research file
  * Dependency: Completion and UX validation of canvas-mode shell refactor
* WI-02: Runtime debug toggling strategy — Define whether diagnostics can be enabled via runtime query/local override in non-production environments (low)
  * Source: Research open question and DD-01 rationale
  * Dependency: Initial debug-gating implementation and developer feedback
