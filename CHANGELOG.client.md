## [1.2.0](https://github.com/dkirby-ms/zzyix/compare/client-v1.1.2...client-v1.2.0) (2026-08-01)

### Features

* UX improvements and streamlining ([0f37843](https://github.com/dkirby-ms/zzyix/commit/0f37843524362957529e8a5e257afb9dd3e1e078))

### Bug Fixes

* **client:** e2e test failures after ux changes ([fdd0814](https://github.com/dkirby-ms/zzyix/commit/fdd08145fc1c20eb4a045fe387b96314aa002952))
* **client:** test failing assertion after ux changes ([c22b93d](https://github.com/dkirby-ms/zzyix/commit/c22b93d13e110d49b207c854be573b0c675dd940))

## [1.1.2](https://github.com/dkirby-ms/zzyix/compare/client-v1.1.1...client-v1.1.2) (2026-08-01)

### Bug Fixes

* **ci:** semantic relesae changelog bugs ([284db51](https://github.com/dkirby-ms/zzyix/commit/284db5102fa0a613cf5688967323b3994b1973f5))
* **client:** missing rate limits / codeql remediation ([2378577](https://github.com/dkirby-ms/zzyix/commit/237857772b34262c911b6c7f16bcd064ba0de500))
* handle cross-canvas anchor_patch_id RESTRICT violation in purge_canvas ([855c677](https://github.com/dkirby-ms/zzyix/commit/855c6776013358a0b9fa039fd9dfa65e2cd17146))
* replace psql variable interpolation with UUID-validated shell expansion in purge_canvas ([8f1cdb4](https://github.com/dkirby-ms/zzyix/commit/8f1cdb4c59d8a3d3dd459a7c97bdb46b569f32fe))

### Tests

* add regression tests for database-purge.sh (db:purge) ([3d3079f](https://github.com/dkirby-ms/zzyix/commit/3d3079fc862a394388cccda93c357e6fbfd72056))
* **server:** make purge regression seed idempotent for existing canvas ([d90520e](https://github.com/dkirby-ms/zzyix/commit/d90520e871d18691104cdc1657f184b29043e629))

### Miscellaneous Chores

* **ci:** remove dependabot auto-merge workflow ([3f86aed](https://github.com/dkirby-ms/zzyix/commit/3f86aed370cc8e0cab7ef6970e90dda9945988a3))
* **ci:** remove legacy gating checks ([d377d79](https://github.com/dkirby-ms/zzyix/commit/d377d792924d65839e6ee3fa6a65bf66e3259b74))
* fix release bugs ([d0070bc](https://github.com/dkirby-ms/zzyix/commit/d0070bc913be408f8f88d2cfe285ba45f4df269a))
* **release:** server-v1.1.2 [skip ci] ([38e8e8b](https://github.com/dkirby-ms/zzyix/commit/38e8e8b39fbd25bcddd02f88a7e30fa0cb74639d))
* **release:** server-v1.1.3 [skip ci] ([f3b9e60](https://github.com/dkirby-ms/zzyix/commit/f3b9e60b4ca851a294c591070ae2836388cc1ff9))
* **release:** server-v1.1.4 [skip ci] ([50f7057](https://github.com/dkirby-ms/zzyix/commit/50f705754b5f725d4595e69f0c70b27715e094b9))
* remediate missing changelog entries ([b17c326](https://github.com/dkirby-ms/zzyix/commit/b17c326a3dd91a62b9b2ec6fdf9ef60728f09163))

## [1.1.1](https://github.com/dkirby-ms/zzyix/compare/client-v1.1.0...client-v1.1.1) (2026-08-01)

### Continuous Integration

* fix nginx auth header forwarding

## [1.1.0](https://github.com/dkirby-ms/zzyix/compare/client-v1.0.1...client-v1.1.0) (2026-07-31)

### Features

* converge product on canonical infinite canvas
* add toroidal quilt canary architecture
* add authenticated ownership and mutation lifecycle
* assign canonical patches automatically
* add infinite canvas prototype with user authentication and documentation

### Bug Fixes

* remediate authorization and rollout review findings
* remediate login loop bug
* resolve canonical, recovery, and rollout defects
* secure canonical reconnect lineage
* secure cross-replica retirement telemetry
* enforce canonical retirement evidence validation
* fix e2e coverage for concurrent automatic patch assignments
* fix missing client tests and e2e claim behavior
* fix database purge script and Postgres 18 alignment
* fix CI E2E stability after merge

### Build System

* bump safe development dependencies group

### Operations

* add identity and migration release prerequisites

### Continuous Integration

* enforce exclusive migration release workflows

## [1.0.1](https://github.com/dkirby-ms/zzyix/compare/client-v1.0.0...client-v1.0.1) (2026-07-30)

---
title: Client changelog
description: Published release history for the zzyix client app.
---

# Changelog

## 1.0.0 (2026-07-29)

* Initial client release
