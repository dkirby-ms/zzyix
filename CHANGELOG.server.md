## [1.1.4](https://github.com/dkirby-ms/zzyix/compare/server-v1.1.3...server-v1.1.4) (2026-08-01)

## [1.1.3](https://github.com/dkirby-ms/zzyix/compare/server-v1.1.2...server-v1.1.3) (2026-08-01)

### Bug Fixes

* replace psql variable interpolation with UUID-validated shell expansion in `purge_canvas`
* handle cross-canvas `anchor_patch_id` RESTRICT violation in `purge_canvas`

### Tests

* make purge regression seed idempotent for existing canvas
* add regression tests for `database-purge.sh` (`db:purge`)

### Documentation

* fix changelog release note sections

## [1.1.2](https://github.com/dkirby-ms/zzyix/compare/server-v1.1.1...server-v1.1.2) (2026-08-01)

### Continuous Integration

* remove legacy gating checks

## [1.1.1](https://github.com/dkirby-ms/zzyix/compare/server-v1.1.0...server-v1.1.1) (2026-07-31)

### Bug Fixes

* fix release gate behavior on server release path
* retire legacy workflow checks

### Continuous Integration

* add CI handling for database secret issues
* update CI workflow for CD/server reliability

## [1.1.0](https://github.com/dkirby-ms/zzyix/compare/server-v1.0.1...server-v1.1.0) (2026-07-31)

### Features

* add authenticated ownership and mutation lifecycle
* add toroidal quilt canary architecture
* converge product on canonical infinite canvas
* assign canonical patches automatically

### Bug Fixes

* enforce canonical retirement evidence validation
* secure canonical reconnect lineage
* secure cross-replica retirement telemetry
* remediate authorization and rollout review findings
* complete ownership workflow and rollout controls

### Continuous Integration

* enforce exclusive migration release workflows
* align database purge behavior and Postgres 18 workflows

### Operations

* add identity and migration release prerequisites

## [1.0.1](https://github.com/dkirby-ms/zzyix/compare/server-v1.0.0...server-v1.0.1) (2026-07-30)

---
title: Server changelog
description: Published release history for the zzyix server app.
---

# Changelog

## 1.0.0 (2026-07-29)

* Initial server release
