---
title: Changelog
description: Release notes and notable changes by version.
---

## Changelog

## [1.3.3](https://github.com/dkirby-ms/zzyix/compare/v1.3.2...v1.3.3) (2026-08-02)

### Bug Fixes

* **client:** preserve cached tiles after placement ([2a2344b](https://github.com/dkirby-ms/zzyix/commit/2a2344bc6a34fc182e79a291225039cf105972f0))

### Tests

* **canvas:** cover incremental tile retention ([ea160ef](https://github.com/dkirby-ms/zzyix/commit/ea160efb8cfd8f369f5cd09ba84cc85bb7e08bd6))
* **e2e:** align canvas fixture identity and materials ([60d8ecd](https://github.com/dkirby-ms/zzyix/commit/60d8ecddf299bd1227a006b7363e1d5644b6627c))

### Miscellaneous Chores

* esbuild cleanup ([8ff186b](https://github.com/dkirby-ms/zzyix/commit/8ff186be85c836212a54211ae8d543d0e675a226))
* remove manual test file ([7827e0b](https://github.com/dkirby-ms/zzyix/commit/7827e0b8eb49eda5b4e103a3f3aefe2954cdb853))

## [1.3.2](https://github.com/dkirby-ms/zzyix/compare/v1.3.1...v1.3.2) (2026-08-02)

### Bug Fixes

* **canvas:** expose quilt-wide occupancy in minimap ([20959a7](https://github.com/dkirby-ms/zzyix/commit/20959a76cc0f90531c7c2cf9a20dc90a3c2d8f68))

## [1.3.1](https://github.com/dkirby-ms/zzyix/compare/v1.3.0...v1.3.1) (2026-08-02)

### Bug Fixes

* preserve quilt tiles across chunk-scoped snapshots ([7c529fa](https://github.com/dkirby-ms/zzyix/commit/7c529fae2d71158d86b82a10612d31d24fbb501b))

## [1.3.0](https://github.com/dkirby-ms/zzyix/compare/v1.2.0...v1.3.0) (2026-08-02)

### Features

* add large-square, circle, right-triangle, large-right-triangle to placement pipeline ([5651dfa](https://github.com/dkirby-ms/zzyix/commit/5651dfafe0115e5328617e00220715dd910e1a13))
* add support for large-square, circle, right-triangle, and large-right-triangle tile shapes ([9d672ac](https://github.com/dkirby-ms/zzyix/commit/9d672ac426a96b726eb3dafbbd8547955dc812dd))

### Bug Fixes

* allow all tile shapes in server placement validation ([4b31825](https://github.com/dkirby-ms/zzyix/commit/4b31825352115f12c9642f5ab1597f81b1c59905))
* circles not placing correctly ([836f98c](https://github.com/dkirby-ms/zzyix/commit/836f98c0f49e2c3b8ffae186eb94a3f9f373c4d0))
* **client:** reset animation after tile acknowledgement ([039a21b](https://github.com/dkirby-ms/zzyix/commit/039a21b959de21289b352efe78b6e56fa2cad656))
* **client:** use current pointer state for tile placement ([d65fb72](https://github.com/dkirby-ms/zzyix/commit/d65fb724b7d87c6fa1c4eb5764771f6235c40f59))
* **realtime:** prevent viewport subscription overload ([c21e496](https://github.com/dkirby-ms/zzyix/commit/c21e49633fd66bb4ca0ee298541d7b4beb4f4d90))
* **workflows:** unify changelog release history ([5b2d41a](https://github.com/dkirby-ms/zzyix/commit/5b2d41a40bcfb023457e2440140bbd1d247a5260))

### Miscellaneous Chores

* fix release workflow permissions ([77592c3](https://github.com/dkirby-ms/zzyix/commit/77592c3829d290866bdc99da63533050fa61c1ad))
* release bugs ([66af2e9](https://github.com/dkirby-ms/zzyix/commit/66af2e96a3efe0c1ab1fc7bad444ff88b7eb2df3))

Client and server changes are released together. Releases before the unified workflow retain
links to their original component tags.

## 1.2.0 (2026-08-01)

Released as [client-v1.2.0](https://github.com/dkirby-ms/zzyix/releases/tag/client-v1.2.0)
and [server-v1.2.0](https://github.com/dkirby-ms/zzyix/releases/tag/server-v1.2.0).

### Features

* Streamline the product layout and user experience

### Bug Fixes

* Fix client end-to-end failures after the UX changes
* Correct a failing client assertion after the UX changes

## 1.1 Patch Releases (2026-08-01)

The client and server used independent patch versions during this release series.

### Client 1.1.2

Released as [client-v1.1.2](https://github.com/dkirby-ms/zzyix/releases/tag/client-v1.1.2).

#### Bug Fixes

* Add missing rate limits and remediate CodeQL findings
* Handle cross-canvas `anchor_patch_id` restrictions during database purge
* Replace `psql` variable interpolation with UUID-validated shell expansion
* Repair semantic-release changelog generation

#### Tests

* Add regression coverage for `database-purge.sh`
* Make the purge regression seed idempotent for an existing canvas

#### Continuous Integration

* Remove legacy release gates and the Dependabot auto-merge workflow

### Server 1.1.4

Released as [server-v1.1.4](https://github.com/dkirby-ms/zzyix/releases/tag/server-v1.1.4).
This release contained no additional notable changes.

### Server 1.1.3

Released as [server-v1.1.3](https://github.com/dkirby-ms/zzyix/releases/tag/server-v1.1.3).

#### Bug Fixes

* Handle cross-canvas `anchor_patch_id` restrictions during database purge
* Replace `psql` variable interpolation with UUID-validated shell expansion

#### Tests

* Add regression coverage for `database-purge.sh`
* Make the purge regression seed idempotent for an existing canvas

#### Documentation

* Fix changelog release note sections

### Server 1.1.2

Released as [server-v1.1.2](https://github.com/dkirby-ms/zzyix/releases/tag/server-v1.1.2).

#### Continuous Integration

* Remove legacy release gates

### Client 1.1.1

Released as [client-v1.1.1](https://github.com/dkirby-ms/zzyix/releases/tag/client-v1.1.1).

#### Continuous Integration

* Fix NGINX authentication header forwarding

## 1.1.0 (2026-07-31)

Released as [client-v1.1.0](https://github.com/dkirby-ms/zzyix/releases/tag/client-v1.1.0)
and [server-v1.1.0](https://github.com/dkirby-ms/zzyix/releases/tag/server-v1.1.0).

### Features

* Converge the product on the canonical infinite canvas
* Add the toroidal quilt canary architecture
* Add authenticated ownership and mutation lifecycle management
* Assign canonical patches automatically
* Add the authenticated infinite canvas prototype and documentation

### Bug Fixes

* Remediate authorization and rollout review findings
* Fix the authentication login loop
* Resolve canonical recovery and rollout defects
* Secure canonical reconnect lineage and cross-replica retirement telemetry
* Enforce canonical retirement evidence validation
* Complete the ownership workflow and rollout controls
* Stabilize concurrent assignment, client, purge, and end-to-end tests
* Align database purge behavior with PostgreSQL 18

### Build System

* Update safe development dependencies

### Operations

* Add identity and migration release prerequisites

### Continuous Integration

* Enforce exclusive migration release workflows
* Add database secret handling and improve CD reliability

## 1.0.1 (2026-07-30)

Released as [client-v1.0.1](https://github.com/dkirby-ms/zzyix/releases/tag/client-v1.0.1)
and [server-v1.0.1](https://github.com/dkirby-ms/zzyix/releases/tag/server-v1.0.1).
These releases contained no additional notable changes.

## 1.0.0 (2026-07-29)

Released as [client-v1.0.0](https://github.com/dkirby-ms/zzyix/releases/tag/client-v1.0.0)
and [server-v1.0.0](https://github.com/dkirby-ms/zzyix/releases/tag/server-v1.0.0).

* Initial client and server release
