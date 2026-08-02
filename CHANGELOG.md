---
title: Changelog
description: Release notes and notable changes by version.
---

## Changelog

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
