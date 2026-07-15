# ADR: Production Deployment Architecture

**Status:** Accepted  
**Date:** 2026-07-15  
**Issue:** [#6 – Choose deployment architecture](https://github.com/dkirby-ms/zzyix/issues/6)

---

## Context

zzyix is a browser-based mosaic tile-placement application with a WebGL/React client and a server that provides game-state authority and real-time collaborative features. The project is in early development, running from a monorepo (`apps/client`, `apps/server`).

A production deployment architecture must be selected before server development begins in earnest. The decision must cover:

- Hosting model and platform
- Container strategy
- Secret and configuration management
- Real-time communication (WebSocket) approach
- CI/CD delivery pipeline

### Constraints

- Small team; low operational overhead preferred
- Real-time collaboration requires persistent, low-latency connections
- Monorepo structure with separate client and server apps
- GitHub is the source of truth for code and CI/CD

---

## Decision

### Hosting Platform: Azure Container Apps (ACA)

**Chosen:** Azure Container Apps with public-facing load balancer.

Azure Container Apps is a serverless container hosting platform built on Kubernetes + KEDA. It supports HTTP/HTTPS ingress with optional sticky sessions, scales to zero for cost efficiency, and integrates natively with Azure Container Registry. No cluster management overhead.

Each logical service (client, server) will be deployed as a separate ACA **app** within a shared **environment**.

### Container Strategy

- Container images are built via GitHub Actions CI/CD on every merge to `main` (and optionally per environment on tagged releases).
- Images are published to **GitHub Container Registry (GHCR)**. GHCR stays entirely within GitHub infrastructure, requires no additional Azure resources, and integrates naturally with GitHub Actions via the built-in `GITHUB_TOKEN`.
- Each app (`apps/client`, `apps/server`) has its own `Dockerfile`.
- The client Dockerfile builds the Vite static bundle and serves it via a lightweight static server (e.g., nginx or `serve`).
- The server Dockerfile packages the server application for runtime execution.

### Secret and Configuration Management

**Chosen:** GitHub Actions secrets injected as environment variables into ACA containers at deploy time.

- Secrets are stored as **GitHub Actions environment secrets**, scoped per environment (`dev`, `staging`, `prod`).
- CI/CD pipeline injects them via `az containerapp update --set-env-vars` or equivalent IaC step at deploy time.
- ACA containers consume secrets as standard environment variables at runtime.
- No additional secrets management layer (e.g., Key Vault) is required for the current scale.

> **Future consideration:** If secrets rotation or audit requirements grow, Azure Key Vault with ACA secret references can be layered in later without architectural change.

### Environments

**Chosen:** Three environments — `dev`, `staging`, `prod`.

- Each environment maps to a GitHub Actions environment with its own scoped secrets.
- `dev`: deploys on every merge to `main`; used for active development and integration testing.
- `staging`: deploys on release candidates; mirrors production configuration for pre-release validation.
- `prod`: deploys on tagged releases; public-facing.
- Each environment has its own ACA app (or ACA environment) and its own GHCR image tag convention (e.g., `dev`, `staging`, `v1.2.3`).

### Frontend

**Chosen:** React + Vite (no change to existing client architecture).

The client is built as a static bundle and served as a containerized static site. No SSR.

### Backend Architecture

**Chosen:** Single TypeScript/Node.js server — Express routing layer over a domain engine module, with WebSocket support for real-time collaboration.

- The **domain engine** encapsulates authoritative game logic: tile placement validation, collision detection, canvas mutation contracts, and state management. This mirrors and extends the existing client-side domain logic (`apps/client/src/domain/`).
- **Express** provides the HTTP REST API routing layer that calls into the domain engine.
- **WebSocket support** (via `ws` or an Express-compatible plugin) handles real-time collaborative events — see _Open Items_ for ACA-specific considerations.
- All three layers run in a single Node.js process; one Dockerfile for `apps/server`.

### Real-Time Communication

**Chosen:** WebSockets via the Express server (`ws` library or equivalent).

WebSockets are required for low-latency collaborative tile placement. Key findings from ACA documentation:

- ACA HTTP ingress **natively supports WebSocket** connections — no special TCP configuration needed.
- The default **request timeout is 240 seconds**. Long-lived WebSocket connections must implement a heartbeat / ping-pong mechanism to stay under this idle limit.
- ACA supports **session affinity (sticky sessions)** on the main HTTP ingress port. Enabling this ensures a given client always routes to the same replica, which is required for single-process in-memory session state.
- Sticky sessions are a single-node solution. Horizontal scaling beyond one active replica with shared canvas state will require an external pub-sub or state layer (e.g., Redis). This is deferred — sticky sessions are sufficient for initial scale.

> **Deferred:** Cross-replica state sync design (Redis pub-sub or equivalent) is out of scope for this ADR. It will be addressed when scaling requirements demand more than one server replica.

---

## Alternatives Considered

### Self-Hosted Kubernetes (AKS or similar)
- Full control over networking, session affinity, and scaling.
- Significantly higher operational burden for a small team.
- Not warranted at current project scale.

### App Service + Static Web Apps
- Azure Static Web Apps is well-suited for the React client.
- No native WebSocket support on Azure Static Web Apps.
- App Service supports WebSockets but is a heavier VM-backed model vs. container-native.

### Managed BaaS (Firebase, Supabase, Liveblocks)
- Reduces backend code dramatically.
- Opinionated about data model; likely incompatible with the server-authority game logic model.
- Vendor lock-in for core game state.

### Vercel / Netlify + Serverless Functions
- Good DX for the React client.
- Serverless functions have cold start latency and connection limits incompatible with persistent WebSocket sessions.

---

## Open Items

| # | Question | Owner | Status |
|---|----------|-------|--------|
| 1 | **TS engine ↔ Express integration model** — Resolved: single Node.js process with domain engine as internal TypeScript module, Express as routing surface. No polyglot boundary. | Architecture | ✅ Resolved |
| 2 | **Container registry choice** — GHCR chosen. Stays within GitHub infrastructure, uses built-in `GITHUB_TOKEN`, no additional Azure resources. | Infrastructure | ✅ Resolved |
| 3 | **WebSocket on ACA** — ACA HTTP ingress natively supports WebSocket. 240s idle timeout requires heartbeat. Session affinity available and sufficient for single-replica initial deployment. Multi-replica state sync deferred. | Research needed | ✅ Resolved |}
| 4 | **Environment strategy** — Three environments: `dev` (on merge to `main`), `staging` (release candidates), `prod` (tagged releases). Secrets scoped per GitHub Actions environment. | Process | ✅ Resolved |

---

## Consequences

### Positive
- ACA eliminates cluster management overhead while retaining container portability.
- GitHub Actions + env var injection keeps the secrets model simple and auditable.
- TypeScript engine mirrors existing client-side domain logic, reducing total surface area for placement rule bugs.
- Container-based delivery is portable and avoids platform lock-in at the app level.

### Negative / Risks
- ACA WebSocket support and scaling behavior must be validated before committing to the real-time architecture.
- Scaling stateful WebSocket sessions horizontally requires either sticky sessions or an external state/pub-sub layer (Redis, etc.) — this is not yet designed.
- Single-process Node.js server means CPU-bound engine logic and I/O-bound WebSocket handling compete; may need worker threads at scale.

---

## References

- [Azure Container Apps documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- [ACA HTTP ingress and session affinity](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview)
- [ACA WebSocket support](https://learn.microsoft.com/en-us/azure/container-apps/websockets)
- WebSocket scaling research: TBD
