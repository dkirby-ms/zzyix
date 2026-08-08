<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# Issues Plan

* **Repository**: dkirby-ms/zzyix
* **Milestone**: none
* **Autonomy**: Partial; creation was approved by the user.
* **Similarity Status**: Duplicate searches returned no matches for Alexander mosaic, mosaic import, or mosaic fidelity.
* **Execution Status**: Complete. All issues were created and attached directly under #155.

## Execution Mapping

* IS001 -> #156
* IS002 -> #157
* IS003 -> #158
* IS004 -> #159
* IS005 -> #160
* IS006 -> #161
* IS007 -> #162
* IS008 -> #163
* IS009 -> #164
* IS010 -> #165
* IS011 -> #166
* IS012 -> #167

All 12 created issues are sub-issues of #155. Repository labels were used in place of the generic draft labels.

## IS001 - Create - Track Alexander mosaic patch recreation

Create a parent tracking issue for the end-to-end feature. It groups the source pack, generator, importer, persistence verification, tests, fidelity acceptance, and final validation work.

IS001 - Similarity: Not searched; requires GitHub issue search before execution.

* IS001 - issue_number: {{TEMP-1}}
* IS001 - title: feat(mosaic): recreate Alexander mosaic patch through deterministic import pipeline
* IS001 - state: open
* IS001 - labels: feature
* IS001 - milestone: none
* IS001 - assignees: none

### IS001 - body

```markdown
## Summary

Track the end-to-end work to generate one bounded Alexander mosaic patch offline and import it through the existing quilt placement protocol.

## Scope

Coordinate source provenance, deterministic generation, client import, server persistence verification, focused tests, visual fidelity checks, and final validation.

## Acceptance Criteria

- [ ] Child issues cover source provenance, manifest contracts, offline generation, client import, persistence verification, testing, visual acceptance, and final validation.
- [ ] No new mutation protocol is introduced for the first version.
- [ ] The imported patch persists, replays, and reconnects through the existing placement path.
- [ ] Fidelity evidence is reproducible from the selected source, manifest, payload, and scoring command.
```

### IS001 - Relationships

* IS001 - parent-of - {{TEMP-2}}: Source pack prerequisite
* IS001 - parent-of - {{TEMP-3}}: Manifest and tile contract prerequisite
* IS001 - parent-of - {{TEMP-4}}: Preprocessing pipeline
* IS001 - parent-of - {{TEMP-5}}: Tessera generator
* IS001 - parent-of - {{TEMP-6}}: Fidelity scoring
* IS001 - parent-of - {{TEMP-7}}: Client payload validation
* IS001 - parent-of - {{TEMP-8}}: Revision-safe client import
* IS001 - parent-of - {{TEMP-9}}: Server persistence verification
* IS001 - parent-of - {{TEMP-10}}: Import regression tests
* IS001 - parent-of - {{TEMP-11}}: Visual acceptance harness
* IS001 - parent-of - {{TEMP-12}}: Final validation and handoff

## IS002 - Create - Licensed source pack

Create a source provenance issue that gates generation on approved image licensing and reproducibility.

IS002 - Similarity: Not searched; requires GitHub issue search before execution.

* IS002 - issue_number: {{TEMP-2}}
* IS002 - title: chore(mosaic): create licensed Alexander mosaic source pack
* IS002 - state: open
* IS002 - labels: maintenance
* IS002 - milestone: none
* IS002 - assignees: none

### IS002 - body

```markdown
## Summary

Create a reproducible source pack for the Alexander mosaic benchmark image and any comparison images used by the generator.

## Acceptance Criteria

- [ ] A manifest records source URL, file name, license, attribution, retrieval date, crop, and checksum for each benchmark image.
- [ ] The primary source checksum is stable across repeated generation runs.
- [ ] Source assets remain outside the runtime bundle unless an approved asset location is established.
- [ ] The normalized working source is reproducible from the manifest and original source.
```

### IS002 - Relationships

* IS002 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS002 - blocks - {{TEMP-3}}: Manifest contract depends on approved source identity

## IS003 - Create - Patch manifest and tile contract validation

Create the schema and validation issue that defines generator output and client import compatibility.

IS003 - Similarity: Not searched; requires GitHub issue search before execution.

* IS003 - issue_number: {{TEMP-3}}
* IS003 - title: feat(mosaic): define patch manifest and supported tile contract validation
* IS003 - state: open
* IS003 - labels: feature
* IS003 - milestone: none
* IS003 - assignees: none

### IS003 - body

```markdown
## Summary

Define the versioned patch manifest and runtime validation contract for generated mosaic placement payloads.

## Acceptance Criteria

- [ ] The manifest includes source identity, patch identifiers, patch dimensions, coordinate transform, palette, material, shape, rotation bins, generator seed, and expected tile count.
- [ ] Generated placements validate against supported shape, material, coordinate, rotation, color, and duplicate tile ID rules before network emission.
- [ ] Re-running the generator with the same source and seed produces byte-equivalent payloads.
- [ ] Runtime parsing lives in a client domain module that can be tested independently.
```

### IS003 - Relationships

* IS003 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS003 - depends-on - {{TEMP-2}}: Requires source identity
* IS003 - blocks - {{TEMP-4}}: Generator preprocessing consumes manifest configuration
* IS003 - blocks - {{TEMP-7}}: Client parser consumes manifest schema

## IS004 - Create - Deterministic preprocessing pipeline

Create the offline preprocessing issue for color conversion, luminance normalization, denoising, and saliency artifacts.

IS004 - Similarity: Not searched; requires GitHub issue search before execution.

* IS004 - issue_number: {{TEMP-4}}
* IS004 - title: feat(mosaic): implement deterministic source preprocessing pipeline
* IS004 - state: open
* IS004 - labels: feature
* IS004 - milestone: none
* IS004 - assignees: none

### IS004 - body

```markdown
## Summary

Implement the offline preprocessing step that converts the selected source into deterministic color, luminance, denoising, and saliency artifacts.

## Acceptance Criteria

- [ ] The preprocessing pipeline converts the source to CIELAB and applies deterministic luminance normalization.
- [ ] Edge-preserving denoising and saliency or edge mask generation are reproducible.
- [ ] Configuration records color space, normalization, denoising, saliency parameters, and generator seed.
- [ ] Output retains face, weapon, horse, and contour edges needed for recognizable mosaic generation.
```

### IS004 - Relationships

* IS004 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS004 - depends-on - {{TEMP-2}}: Requires licensed source
* IS004 - depends-on - {{TEMP-3}}: Requires manifest configuration
* IS004 - blocks - {{TEMP-5}}: Tessera generation consumes preprocessing artifacts

## IS005 - Create - Fixed-grid tessera generator

Create the deterministic tessera generation issue for patch-compatible tile placements.

IS005 - Similarity: Not searched; requires GitHub issue search before execution.

* IS005 - issue_number: {{TEMP-5}}
* IS005 - title: feat(mosaic): generate fixed-grid tesserae with saliency refinements
* IS005 - state: open
* IS005 - labels: feature
* IS005 - milestone: none
* IS005 - assignees: none

### IS005 - body

```markdown
## Summary

Generate deterministic patch-compatible tile placements using a fixed-grid baseline, historical palette quantization, and saliency-driven refinement.

## Acceptance Criteria

- [ ] The generated payload covers the bounded patch without illegal overlap.
- [ ] Salient contours receive higher density or more coherent orientation than low-detail regions.
- [ ] Conflict resolution uses deterministic tie-breaking.
- [ ] Tile count stays within configured snapshot, payload, and import budgets.
- [ ] Output uses only app-supported shape, material, color, coordinate, and rotation contracts.
```

### IS005 - Relationships

* IS005 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS005 - depends-on - {{TEMP-4}}: Requires preprocessing artifacts
* IS005 - blocks - {{TEMP-6}}: Fidelity scoring consumes generated payload
* IS005 - blocks - {{TEMP-7}}: Client importer consumes generated payload

## IS006 - Create - Fidelity scoring report

Create the machine-readable scoring issue for objective fidelity gates.

IS006 - Similarity: Not searched; requires GitHub issue search before execution.

* IS006 - issue_number: {{TEMP-6}}
* IS006 - title: feat(mosaic): emit machine-readable Alexander patch fidelity reports
* IS006 - state: open
* IS006 - labels: feature
* IS006 - milestone: none
* IS006 - assignees: none

### IS006 - body

```markdown
## Summary

Add the offline scoring step that compares the generated patch against the normalized source and records release-blocking fidelity metrics.

## Acceptance Criteria

- [ ] The report includes luminance MS-SSIM, edge F1, directional divergence, silhouette IoU, weighted score, tile count, and conflict count.
- [ ] The weighted score uses 0.30 MS-SSIM_L + 0.25 EdgeF1 + 0.25 (1 - D_theta) + 0.20 SilhouetteIoU.
- [ ] Thresholds and failure reasons are machine-readable.
- [ ] The score can be reproduced from the manifest, source checksum, generated payload, and scoring command.
```

### IS006 - Relationships

* IS006 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS006 - depends-on - {{TEMP-5}}: Requires generated payload
* IS006 - blocks - {{TEMP-11}}: Visual acceptance consumes score report

## IS007 - Create - Client import parser and preflight validation

Create the client importer domain issue that prevents malformed payloads from emitting socket mutations.

IS007 - Similarity: Not searched; requires GitHub issue search before execution.

* IS007 - issue_number: {{TEMP-7}}
* IS007 - title: feat(client): parse and preflight mosaic import payloads
* IS007 - state: open
* IS007 - labels: feature
* IS007 - milestone: none
* IS007 - assignees: none

### IS007 - body

```markdown
## Summary

Add a client domain importer that parses patch payloads and rejects malformed imports before any socket placement event is emitted.

## Acceptance Criteria

- [ ] The parser validates manifest version, patch topology, tile contracts, normalized colors, deterministic transforms, and conflict policy.
- [ ] Malformed payloads return actionable validation errors without partial writes.
- [ ] Import state remains separate from ordinary manual placement state.
- [ ] Unit tests cover malformed payloads and deterministic validation behavior.
```

### IS007 - Relationships

* IS007 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS007 - depends-on - {{TEMP-3}}: Requires payload schema
* IS007 - depends-on - {{TEMP-5}}: Requires representative generated payload
* IS007 - blocks - {{TEMP-8}}: Import queue consumes validated payloads

## IS008 - Create - Revision-safe client import queue

Create the client orchestration issue that uses the existing placement event with bounded, revision-aware windows.

IS008 - Similarity: Not searched; requires GitHub issue search before execution.

* IS008 - issue_number: {{TEMP-8}}
* IS008 - title: feat(client): import mosaic placements through bounded revision-safe windows
* IS008 - state: open
* IS008 - labels: feature
* IS008 - milestone: none
* IS008 - assignees: none

### IS008 - body

```markdown
## Summary

Wire mosaic imports into the existing client placement mutation path using bounded windows, expected patch revisions, acknowledgement reconciliation, and deterministic retry or skip behavior.

## Acceptance Criteria

- [ ] Imports reuse the existing quilt placement event and never use direct SQL or a new mutation event.
- [ ] Expected patch revisions are computed before each emission or bounded window.
- [ ] In-flight placement work is capped by configuration.
- [ ] Stale revisions retry with refreshed state and terminate after the configured limit.
- [ ] ACK, timeout, stale revision, and conflict outcomes are observable in the import report.
```

### IS008 - Relationships

* IS008 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS008 - depends-on - {{TEMP-7}}: Requires validated import payloads
* IS008 - blocks - {{TEMP-9}}: Server verification consumes imported placements
* IS008 - blocks - {{TEMP-10}}: E2E tests consume client orchestration

## IS009 - Create - Server persistence and replay verification

Create server-side verification tests for the unchanged write and replay path.

IS009 - Similarity: Not searched; requires GitHub issue search before execution.

* IS009 - issue_number: {{TEMP-9}}
* IS009 - title: test(server): verify mosaic imports use canonical persistence and replay path
* IS009 - state: open
* IS009 - labels: maintenance
* IS009 - milestone: none
* IS009 - assignees: none

### IS009 - body

```markdown
## Summary

Verify imported placements pass through the unchanged server socket guard, placement validation, canonical persistence, operation append, revision increment, snapshot, and replay loaders.

## Acceptance Criteria

- [ ] Imported tiles persist transactionally and replay identically after reconnect.
- [ ] Patch revisions and operation sequence numbers remain monotonic.
- [ ] No database migration is introduced for the first version.
- [ ] Optional provenance metadata is added only if the existing payload contract permits it.
- [ ] Tests cover the nearest socket, repository, snapshot, and replay boundaries.
```

### IS009 - Relationships

* IS009 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS009 - depends-on - {{TEMP-8}}: Requires importer path
* IS009 - blocks - {{TEMP-10}}: Full import regression depends on persistence verification

## IS010 - Create - Import regression and reconnect tests

Create focused tests spanning client, server, and end-to-end reconnect convergence.

IS010 - Similarity: Not searched; requires GitHub issue search before execution.

* IS010 - issue_number: {{TEMP-10}}
* IS010 - title: test(mosaic): cover deterministic import retries conflicts and reconnect convergence
* IS010 - state: open
* IS010 - labels: maintenance
* IS010 - milestone: none
* IS010 - assignees: none

### IS010 - body

```markdown
## Summary

Add focused client, server, and end-to-end tests for deterministic import behavior and reconnect convergence.

## Acceptance Criteria

- [ ] Tests cover contract validation, deterministic output, bounded queue behavior, stale revision retry, conflict skipping, acknowledgement reconciliation, and payload budget handling.
- [ ] Server tests cover persistence and replay for imported placements.
- [ ] End-to-end coverage proves a bounded patch imports to the same final state on a clean client and after reconnect.
- [ ] Existing manual placement tests continue to pass without behavioral changes.
```

### IS010 - Relationships

* IS010 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS010 - depends-on - {{TEMP-7}}: Requires parser validation
* IS010 - depends-on - {{TEMP-8}}: Requires client import orchestration
* IS010 - depends-on - {{TEMP-9}}: Requires server persistence verification

## IS011 - Create - Visual fidelity acceptance harness

Create release-blocking visual acceptance checks and human QA handoff.

IS011 - Similarity: Not searched; requires GitHub issue search before execution.

* IS011 - issue_number: {{TEMP-11}}
* IS011 - title: test(mosaic): enforce visual fidelity acceptance for Alexander patch
* IS011 - state: open
* IS011 - labels: maintenance, documentation
* IS011 - milestone: none
* IS011 - assignees: none

### IS011 - body

```markdown
## Summary

Add release-blocking visual acceptance checks for the generated patch and retain reproducible score evidence.

## Acceptance Criteria

- [ ] The generated patch is rendered or rasterized through the intended comparison path.
- [ ] Weighted fidelity, silhouette overlap, edge continuity, tile count, and conflict thresholds block release when they fail.
- [ ] A reviewer can reproduce the score from the manifest, source checksum, generated payload, and scoring command.
- [ ] The first benchmark pack receives explicit human visual QA.
- [ ] A design or decision record is added if the project requires one for this benchmark.
```

### IS011 - Relationships

* IS011 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS011 - depends-on - {{TEMP-6}}: Requires fidelity score report
* IS011 - depends-on - {{TEMP-10}}: Requires import regression coverage
* IS011 - blocks - {{TEMP-12}}: Final validation consumes visual acceptance evidence

## IS012 - Create - Final validation and release handoff

Create the closing validation issue for full project checks, isolated fixes, and residual risk capture.

IS012 - Similarity: Not searched; requires GitHub issue search before execution.

* IS012 - issue_number: {{TEMP-12}}
* IS012 - title: chore(mosaic): run final validation and capture Alexander patch handoff
* IS012 - state: open
* IS012 - labels: maintenance
* IS012 - milestone: none
* IS012 - assignees: none

### IS012 - body

```markdown
## Summary

Run the full validation suite for the Alexander mosaic patch work, apply isolated fixes, and record any blockers that require follow-on planning.

## Acceptance Criteria

- [ ] Lint, build, unit tests, focused end-to-end tests, and fidelity threshold checks pass.
- [ ] Minor lint, typing, fixture, or threshold corrections are applied only when isolated.
- [ ] Issues requiring protocol changes, schema design, or algorithm redesign are captured as follow-on work instead of expanding first-version scope.
- [ ] Required development and test ports are free after validation completes.
- [ ] Final handoff summarizes validation status, generated artifacts, and remaining risks.
```

### IS012 - Relationships

* IS012 - sub-issue-of - {{TEMP-1}}: Parent feature tracker
* IS012 - depends-on - {{TEMP-10}}: Requires test suite coverage
* IS012 - depends-on - {{TEMP-11}}: Requires visual acceptance evidence

<!-- markdown-table-prettify-ignore-end -->
