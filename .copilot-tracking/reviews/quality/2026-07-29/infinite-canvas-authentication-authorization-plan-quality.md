<!-- markdownlint-disable-file -->
# Implementation Quality: Infinite-Canvas Authentication and Authorization

## Metadata

* Review date: 2026-07-29
* Scope: Full quality
* Plan: `.copilot-tracking/plans/2026-07-28/infinite-canvas-authentication-authorization-plan.instructions.md`
* Changes: `.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md`
* Research: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`

## Status

Failed: 2 Critical, 9 Major, 2 Minor.

## Critical Findings

### IV-001 Protocol-v2 replay bypasses authorization

Placement and removal look up a client-supplied operation ID before validating the quilt, authenticated actor, current lifecycle, ownership, or policy. Another principal can replay an operation and receive an accepted acknowledgement containing event and tile information. Bind an immutable command fingerprint to actor, quilt, command type, payload, and committed response.

Evidence: `apps/server/src/db/repository.ts` placement and removal replay paths.

### IV-002 Account deletion cannot complete operationally

The deletion job accepts one supplied principal and always passes `retentionApproved: false`. It cannot enumerate due principals or consume deployment approvals, and no runnable package command exists. Implement an approval-aware due-account job and cover successful completion.

Evidence: `apps/server/src/jobs/principalDeletion.ts` and `apps/server/package.json`.

## Major Findings

### IV-003 Ownership idempotency is not actor and payload bound

Claim, transfer, acceptance, cancellation, abandonment, and recovery can replay success based primarily on operation ID and event type. Bind each replay to the canonical actor and immutable command payload.

### IV-004 Body-bearing authenticated requests cannot retry after 401

The first request consumes the source body, so constructing the renewed POST request fails. Existing tests cover only bodyless requests.

Evidence: `apps/client/src/network/authenticatedFetch.ts` and its tests.

### IV-005 WebSocket handshakes lack exact-origin enforcement

Socket.IO relies on CORS configuration without an explicit handshake predicate for exact allowed-origin validation.

### IV-006 Policy permits anonymous public aggregate data

The central policy retains an anonymous public aggregate path that contradicts the authenticated-only baseline.

### IV-007 CD does not validate CORS as an exact HTTPS origin

The workflow forwards the configured CORS value without enforcing the exact absolute HTTPS origin contract. Fresh Phase 1 validation found the published staging value malformed.

### IV-008 Restricted recovery is not provisioned end to end

CD invokes a named recovery job, but repository infrastructure does not provision that job or its least-privilege role.

### IV-009 Multi-replica authentication is not enforced by CI

The authenticated multi-replica script exists and passes locally, but CI runs only the owner-only single-replica suite.

### IV-010 Required security and lifecycle scenarios are absent

Coverage gaps include cross-principal replay, delayed immutable replay, mixed-patch authority, authenticated ownership HTTP routes, failed-renewal browser clearing, and claim, transfer, and abandonment E2E.

### IV-011 Production benchmark approval is absent from startup gates

The benchmark records production approval as false, while mutation startup approval omits a benchmark gate.

## Minor Findings

### IV-012 Moderate dependency advisories

The audit reports four moderate `esbuild` advisories in the pinned Drizzle toolchain.

### IV-013 Client bundle size

The production client build passes with chunks above Vite's 500 kB warning threshold.

## Conforming Areas

Identity verification, exact issuer and subject principal mapping, lifecycle rejection, protected HTTP middleware, test-issuer isolation, and normal first-commit mutation transactions conform to the intended architecture. Production mutation remains disabled, containing IV-001, but the implementation is not ready for mutation enablement or full production acceptance.
