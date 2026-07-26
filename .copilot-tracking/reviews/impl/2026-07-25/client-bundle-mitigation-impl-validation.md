<!-- markdownlint-disable-file -->
# Implementation Quality Validation: Client Bundle Mitigation — Lazy Canvas Boundary

## Metadata

| Field          | Value                                                              |
|----------------|--------------------------------------------------------------------|
| Date           | 2026-07-25                                                         |
| Scope          | full-quality                                                       |
| Overall Status | NEEDS_REWORK                                                       |

Changed files:

* `apps/client/src/App.tsx` (modified)
* `apps/client/src/ui/CanvasLoadingFallback.tsx` (added)
* `apps/client/src/ui/CanvasLoadingFallback.css` (added)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| Major    | 2     |
| Minor    | 1     |

---

## Findings

### IV-001 — Undefined CSS Custom Properties in CanvasLoadingFallback.css [Major]

**Category**: Design, CSS

`CanvasLoadingFallback.css` references four custom properties that do not exist anywhere in
`apps/client/src/styles/tokens/primitives.css` or `apps/client/src/styles/tokens/semantic.css`.
At runtime each silently falls back to its CSS-specified initial value, breaking the visual design
of the loading component in all environments.

| Property used (line)         | Defined? | CSS initial fallback | Visible effect                      | Correct token            |
|------------------------------|----------|----------------------|-------------------------------------|--------------------------|
| `--radius-xl` (line 7)       | No       | `0`                  | Hard corners, no border-radius      | `--radius-component`     |
| `--color-surface` (line 9)   | No       | `transparent`        | Background invisible                | `--color-surface-primary`|
| `--color-text-muted` (lines 10, 18) | No | `initial` (black)   | Text/spinner track unintended color | `--color-feedback-muted` |
| `--color-brand` (line 19)    | No       | `transparent`        | Spinner accent disappears           | `--color-accent-primary` |

Note: `--color-border-subtle` (line 8) is correctly defined and is not affected.

**Impact**: The loading fallback renders as a transparent/unstyled block with a non-functional spinner whenever the MosaicScene chunk is loading.

**Recommendation**: Replace the four undefined properties with their correct semantic token names listed above.

---

### IV-002 — No ErrorBoundary Paired with Suspense Boundary [Major]

**Category**: Architecture, Error Handling

The `Suspense` boundary wrapping the lazy `MosaicScene` at `apps/client/src/App.tsx` line 971
has no paired `ErrorBoundary`. Dynamic import failures (chunk load errors from CDN cache
invalidation, network flakiness, or partial deployments) throw into the React tree as uncaught
errors. No `ErrorBoundary` exists anywhere in the codebase, so the error propagates to React's
root, unmounting the entire application for what may be a transient failure.

**Evidence**: `apps/client/src/App.tsx` line 971 — `Suspense` with no sibling `ErrorBoundary`.

**Impact**: A chunk load failure hard-crashes the app and requires a full page reload to recover.

**Recommendation**: Wrap the `Suspense` boundary with a React `ErrorBoundary` that renders a
recoverable error state (e.g. "Failed to load canvas. Retry?" with a reload button). A lightweight
class component boundary or React 19's `use` API are both viable approaches.

---

### IV-003 — No Test Coverage for CanvasLoadingFallback [Minor]

**Category**: Test Coverage

`CanvasLoadingFallback` is a new presentational component with zero test coverage. Given that its
CSS token usage is currently incorrect (IV-001), a smoke render test would catch future regressions
in both markup structure and ARIA attribute presence.

**Evidence**: `apps/client/src/ui/CanvasLoadingFallback.tsx` — no matching test file found.

**Impact**: Accessibility attributes (`role="status"`, `aria-live="polite"`, `aria-hidden="true"`) and structural correctness are unverified by the automated suite.

**Recommendation**: Add a minimal render test asserting `role="status"` is present and
`aria-hidden` is set on the spinner span.

---

## Positive Observations

* React.lazy async wrapper for named export is correctly implemented (`App.tsx` lines 86–90).
  The `lazy(async () => ({ default: module.MosaicScene }))` idiom is required because `MosaicScene`
  is a named export — the standard shorthand would fail at runtime.
* Suspense boundary placement is architecturally appropriate: scoped to canvas-mode only; lobby
  path stays in the initial chunk.
* TypeScript: no errors on any of the three changed files.
* Accessibility: `role="status"`, `aria-live="polite"`, and `aria-hidden="true"` on the decorative
  spinner are all correct per WCAG 4.1.3.
* Toast removal is clean: no residual `Toast` or `Toaster` imports or usages remain in `App.tsx`.
* Vitest mock interop: `vi.mock('./render/MosaicScene')` in `App.test.tsx` intercepts the
  dynamically imported module correctly; Vitest hoisting handles the lazy boundary without test
  changes.
* Security: no OWASP concerns introduced. No user input, no external data flows, no credential
  exposure in the changed files.
