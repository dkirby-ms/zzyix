<!-- markdownlint-disable-file -->
# Implementation Quality: Infinite-Canvas Authentication and Authorization

## Scope

Full-quality review of the Phase 1 repository files listed in the changes log. Unrelated finite-quilt changes and unclaimed Phases 2 through 8 are excluded from defect counts.

## Status

Needs rework: 1 critical, 3 major, and 3 minor findings.

## Critical Findings

### Q-001 Cancelled CD runs can overlap release-owned migration executions

The workflow uses `cancel-in-progress: true`, starts an external Azure Container Apps job execution, and waits by polling from the GitHub runner. Cancelling the workflow does not prove that Azure stopped the execution. A replacement run can update the same job to a new image and start another execution while the previous migration is still active. This violates the Phase 1 requirement that exactly one release step apply migrations before incompatible replicas start.

Evidence: `.github/workflows/cd.yml` concurrency configuration and the `Apply Database Migrations` step.

Required correction: prevent cancellation after migration ownership begins, or acquire a release-scoped lock and explicitly detect, wait for, or stop an existing execution before updating and starting the migration job.

## Major Findings

### Q-002 Existing migration-job safety settings are not reconciled

The create path sets a manual trigger, parallelism one, completion count one, timeout, and retry limit. The update path changes only image, environment, command, and arguments. A drifted or pre-existing job can therefore retain unsafe execution settings and violate the single-owner contract.

Required correction: reassert and verify all migration execution settings on every deployment.

### Q-003 Runtime JSON generation does not escape or validate substituted values

The client entrypoint checks only that public settings are non-empty, then inserts them into JSON with raw `envsubst`. Quotes, backslashes, or control characters can produce invalid JSON, and nginx starts without parsing the generated document. The browser then fails after deployment rather than the container failing clearly at startup.

Required correction: generate the document with a JSON-aware tool or script, parse it before starting nginx, and test representative special characters.

### Q-004 Exact redirect and logout URIs are mutated by the client parser

`requireAbsoluteUrl` removes a trailing slash from every URL, including `redirectUri` and `postLogoutRedirectUri`. The documentation requires exact registered values, and trailing-slash differences can cause OAuth redirect mismatches.

Required correction: validate redirect and logout URIs without canonicalizing their serialized values. Origin normalization, when needed, should be separate and explicit.

## Minor Findings

### Q-005 Public API routing contract is ambiguous

The server uses internal ingress and nginx proxies only `/health`, `/sessions`, and `/socket.io`, while documentation describes `AUTH_API_ORIGIN` as a public API origin. Future protected routes such as `/me` need either same-origin proxy coverage or an externally reachable API. The current Phase 1 contract does not enforce which model is valid.

Recommended correction: choose and document one browser-reachable API model before Phase 3, then validate `AUTH_API_ORIGIN` against it.

### Q-006 Focused release-contract tests are absent

No focused automated tests cover runtime configuration parsing, generated JSON validation, nginx cache/routing behavior, CD cancellation, or migration-job update drift. Builds and migration rehearsal pass, but they do not exercise these release semantics.

Recommended correction: add unit tests for runtime parsing and an executable container/workflow contract check.

### Q-007 Migration rehearsal cleanup and CLI help have avoidable failure modes

Temporary prefix-migration directories are removed only after successful migration application, so failures can leave them behind. The command also checks database prerequisites before handling `--help`, which makes usage output dependent on installed database tools.

Recommended correction: add scoped cleanup traps and handle help before operation prerequisites.

## Confirmed Quality

* Client and server lint passed
* Client and server builds passed
* Drizzle metadata lineage and pinned tooling are coherent
* Migration rehearsal passed fresh, upgrade, parity, rollback, recovery, and six retention tests
* Protocol-v2 mutation remains disabled; 40 focused server tests and 29 focused client tests passed
* Nginx serves runtime configuration with no-store headers
* Missing required deployment settings fail closed
* No editor diagnostics were reported in the reviewed implementation files

## Scope Notes

The External ID administrative dependency is a release blocker, not a repository defect. Missing authentication, ownership, and authenticated E2E work in Phases 2 through 8 is intentionally unstarted and is not counted as implementation-quality failure for this Phase 1 review.