<!-- markdownlint-disable-file -->
# Task Review: Infinite-Canvas Authentication and Authorization

## Review Metadata

* Review date: 2026-07-28
* Related plan: `.copilot-tracking/plans/2026-07-28/infinite-canvas-authentication-authorization-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md`
* Research: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* Review scope: Phase 1 repository-controlled provider and release prerequisites
* Branch: `infinite-canvas`

## Review Status

Overall status: Needs Rework

| Severity | Count |
|---|---:|
| Critical | 1 |
| Major | 3 |
| Minor | 3 |

## Scope Notes

The changes log claims only Phase 1 implementation. Step 1.1 remains administratively blocked on target External ID tenant access and approved registration values. Phases 2 through 8 are planned but not claimed as implemented. Unrelated finite-quilt changes on the same branch are excluded unless a Phase 1 authentication prerequisite directly modified them.

## RPI Validation

| Phase | Status | Evidence |
|---|---|---|
| 1. Provider and release prerequisites | Partial | Repository-owned work exists and focused validation passes, but External ID administration is incomplete and quality findings require rework. See `.copilot-tracking/reviews/rpi/2026-07-28/infinite-canvas-authentication-authorization-plan-001-validation.md`. |
| 2. Identity persistence and verification | Blocked, unstarted | Correctly not claimed; no identity schema, token verification, or principal resolution implementation exists. |
| 3. Protected HTTP, socket, and visibility | Blocked, unstarted | Correctly not claimed; current anonymous behavior remains until Phase 2 is implemented. Deployment identity variables do not constitute authentication enforcement. |
| 4. Client authentication lifecycle | Blocked, unstarted | Correctly not claimed; no MSAL provider, authenticated fetch boundary, renewal, or protected-state clearing exists. |
| 5. Claims and ownership lifecycle | Blocked, unstarted | Correctly not claimed; missing claim, transfer, abandonment, deletion, and audit behavior is planned later work, not a Phase 1 defect. |
| 6. Authenticated protocol-v2 mutations | Blocked, unstarted | Correctly not claimed. Mutation remains fail closed and focused tests pass. |
| 7. Deployment, authenticated E2E, and rollout | Blocked, unstarted | Phase 1 adds deployment plumbing only. Local OIDC, production verification, and authenticated E2E remain planned work. |
| 8. Final validation | Blocked, unstarted | Phase 1 checks do not satisfy final rollout validation. Full security, benchmark, and authenticated multi-replica evidence depends on Phases 2 through 7. |

Independent RPI artifacts are stored under `.copilot-tracking/reviews/rpi/2026-07-28/`. Severity labels assigned solely to expected unimplemented later-phase work were normalized out of this review's defect totals.

## Implementation Quality

Detailed findings: `.copilot-tracking/reviews/quality/2026-07-28/infinite-canvas-authentication-authorization-plan-quality.md`.

### Critical

* CD cancellation can abandon polling while an Azure migration execution continues. A replacement release can update and start the same job again, violating the exactly-one migration-owner requirement.

### Major

* Existing migration jobs do not have manual trigger, parallelism, completion count, timeout, and retry settings reconciled on update.
* Raw `envsubst` can generate invalid runtime JSON, and the container does not parse the document before starting nginx.
* Runtime parsing removes trailing slashes from exact redirect and logout URIs, potentially diverging from External ID registration.

### Minor

* The browser-reachable API routing model is ambiguous between internal server ingress, selective nginx proxying, and `AUTH_API_ORIGIN` documentation.
* Focused automated tests do not cover runtime JSON generation, exact URI preservation, nginx routing, workflow cancellation, or migration-job drift.
* Migration rehearsal temporary directories can survive failure, and `--help` unnecessarily depends on database tooling.

## Validation Commands

| Command | Status | Result |
|---|---|---|
| `npm run lint:client` | Passed | Oxlint reported no client errors. |
| `npm run build:client` | Passed with warning | TypeScript and Vite completed; existing large-chunk warnings remain. |
| `npm run lint:server` | Passed | Oxlint reported no server errors. |
| `npm run build:server` | Passed | TypeScript compilation completed. |
| `bash -n scripts/verify-quilt-migration.sh scripts/bootstrap-cd-environment.sh` | Passed | Bash syntax is valid. |
| `./scripts/verify-quilt-migration.sh rehearse` | Passed | Fresh/upgrade schema parity, idempotent backfill, rollback, recovery, and six retention tests passed. |
| Focused server Vitest | Passed | 2 files and 40 tests passed. |
| Focused client Vitest | Passed | 1 file and 29 tests passed. |
| Scoped `git diff --check` | Passed | No whitespace errors in claimed files, helper edits, or review artifacts. |
| VS Code diagnostics | Passed | No diagnostics in the reviewed workflow, Docker, nginx, TypeScript, or Bash files. |
| `shellcheck` | Not run | ShellCheck is unavailable in the environment. |

No development servers were started. Ports 3001 and 5173 were free at review completion.

## Missing Work and Deviations

* External ID subscription capability, tenant branding, domain, sign-in methods, and exact SPA/API registration values remain externally blocked.
* Identity persistence, protected boundaries, client authentication, ownership lifecycle, authenticated mutation, authenticated E2E, and final rollout validation remain unstarted by design.
* `scripts/bootstrap-cd-environment.sh` and `scripts/gh-vars.env.template` contain uncommitted Phase 1-related edits but are absent from the changes log. Their syntax and diff checks pass; release traceability must be reconciled before completion.
* The branch contains extensive finite-quilt work from the preceding task. That work was excluded from this authentication review except where Phase 1 directly depends on its migration and mutation-disable behavior.

## Follow-Up Work

### Deferred From Scope

* Phases 2 through 8, including token verification, durable principal mapping, protected resources, client authentication, ownership lifecycle, authenticated mutations, local OIDC, authenticated E2E, and rollout approval
* Delegated mutation and moderator commands
* Provider-side External ID tenant and registration administration, which requires an authorized administrator

### Discovered During Review

* Prevent overlapping migration executions before relying on the release-owned migration path.
* Reconcile migration-job safety settings on both create and update paths.
* Generate and validate runtime auth JSON with a JSON-aware mechanism.
* Preserve exact redirect and logout URI strings after validation.
* Resolve and test the public API routing contract before protected `/me` and domain routes are introduced.
* Add focused release-contract tests and reconcile the two uncommitted bootstrap-helper changes.

## Reviewer Notes

Phase 1 has substantial, validated repository work: migration metadata is restored, migration rehearsal passes, deployment rejects missing settings, runtime configuration is served without caching, documentation and issue decomposition exist, and protocol-v2 mutation remains disabled. It is not ready to close. The migration concurrency defect can violate the phase's central release-ownership guarantee, and the runtime configuration path does not yet preserve approved identity values reliably.

Rework the critical and major findings first. Then obtain External ID administrator evidence, run a staging deployment with exact approved values, and repeat Phase 1 validation before beginning Phase 2.