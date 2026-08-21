---
title: zzyix
description: A shared, realtime mosaic world where people place tiles together on one continuous quilt.
---

## Build a world, one tile at a time

zzyix is a collaborative mosaic canvas. Pick a shape, color, and material, then
place tiles alongside other people in a shared world that wraps continuously at
its edges.

The project is also a practical space for learning agent-assisted software
development by building and shipping a real product in small increments.

## What you can do

* Place squares, triangles, rectangles, and L-shaped tiles
* Choose from several palettes and material styles
* Build freely or use optional repeating grid patterns
* Pan and zoom through a continuous wrapped quilt
* See other collaborators and distinguish their tile ownership
* Return to a patch you own when you sign in
* Exchange durable plain-text messages with authenticated collaborators in the shared chat

## Try it locally

You need Node.js 24+, npm 11+, Docker, and Docker Compose.

```bash
npm install
docker compose up -d postgres
npm run dev:test-auth
```

Open <http://127.0.0.1:4173>, choose Alice or Bob, and sign in. Use a second
browser profile to try realtime collaboration as the other user.

The local identity provider and mutation controls are restricted to test mode
and loopback services. They cannot be enabled in production.

## How it works

The experience is built from three main pieces:

* React and Three.js render the quilt and editing tools in the browser
* Express and Socket.IO authorize edits and synchronize collaborators
* PostgreSQL stores quilts, owned patches, tiles, and durable operation history

The quilt is finite in storage but wraps at its edges, so navigation feels
continuous without duplicating persisted tiles.

Authenticated users can also use the shared chat panel. Messages are stored in
PostgreSQL, ordered by server sequence, replayed from a cursor after reconnect,
and rendered as plain text. See the [chat product contract](docs/chat-product-contract.md)
for limits, authorization, retention, and deferred features.

For a visual explanation of the data model, see
[Canonical quilt data storage](docs/canonical-quilt-data-storage.md).

## Explore the project

* [Client guide](apps/client/README.md): UI, controls, runtime configuration, and client tests
* [Server guide](apps/server/README.md): API, authentication, deployment, and migration operations
* [Architecture decisions](docs/decisions): Product and engineering decisions with their tradeoffs
* [Contributing guide](CONTRIBUTING.md): Development workflow and contribution expectations
* [Security policy](SECURITY.md): Reporting security issues

## Common commands

| Command | Purpose |
|---------|---------|
| `npm run dev:test-auth` | Run the local app with test identities |
| `npm run dev` | Run the standard client and server development processes |
| `npm test` | Run all workspace tests |
| `npm run build` | Build all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run test:e2e` | Run the Playwright end-to-end suite |

## Project status

zzyix is an active learning project. Expect experiments, evolving architecture,
and occasional rough edges. The repository uses Conventional Commits and checks
builds, tests, and commit messages in CI.
