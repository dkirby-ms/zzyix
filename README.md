## What This Is

zzyix is a casual project for learning agentic software development lifecycle (SDLC) practices while building a collaborative mosaic web app.

* Learn by shipping small increments instead of writing perfect plans up front
* Explore different agentic coding techniques and tools
* Keep scope grounded in a fun product idea: collaborative mosaic building

## Scope

The product goal is a web experience where multiple users can place and arrange tile shapes on a shared canvas in real time.

Current and near-term themes include:

* Smooth tile placement and interaction design
* Authoritative validation of placement rules
* Realtime multi-user synchronization
* Persistent canvas and operation history

## Project Structure

* [apps/client](apps/client): React + TypeScript + Three.js client for the mosaic editor
* [apps/server](apps/server): Express + Socket.IO server with authoritative placement logic
* [docs/decisions](docs/decisions): Architecture and design decision records

## Quick Start

### Prerequisites

* Node.js 24+
* npm 11+

### Install

```bash
npm install
```

### Run Client And Server

In separate terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Default local URLs:

* Client: <http://localhost:5173>
* Server: <http://localhost:3001>

### Run Tests

```bash
npm test
```

## Collaboration Notes

This is a learning-first repository, not a production system.

Expect rough edges, experiments, and occasional pivots in architecture or workflow as we test ideas and improve both product and process.

## Staging CD Environment Bootstrap

Use the GH CLI helper to create/update GitHub Environment variables and
secrets required by `.github/workflows/cd.yml`.

1. Fill in values in `scripts/gh-vars.env`.
2. Run:

```bash
./scripts/bootstrap-cd-environment.sh --repo dkirby-ms/zzyix --environment staging
```

By default the script reads `scripts/gh-vars.env`. You can override with
`--env-file <path>`.

Required keys in the env file:

```bash
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_RESOURCE_GROUP
AZURE_CONTAINERAPPS_ENVIRONMENT
AZURE_LOCATION
SERVER_CONTAINER_APP_NAME
CLIENT_CONTAINER_APP_NAME
SERVER_DATABASE_URL
```

Optional keys in the env file:

```bash
SERVER_CORS_ORIGIN
AZURE_GHCR_USERNAME
AZURE_GHCR_PASSWORD
```

If `SERVER_CORS_ORIGIN` is not set, CD will deploy the client app first,
resolve its Container App ingress URL, and use that URL as the server CORS
origin automatically.
