<!-- markdownlint-disable-file -->

# RPI Validation: Canonical Infinite Canvas Convergence Phase 0

## Validation Status

**Partial**

Finding counts: 0 critical, 1 major, 1 minor.

## Scope

Implementation Phase 0 only: the canonical product contract, its architecture decision,
and the fixed product and runtime decisions required by Steps 0.1 and 0.2.

Sources reviewed in full:

* `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md`
* `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`

Implementation files were read for evidence only. No product, plan, research, details, or
changes-log file was modified during validation.

## Phase Requirements

The plan marks two Phase 0 steps complete at
`.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md:56-63`.
The detailed requirements are defined at
`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:14-67`.

Phase 0 requires the repository to establish all of the following decisions:

1. Exactly one supported canonical protocol-V2 toroidal quilt
2. No user-created canvas or legacy-content access, migration, import, archive, restore,
	or identity-preservation product workflow
3. Inert additive legacy records and application-routing rollback must remain technical
	residue, not supported product tenancy
4. A newly provisioned target rather than adoption of an existing quilt
5. A 32-by-32 topology with 31.2-by-20.4 world-unit patches, 1,024 patches, and origin
	`(0, 0)`
6. Root entry at row 0, column 0
7. Durable links based on canonical quilt ID and stable patch ID
8. Eligible unclaimed patches ordered by row and then column
9. Claims keyed by stable patch ID, with a successful claim focusing the claimed patch
10. One active owned patch per principal per quilt while preserving global claim-rate
	 windows
11. Replica-wide presence through expiring per-socket database leases, heartbeat renewal,
	 and transactional first- and last-lease decisions

## Plan-to-Changes Comparison

The changes log claims the Phase 0 implementation in
`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:37-38`.

| Plan item | Changes-log claim | Verified status |
|---|---|---|
| Step 0.1: amend tenancy ADR | The ADR establishes one canonical quilt | Complete |
| Step 0.1: exclude legacy-content product work | The ADR excludes legacy access and related workflows | Complete |
| Step 0.1: distinguish rollback from product support | The ADR defines compatibility routing as temporary operational rollback | Complete |
| Step 0.2: fix topology and target | The ADR fixes a newly provisioned 32-by-32 target | Partial: recorded and rehearsed, but activation can bypass it |
| Step 0.2: fix root and deep-link identity | The ADR fixes row 0, column 0 and quilt-plus-patch IDs | Complete |
| Step 0.2: fix discovery, claim, and quota | The ADR fixes row-major discovery, stable-ID claims, claim focus, and quota | Complete |
| Step 0.2: fix presence semantics | The ADR fixes database-backed per-socket leases | Complete |

No Phase 0 implementation file omitted from the changes log was found. Later-phase source
files provide corroborating runtime evidence but are not additional Phase 0 deliverables.

## Repository Evidence

### Architecture decision

* One canonical protocol-V2 quilt and automatic common tenancy are explicit at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:37-40`.
* Newly provisioned target selection and a database-backed pointer are explicit at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:42-45`.
* The fixed 32-by-32, 31.2-by-20.4, 1,024-patch topology and origin are explicit at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:54-56`.
* Root entry and durable quilt-plus-patch identity are explicit at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:81-86`.
* Replica-wide lease semantics are explicit at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:114-122`.
* Legacy workflows are excluded and rollback is operational only at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:140-151`.
* Row-major discovery, stable-ID claim identity, successful-claim focus, ownership quota,
	and global rate windows are explicit at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:195-205`.

The planning log records the same approved values at
`.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:71-78`.

### Runtime alignment

* The migration rehearsal provisions the exact fixed topology and verifies 1,024 patches
	plus row-0, column-0 entry at `scripts/verify-quilt-migration.sh:296-317`.
* Canonical target validation requires protocol V2, toroidal topology, positive geometry,
	a complete address grid, and initial row 0, column 0 at
	`apps/server/src/db/repository.ts:2803-2841` and
	`apps/server/src/db/repository.ts:2865-2926`.
* Durable links persist quilt and patch IDs at `apps/client/src/network/session.ts:76-88`.
* Root fallback, durable-link resolution, and claim focus are implemented at
	`apps/client/src/App.tsx:585-640` and `apps/client/src/App.tsx:672-684`.
* Eligible patches are ordered by row and column and are returned by stable patch identity
	at `apps/server/src/db/repository.ts:2992-3052`.
* Claim handling locks the principal and enforces global rate windows plus one active patch
	in the target quilt at `apps/server/src/db/repository.ts:350-419`.
* Lease persistence is defined at `apps/server/src/db/schema.ts:164-186`; advisory-locked
	acquire, renew, release, and expiry decisions are implemented at
	`apps/server/src/db/repository.ts:1578-1725`.
* Socket lifecycle acquires and heartbeats leases at `apps/server/src/index.ts:2360-2380`
	and publishes leave only after the last lease at `apps/server/src/index.ts:3297-3325`.
* Retired session endpoints authenticate and return HTTP 426 at
	`apps/server/src/index.ts:1772-1798`, so retained session DTOs and database compatibility
	structures are not evidence of a supported legacy product path.

## Findings

### Critical

None.

### Major

#### M-01: Canonical activation can bypass the fixed target contract

The ADR requires a newly provisioned 32-by-32 quilt with 31.2-by-20.4 patches and origin
`(0, 0)` at `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:42-56`. Runtime target
validation accepts any positive finite dimensions at `apps/server/src/db/repository.ts:2821-2841`.
More importantly, `activateCanonicalWorld` validates an arbitrary supplied quilt ID and can
create a missing pointer or repoint an existing pointer to that quilt at
`apps/server/src/db/repository.ts:3152-3188`. The CLI exposes that unrestricted quilt ID at
`apps/server/src/cli/selectCanonicalWorld.ts:128-136`.

This is a plan deviation, not acceptable implementation detail. A valid but differently
sized existing quilt can become canonical without passing through the fixed provisioning
contract, contradicting both the newly provisioned target decision and the immutable
production dimensions. No repository runbook or deployment automation constrains activation
to the exact provisioned generation-1 target; the only fixed-value invocation is migration
rehearsal at `scripts/verify-quilt-migration.sh:296-317`.

Recommended correction: require activation to transition the current inactive pointer from
generation 1 to generation 2 without changing its quilt ID, and enforce the ADR geometry
when validating the product key `canonical`. If target replacement is operationally needed,
define it in a separate architecture decision with explicit provenance and topology checks.

### Minor

#### N-01: ADR frontmatter contains a malformed keyword indentation

The `canonical quilt` keyword has one extra leading space at
`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:9`. Editor diagnostics did not flag
the file, and the body remains readable, so this does not affect the product contract. It is
a metadata and document-quality defect that can break strict YAML frontmatter consumers.

Recommended correction: align the keyword marker with the entries at lines 7, 8, and 10.

### Acceptable implementation detail

* Generic numeric provision arguments at
	`apps/server/src/cli/selectCanonicalWorld.ts:142-147` are acceptable when the canonical
	product path enforces the approved values. The finding concerns unrestricted activation,
	not parameterized command parsing.
* Query parameters named `quilt` and `patch` at `apps/client/src/network/session.ts:76-87`
	satisfy the durable-identity decision; the ADR does not prescribe a URL path shape.
* The current canonical-only UI and HTTP 426 session responses are acceptable later-phase
	evolution. Removing the temporary lobby after measured promotion follows the ADR rather
	than violating its canary rollback distinction.
* Retained compatibility columns, DTOs, tests, and migration code are acceptable inert
	implementation residue while no supported route exposes legacy content.
* Read-committed isolation under an advisory lock is a documented control-plane detail at
	`.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:26-30`
	and does not alter a Phase 0 product or runtime decision.

## Coverage Assessment

Ten of eleven Phase 0 decision groups are fully recorded and aligned with repository
behavior. The topology and target group is partially covered: exact values are recorded and
used in migration rehearsal, but the production activation abstraction does not enforce
them. Phase 0 therefore has high documentary coverage but incomplete runtime integrity.

Overall status is **Partial** until M-01 is corrected or an approved architecture decision
explicitly permits canonical target adoption and replacement with nonstandard geometry.

## Clarifying Questions

1. Is unrestricted activation of an existing quilt an intentional operator recovery
	capability? If so, which approved decision supersedes the ADR's newly provisioned target
	and fixed dimensions?
2. Is there release evidence outside this repository proving that the active production
	pointer references the approved 32-by-32 provisioned quilt? No such evidence was available
	in the supplied artifacts.

## Recommended Next Validations

* [ ] Validate a correction that prevents activation from adopting or repointing to a quilt
	outside the fixed canonical provisioning contract
* [ ] Validate the active environment's canonical pointer, quilt dimensions, patch count,
	origin, protocol version, and generation using redacted operator output
* [ ] Validate strict YAML frontmatter parsing after correcting the ADR keyword indentation
* [ ] Revalidate Phase 1 control-plane CAS and target-selection requirements after M-01 is
	addressed