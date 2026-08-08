---
applyTo: '.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Fantome Resident Agent Implementation

## Overview

Implement the read-only Fantome resident-agent MVP as a separate Python Microsoft Agent Framework worker with a restricted PostgreSQL control plane and typed app-only server HTTP reads that preserve TypeScript server authority over canonical quilt behavior.

## Objectives

### User Requirements

* Convert the accepted resident-agent architecture into an implementation-ready plan for the Mosaic Agents MVP. Source: user-provided task-plan prompt and .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 9-15)
* Use the provided research file as planning input. Source: prompt:task-plan.prompt.md requirement and attached research file.
* Summarize planning outcomes, created implementation plan files, and deferred scope items. Source: prompt:task-plan.prompt.md requirements.

### Derived Objectives

* Preserve TypeScript server authority for canonical quilt reads and writes. Derived from: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 4-7, 148-155)
* Add explicit agent identity support without automatic provisioning. Derived from: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 69-81, 287-290)
* Implement durable one-active-workflow-per-quilt behavior through a restricted control-plane schema. Derived from: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 28-33, 157-162)
* Stage model provider use behind fake-gateway validation, governance, telemetry, and feature gates. Derived from: .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md (Lines 295-300, 330-338)

## Context Summary

### Project Files

* docs/fantome-resident-agent-architecture.md - Accepted v1 architecture decision referenced by the research.
* apps/server/src/auth/tokenVerifier.ts - Existing delegated-token verifier that needs a separate app-role branch.
* apps/server/src/auth/principalContext.ts - Existing principal resolution path that auto-provisions humans and needs explicit agent rejection semantics.
* apps/server/src/auth/httpAuth.ts - Server-derived principal context attachment point for worker route authentication.
* apps/server/src/db/schema.ts - Principal-kind and control-plane schema anchor.
* apps/server/src/db/types.ts - Principal-kind type anchor.
* apps/server/src/db/repository.ts - Authorization-aware canonical read and existing lease/transaction pattern anchor.
* apps/server/src/index.ts - Route registration anchor for worker-only HTTP reads.
* apps/server/src/telemetry.ts - Azure Monitor telemetry integration anchor.
* infra/bicep/main.bicep - Existing Container Apps, private PostgreSQL, and telemetry deployment anchor.
* e2e/quilt-reconnect.spec.ts - Multi-replica and recovery contract-test anchor after worker fixtures exist.

### References

* .copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md - Primary research source for scope, selected approach, code anchors, alternatives, and validation sequence.
* .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md - Step-by-step implementation details and validation commands.
* .copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md - Discrepancies, alternate paths, and follow-on work.
* Microsoft Agent Framework overview - External confirmation for Python `agent-framework` package and agent/workflow distinction.
* Microsoft Agent Framework workflows overview - External confirmation for graph workflows, typed routing, executors, events, and checkpoints.
* Microsoft Entra access-token claims reference - External confirmation that app-only permissions use `roles` while delegated permissions use `scp`.
* Microsoft protected web API app registration documentation - External confirmation for protected API token validation requirements.

### Standards References

* No repository-local .github/copilot-instructions.md file was found during planning.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md - Markdown structure and frontmatter guidance; `.copilot-tracking` files include `<!-- markdownlint-disable-file -->` as required by Task Planner mode.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md - Clear, professional markdown writing conventions.

## Implementation Checklist

### [x] Implementation Phase 1: Server Identity and Read Contracts

<!-- parallelizable: false -->

Sequential because worker read contracts depend on principal-kind support and app-only auth before they can be safely exposed.

* [x] Step 1.1: Extend principal model for agents.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 12-37)
* [x] Step 1.2: Add app-only authentication branch.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 38-64)
* [x] Step 1.3: Create worker-only HTTP read routes.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 65-90)
* [x] Step 1.4: Validate server phase changes.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 91-99)

### [x] Implementation Phase 2: Agent Control Plane and Trigger Semantics

<!-- parallelizable: false -->

Sequential because control-plane assignments and leases depend on the final agent principal representation from Phase 1.

* [x] Step 2.1: Add control-plane schema and restricted role.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 105-132)
* [x] Step 2.2: Define initial trigger ingestion contract.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 133-156)
* [x] Step 2.3: Validate control-plane phase changes.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 157-164)

### [x] Implementation Phase 3: Python Worker MVP

<!-- parallelizable: false -->

Sequential because the worker needs the app-only server read route and control-plane schema contracts before its supervisor and tools can be tested realistically.

* [x] Step 3.1: Scaffold the Python Agent Framework worker.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 170-204)
* [x] Step 3.2: Add governed model gateway integration.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 205-231)
* [x] Step 3.3: Validate worker phase changes.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 232-239)
  * Note: Syntax and container validation passed; the required pytest command remains blocked because the host lacks pytest tooling.

### [ ] Implementation Phase 4: Deployment, Telemetry, and Feature Gates

<!-- parallelizable: false -->

Sequential because deployment must consume the worker image, managed identity requirements, restricted database role, and feature-gated runtime settings from earlier phases.

* [x] Step 4.1: Add worker deployment resources.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 245-271)
* [x] Step 4.2: Add telemetry and operational evidence.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 272-296)
* [x] Step 4.3: Validate deployment phase changes.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 297-304)
  * Note: Template, parameter, worker syntax, and Docker validation passed; Entra role assignment, Foundry RBAC, and server-side environment wiring remain deployment-specific blockers.

### [ ] Implementation Phase 5: End-to-End Validation and Activation

<!-- parallelizable: false -->

Sequential final validation because it verifies behavior across server auth, PostgreSQL leases, worker recovery, infrastructure, telemetry, and e2e fixtures.

* [ ] Step 5.1: Add multi-replica and recovery tests.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 310-336)
  * Note: In-memory and control-plane recovery coverage passed; app-token route coverage is now present through `agentReads.auth` tests and a live startup-registered route integration test; skip-gated PostgreSQL `PostgresControlPlane` contention and checkpoint resume coverage is present; real two-process worker restart evidence remains.
* [ ] Step 5.2: Run full project validation.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 337-348)
  * Note: Server tests/build, worker compileall, Docker build, and focused reconnect Playwright validation passed; worker pytest remains blocked because `pytest` is not installed in the host Python environment and local venv creation is unavailable.
* [x] Step 5.3: Fix minor validation issues.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 349-352)
* [x] Step 5.4: Report blocking issues.
  * Details: .copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md (Lines 353-355)

## Planning Log

See .copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

Key references:
* Discrepancy Log: .copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md (Lines 4-44)
* Implementation Paths Considered: .copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md (Lines 46-76)
* Suggested Follow-On Work: .copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md (Lines 78-93)

## Dependencies

* Node.js and npm for the existing TypeScript server, migrations, and e2e tests.
* Python runtime and package manager for `apps/agent-worker`.
* Microsoft Agent Framework Python package.
* PostgreSQL integration-test environment and migration tooling.
* Docker for worker container validation.
* Azure CLI with Bicep support for infrastructure validation.
* Azure Entra app-role configuration and managed identity assignment.
* Azure AI Foundry endpoint for post-fake-gateway activation.

## Success Criteria

* Agent auth accepts only app-only tokens with the configured `agent.runtime` role and maps only to active pre-provisioned agent principals. Traces to: user requirement for authentication and principal coverage, and research Lines 69-81, 119-126.
* Worker HTTP reads reuse server-owned authorization-aware repository reads and expose no canonical mutation path. Traces to: server authority requirement and research Lines 82-88, 150-155.
* Restricted control-plane schema enforces one active workflow per quilt, lease renewal ownership, trigger deduplication, and durable checkpoint recovery. Traces to: one-active-workflow and recovery requirements, and research Lines 157-162, 293-294.
* Python Agent Framework worker completes fake-gateway read-only flow before Foundry activation. Traces to: selected approach and activation sequence, and research Lines 295-300, 330-338.
* Worker deployment adds an independently scalable Container App with managed identity, restricted database access, Azure Monitor telemetry, and disabled-by-default activation gates. Traces to: deployment requirements and research Lines 93-95, 301-302, 340-355.
* Validation covers token verification, principal mapping, server read-route contracts, lease races, trigger deduplication, checkpoint recovery, gateway fallback, and multi-replica recovery. Traces to: validation anchors and research Lines 319-328.
