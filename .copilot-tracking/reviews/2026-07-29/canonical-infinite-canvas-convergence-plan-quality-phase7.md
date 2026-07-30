<!-- markdownlint-disable-file -->

# Canonical Infinite Canvas Convergence Phase 7 Quality Validation

## Status

Failed with 1 Critical, 5 Major, and 1 Minor finding. Phase 7 closes IV-003,
IV-013, and IV-014. IV-004 is reopened because server-issued child attempts are not bound
to an observed reconnect or resubscribe cycle.

## Critical Findings

### IV-004: Child telemetry remains caller-manufacturable

The authenticated child-attempt endpoint issues reconnect or resubscribe attempts from only
a principal-owned, unexpired entry parent at `apps/server/src/index.ts:994-1021`. The store
checks the principal, parent kind, and expiry, but no socket, cycle nonce, or observed
reconnect state at `apps/server/src/migration/canonicalAttempts.ts:31-63`. The same caller
can request and consume any number of children through the fallback endpoint at
`apps/server/src/index.ts:1035-1080`.

Impact: an authenticated caller can manufacture successful child terminals and bias the
promotion evidence used to retire compatibility. Bind each child to a server-observed,
single-use socket cycle and atomically consume that cycle with its terminal.

## Major Findings

### IV-016: Entry-attempt expiry breaks long-lived reconnects

Entry attempts expire after ten minutes at
`apps/server/src/migration/canonicalAttempts.ts:25-50`. Every socket connection, including a
later reconnect, requires the original entry attempt to remain owned and unexpired at
`apps/server/src/index.ts:1613-1651`.

Impact: a reconnect after ten minutes is rejected as an unsupported client, and child
telemetry can no longer be issued for the required rollout window. Separate durable socket
lineage from short-lived terminal authorization or rotate lineage before expiry, and add
clock-controlled reconnect tests.

### IV-007: Session-era public contracts remain compiled

The public server contract still advertises session routes, session errors,
`createSession`, snapshot events, and session rooms at `apps/server/src/contracts.ts:89-173`,
`apps/server/src/contracts.ts:282-292`, and `apps/server/src/contracts.ts:620-659`.
`apps/server/src/auth/httpAuth.ts:70-81` still serializes `createSession: false`.

Impact: the compiled product surface retains retired semantics. Remove these public fields,
errors, comments, and runtime aliases, keeping retention-only shapes internal.

### IV-010: Required live product boundaries remain untested

The real socket authentication and compatibility chain is composed, but navigation, claim,
and presence assertions still call helpers at
`apps/server/src/index.integration.test.ts:77-104` and
`apps/server/src/index.integration.test.ts:374-445`.

Impact: route registration, authentication context, persistence, fanout, and disconnect
cleanup can fail while helper tests pass. Exercise these behaviors through live authenticated
HTTP and Socket.IO boundaries backed by isolated PostgreSQL.

### IV-015: Standard Playwright acceptance remains order-dependent

The full standard suite failed twice at 13 of 14 in the multi-user convergence case, while
the same case passed alone. The exact tile-count oracle is at
`e2e/multi-user-fixtures.spec.ts:25-33`.

Impact: acceptance state leaks across the full suite or a denied optimistic placement remains
visible. Isolate and clear all fixture and optimistic state, then pass repeated full-suite
runs without retries.

### IV-011: Release artifacts overstate readiness

The changes and planning logs declare Phase 7 complete and all standard Playwright tests
passing despite the open findings and retained 13-of-14 result.

Impact: operators can approve release using claims contradicted by current evidence. Mark
Phase 7 and release readiness as failed until every Critical and Major finding closes.

## Minor Findings

### IV-012: ADR keyword indentation remains malformed

The `canonical quilt` keyword is indented one space farther than adjacent entries at
`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:6-10`.

Align the list marker and parse the frontmatter as YAML.

## Closure Matrix

| Finding | Severity | Status |
|---------|----------|--------|
| IV-003 | Critical | Closed: entry attempts are server-issued, principal-bound, and single-use. |
| IV-004 | Critical | Open: child attempts are server-issued but not bound to observed cycles. |
| IV-007 | Major | Open: session-era public contracts remain compiled. |
| IV-010 | Major | Open: navigation, claim, and presence coverage remains helper-level. |
| IV-011 | Major | Open: release artifacts overstate closure and validation results. |
| IV-012 | Minor | Open: ADR frontmatter indentation remains malformed. |
| IV-013 | Critical | Closed: both deployment branches install retirement evidence. |
| IV-014 | Major | Closed: focused authenticated placement reaches `1 placed`. |
| IV-015 | Major | Open: standard Playwright isolation is order-dependent. |
| IV-016 | Major | Open: expiring entry lineage rejects later reconnects. |

## Validation Evidence

* Phase 7 RPI validation reran release contracts, focused server and client suites, lint,
  build, workspace tests, both Playwright configurations, migration rehearsal, and
  `git diff --check`.
* Release contracts passed 9 of 9.
* Focused server tests passed 64 tests.
* Focused client tests passed 25 tests with 16 skipped.
* Workspace tests passed 367 tests with 17 skipped.
* Focused authenticated Playwright passed 7 of 7.
* Standard Playwright failed twice at 13 of 14.
* Multi-replica Playwright passed 1 of 1.
* Migration rehearsal passed 10 of 10.
* Ports 3001 and 5173 were clear after validation.

## Overall Assessment

Needs Rework. The deployment evidence path and original placement defect are corrected, but
promotion telemetry remains forgeable through unobserved child issuance. Long-lived reconnect
lineage, runtime contract retirement, composed boundary coverage, full-suite isolation, and
release reporting also remain incomplete.
