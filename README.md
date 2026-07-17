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
