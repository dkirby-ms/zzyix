---
title: Resident Agent Architecture Decision
description: Final architecture for deterministic resident agents, agent identity, authority boundaries, and future model use
ms.date: 2026-08-07
ms.topic: concept
keywords: [resident agents, agent identity, deterministic runtime, LLM, ownership, authorization]
---

## Status

Accepted for implementation. This decision closes issue [#185](https://github.com/dkirby-ms/zzyix/issues/185) and supersedes the resident-agent decision gate. It incorporates the approved identity, authority, and replica-behavior decisions supplied for this issue.

## Context

A resident agent must participate in the canonical quilt without creating a second authority model. The existing server owns authentication, principal resolution, patch ownership, tile validation, collision detection, revisions, idempotency, event ordering, and replica-safe transactions. The agent architecture must preserve those contracts while providing repeatable autonomous behavior.

An LLM is useful for the agent's expressive surface: personality, user interaction, and historical context about interesting artwork. It is not required to establish residency or execute a valid placement. The architecture therefore separates conversational intelligence from canvas authority. Model output can enrich an interaction, but it cannot become an implicit command channel for mutations.

## Decision

### Runtime model

Resident agents are deterministic TypeScript workers that act as ordinary authenticated API clients. The worker is a separate runtime boundary from `apps/server`; it does not import the server database, bypass HTTP or Socket.IO authorization, or mutate PostgreSQL directly.

The initial stack is:

* A small TypeScript agent-runner package or service in the monorepo
* The existing HTTPS API and Socket.IO protocol for reads, subscriptions, ownership commands, and tile mutations
* The existing PostgreSQL-backed server transactions and Socket.IO Postgres adapter as the source of truth
* A dedicated OAuth/OIDC issuer for agent credentials
* Structured deterministic policies for observation, target selection, placement generation, retry, backoff, and pause behavior

The worker may keep ephemeral process state and may persist agent-specific planning checkpoints only through a future, separately approved API. It must not treat local state as authoritative or infer ownership from a socket connection.

### LLM policy and hosting

Microsoft Foundry is the approved hosting platform for the conversational model. The first deployment uses the smallest low-latency Foundry-hosted model that meets the interaction and retrieval evaluation. A small model in the GPT-4o-mini class, or its current Foundry successor, is the initial candidate. The application must refer to a configurable Foundry deployment name and endpoint, not a hard-coded model marketing name, so model upgrades do not require an architecture change.

The LLM is approved for:

* Agent personality, tone, and natural-language responses
* User-facing conversation about the agent's current state and permitted capabilities
* Historical RAG context that retrieves approved source passages and uses them to explain artistic or cultural context

The LLM is not approved for:

* Tile placement, deletion, movement, color selection, or any other canvas mutation
* Patch claiming, ownership transfer, authorization, moderation, or identity decisions
* Revision, collision, idempotency, retry, or conflict decisions
* Direct access to PostgreSQL, internal credentials, arbitrary tools, or unrestricted application state

Deterministic behavior remains the production baseline for all canvas actions, tests, replay, incident analysis, and cost control. The agent runner may use a model response to answer a user, but its mutation loop remains the deterministic policy described below.

### Conversational and historical RAG plane

The conversational plane is a separate capability from the mutation plane. It receives only the minimum authorized context needed to answer a request, and it returns text or structured suggestions to the agent runner. The runner may ignore, summarize, or reject that output without changing canvas state.

Historical context uses a curated, versioned corpus with source metadata, attribution, publication date, and provenance. Retrieval is scoped to approved documents and returns citations or source references with the generated response. User-authored private content, hidden patch data, credentials, and authorization metadata are excluded unless a separate policy explicitly permits them. Corpus ingestion, embedding generation, and source licensing are release gates for the RAG feature.

Foundry access uses managed identity or an equivalent workload identity, with the endpoint and deployment name supplied through environment configuration. Secrets and model credentials are never sent to the browser or agent principal. Requests have bounded timeouts, token limits, retry budgets, and rate limits. A Foundry outage, quota failure, timeout, unsafe response, or retrieval miss degrades to a deterministic response such as a short status message, with no effect on tile operations.

Prompts, retrieved source IDs, model deployment identifier, response safety result, latency, token usage, and failure class are observable without storing unnecessary user content. Retention and redaction rules must be defined before production conversations are enabled.

A future change that uses an LLM as a placement proposer requires a new architecture decision and must preserve these conditions:

* Model output is untrusted input, never an authority grant or direct database command
* The deterministic agent policy and server validation remain able to reject every proposal
* The model cannot expand patch ownership, bypass revisions, suppress collision checks, or alter audit attribution
* The feature is disabled by default and can be disabled without revoking ordinary human behavior
* Prompts, model versions, candidate proposals, accepted decisions, and failures have an explicit privacy and retention policy
* Cost, latency, provider outage, reproducibility, and rollback criteria are measured before approval

### Identity and provisioning

Agents are first-class principals with `kind = 'agent'` and durable internal principal IDs. Each agent maps one-to-one to one external identity in the dedicated agent issuer. Agent principals are pre-provisioned by an administrative command or migration; normal agent authentication never auto-provisions an unknown identity.

The server validates issuer, audience, algorithm, required scope, expiry, and the external subject. It then resolves the subject through the existing external-principal mapping table and rejects an unmapped or inactive agent. Human and agent tokens use the same API audience and scope for now. Agent-specific service or team metadata is not required for this decision.

Provisioning must be auditable and must establish the principal mapping before a token can be used. Credential rotation changes the external credential, not the durable principal ID. Disabling an agent marks its principal inactive; existing sockets are allowed to expire normally and no forced disconnect protocol is introduced.

### Authority and ownership

Agents use the same command and event contracts as humans. The server remains authoritative for:

* Patch eligibility, claim quota, ownership transfer, and the one-active-patch rule
* Tile geometry validation, canonicalization, collision detection, and affected-patch calculation
* Expected revisions, stale-revision rejection, operation IDs, and idempotent retries
* Transaction ordering, durable history, authorization auditing, and replica-safe locking
* Visibility, presence, event delivery, and reconnect recovery

An active agent may claim, own, receive, and transfer a patch under the same rules as a human. Humans and agents may transfer ownership between each other. Extending eligibility means accepting `agent` wherever the ownership contract currently permits an eligible human principal; it does not create an agent bypass or a second quota.

The agent runner may decide what to attempt within its owned patch and may pause or retry after a normal protocol response. It may not claim authority from observation, write directly to a patch it does not own, mutate another principal's patch, forge actor identity, or treat a failed command as applied.

### Deterministic resident behavior

The first resident policy is intentionally small and replayable:

1. Authenticate using the configured agent identity.
2. Load `/me` and the canonical quilt state through the normal client protocol.
3. Reacquire the agent's active patch, or follow the normal claim flow when eligible.
4. Subscribe to authorized patch data and events.
5. Produce candidate operations from a versioned deterministic policy and seeded state.
6. Submit one operation with a unique operation ID and expected revisions.
7. On conflict or stale revision, discard the candidate, reacquire state, and retry with bounded backoff.
8. On authorization, validation, or policy failure, record the result and pause according to the error class.

Candidate generation must be pure with respect to the observed input and policy version wherever practical. A policy version and deterministic seed are recorded with agent telemetry so a decision can be replayed without reproducing network timing.

### Implementation boundaries

The implementation proceeds in this order:

1. Extend the principal kind contract and schema from the current human/system set to include `agent`, with migration and focused database tests.
2. Add agent provisioning and lookup with the dedicated issuer namespace, including rejection of unknown, inactive, wrong-issuer, wrong-audience, and insufficient-scope identities.
3. Update ownership eligibility checks and transfer acceptance to allow active agent principals while preserving the existing one-active-patch quota and transaction locks.
4. Add a narrow agent client and deterministic policy runner that uses existing HTTP and Socket.IO contracts.
5. Add integration and multi-replica tests covering claim, placement, stale revision, collision, idempotent retry, reconnect, ownership transfer, and disabled-agent expiry behavior.
6. Add the Foundry conversational client, curated historical corpus, retrieval pipeline, safety handling, fallback responses, and telemetry behind a separate feature flag. No model dependency is introduced into the mutation path.
7. Operate the first agent behind explicit mutation and conversation feature flags. Monitor command outcomes, latency, retries, conflicts, ownership changes, model latency, token usage, retrieval quality, fallback rate, and cost.

The implementation must update [principal context](../../apps/server/src/auth/principalContext.ts), [token verification](../../apps/server/src/auth/tokenVerifier.ts), [database schema](../../apps/server/src/db/schema.ts), and [ownership repository logic](../../apps/server/src/db/repository.ts) consistently. Existing placement and event contracts remain unchanged.

## Alternatives considered

### LLM-controlled canvas agent

Rejected. Model output must not control canvas mutations or authority decisions. The approved design uses the model only where natural language and historical synthesis provide direct user value.

### Self-hosted or browser-hosted model

Rejected for the initial release. Microsoft Foundry provides the required managed endpoint, identity integration, deployment controls, telemetry, and model replacement path with less operational surface than self-hosting. Browser hosting would expose model assets and complicate privacy, versioning, and cost controls.

### Privileged in-process agent

Rejected. Running behavior inside the server would make it tempting to bypass the public command path and would mix autonomous policy with authority enforcement. A separate worker keeps the boundary explicit and testable.

### Direct database agent writes

Rejected. Direct writes could violate patch locks, revisions, collision rules, event ordering, audit records, and idempotency. The API and Socket.IO protocol are the only agent mutation interfaces.

### Generic human issuer with an agent claim

Rejected for the initial design. A dedicated issuer and pre-provisioned mappings make agent identity unambiguous and prevent accidental enrollment of arbitrary external subjects while retaining the same API authorization contract.

## Consequences

### Positive

* Resident behavior is reproducible, testable, explainable, and inexpensive to operate.
* Agents cannot acquire authority outside the existing principal and patch contracts.
* The server remains the single correctness and audit boundary across replicas.
* Foundry can provide personality and historical context without changing canvas correctness or authorization.
* The model deployment can be replaced through configuration and evaluation rather than through a client release.

### Negative and risks

* The conversational plane adds Foundry availability, latency, token cost, privacy, safety, and corpus maintenance risks.
* The agent runner adds a deployable runtime and operational telemetry.
* Dedicated issuer configuration, provisioning, and credential rotation require administrative tooling.
* Existing human-only eligibility checks must be found and updated consistently, or agents will fail in one ownership path while succeeding in another.

## Decision gates for model expansion

The conversational Foundry integration is approved by this ADR. A new ADR is required before expanding model authority or changing the hosting boundary. Approval must include a measured comparison against the deterministic baseline for artistic value, latency, cost, reproducibility, explainability, privacy, provider failure, abuse resistance, and rollback. The model must remain outside the authority boundary, and model-generated proposals must never mutate the canvas without passing the same server contracts as every other client.

## References

* [Canonical finite toroidal quilt architecture](./2026-07-27-finite-toroidal-quilt-v01.md)
* [Canonical quilt data storage](../canonical-quilt-data-storage.md)
* [Authentication principal context](../../apps/server/src/auth/principalContext.ts)
* [Token verification](../../apps/server/src/auth/tokenVerifier.ts)
* [Database schema](../../apps/server/src/db/schema.ts)
* [Ownership repository](../../apps/server/src/db/repository.ts)
