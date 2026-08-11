<!-- markdownlint-disable-file -->

# Plan: Alexander Feature Retirement

## User Requests

* Continue all three suggested work items from the prior discovery phase.
* Remove Alexander E2E specs and fixtures.
* Purge the Alexander offline pipeline and outputs.
* Remove remaining related documentation and user-facing references.

## Overview

Retire every active Alexander-specific feature artifact while preserving generic mosaic product behavior and historical workflow records.

## Context Summary

* Research: `.copilot-tracking/research/2026-08-11/alexander-feature-retirement-research.md`
* Markdown conventions: `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md`
* Writing conventions: `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md`
* Runtime feature removal completed in client and server source before this continuation.

## Implementation Checklist

1. [x] Remove E2E spec, fixture, package invocation, and multi-replica environment wiring. <!-- parallelizable: false -->
2. [x] Remove Alexander scripts, dedicated script tests, and root package commands. <!-- parallelizable: true -->
3. [x] Remove offline generated artifacts, provenance data, and dedicated provenance documentation. <!-- parallelizable: true -->
4. [x] Scan first-party files for active Alexander references and repair any dangling references. <!-- parallelizable: false -->
5. [x] Build and test client and server. <!-- parallelizable: false -->
6. [x] Review request fulfillment and record final changes. <!-- parallelizable: false -->

## Dependencies

* Generic mosaic import and tile placement remain supported.
* Historical `.copilot-tracking` files remain unchanged except for this retirement workflow.
* Third-party dependency metadata is outside feature scope.

## Success Criteria

* No active first-party Alexander E2E, script, config, data, or documentation files remain outside historical tracking.
* Root package scripts do not invoke removed files.
* Multi-replica E2E continues to target the remaining reconnect scenario.
* Client and server builds pass.
* Client and server tests pass, or unrelated pre-existing failures are documented.
