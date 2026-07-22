<!-- markdownlint-disable-file -->

# Implementation Plan: Four Feature Enhancements for Zzyix

**Date:** 2026-07-21  
**Source Research:** `.copilot-tracking/research/2026-07-21/suggested-features-research.md`

## User Requests

From Phase 5 Discover suggestions:

1. **Database Seeding Script** — Add `npm run db:seed` to populate initial demo data (tiles, palettes, sample sessions) for faster development testing
2. **Environment Validation** — Add a startup check that verifies DATABASE_URL is set and the database is accessible before starting the dev server
3. **Visual Feedback for Network State** — Add connection status indicator in the UI to show when the WebSocket is connected/disconnected/reconnecting
4. **Collaborative Cursor Display** — Show other connected users' cursors on the canvas with their names/colors for better collaboration awareness

## Overview & Objectives

Enhance developer experience and collaboration features:
- **Objective 1:** Enable faster testing cycles with pre-seeded demo data
- **Objective 2:** Catch configuration issues early with environment validation
- **Objective 3:** Improve user awareness of network connectivity
- **Objective 4:** Display remote collaborators' cursors for better spatial awareness during collaboration

## Context Summary

### Discovered Instructions Files
- `.github/instructions/coding-standards/bash/bash.instructions.md` (for scripts)
- `.github/instructions/coding-standards/python-script.instructions.md` (if using Python for seeding)

### Discovered Skills
- None directly applicable; standard implementation

### Database Structure
- Schema: users, canvases, participants, tiles, operationLog
- ORM: Drizzle with TypeScript
- Migrations: Managed via drizzle-kit, stored in apps/server/migrations

### Network Events (Socket.io)
- Existing: client_joined, client_left, pointer_update, selection_update, connection, disconnect
- State: useSocketConnection hook manages events

### UI Architecture
- React + TypeScript
- Three.js/Fiber for 3D rendering
- MosaicScene.tsx: Canvas container
- ControlsPanel.tsx: Side UI
- App.tsx: Main state management

## Implementation Checklist

### Phase 1: Database Seeding Script
<!-- parallelizable: true -->

- [ ] Create `apps/server/src/db/seed.ts` file
  - [ ] Define seed data (sample canvases, tiles, palettes)
  - [ ] Export run function for execution
- [ ] Build compiled seed script to dist
- [ ] Add `db:seed` script to root `package.json`
  - [ ] Script: build server + run seed
  - [ ] Make seed data insertion idempotent
- [ ] Test seed script executes without errors
- [ ] Document seeding behavior in README or dev guide

### Phase 2: Environment Validation
<!-- parallelizable: true -->

- [ ] Create `apps/server/src/startup/validateEnv.ts`
  - [ ] Check DATABASE_URL is set
  - [ ] Test database connectivity with short timeout
  - [ ] Verify migrations table exists (migrations already applied)
  - [ ] Clear error messages for each failure case
- [ ] Integrate validation into dev startup
  - [ ] Call from server startup before listening
  - [ ] Exit with code 1 if validation fails
  - [ ] Add to npm scripts if needed
- [ ] Test validation catches missing DATABASE_URL
- [ ] Test validation confirms working database

### Phase 3: Network Status Indicator
<!-- parallelizable: false -->

- [ ] Extend useSocketConnection to expose connection state
  - [ ] Add state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'
  - [ ] Track reconnection attempts
  - [ ] Return state via hook or context
- [ ] Update App.tsx to track connection state
  - [ ] Create useState for connection status
  - [ ] Pass status to component requiring display
- [ ] Create StatusIndicator component
  - [ ] Display in top-right or bottom-left
  - [ ] Show text: "Connected", "Reconnecting...", "Offline"
  - [ ] Color coding: green, yellow, red
  - [ ] Optional: Show reconnection attempt count
- [ ] Update status-strip CSS if reusing existing element
- [ ] Test indicator shows correct states through connect/disconnect cycles

### Phase 4: Collaborative Cursor Display
<!-- parallelizable: false -->

- [ ] Extend Socket.io events to include cursor metadata
  - [ ] Ensure pointer_update includes color/name info (or fetch from client_joined)
  - [ ] Verify client_joined payload includes displayName, clientId
- [ ] Create collaborator cursor data structure
  - [ ] Track: clientId, displayName, position, color
  - [ ] Store in App.tsx state
- [ ] Update MosaicScene to render remote cursors
  - [ ] Create cursor geometry (small circle with label)
  - [ ] Position based on world coordinates
  - [ ] Update positions from pointer_update events
  - [ ] Remove cursors on client_left events
- [ ] Implement cursor color assignment
  - [ ] Consistent colors per clientId
  - [ ] Visible against white canvas background
- [ ] Test cursor rendering
  - [ ] Single remote cursor appears and moves
  - [ ] Multiple remote cursors visible with different colors
  - [ ] Cursor disappears when client leaves

## Planning Log Reference

Path: `.copilot-tracking/plans/logs/2026-07-21/suggested-features-log.md`

## Dependencies

- Database schema and migration infrastructure (already in place)
- Socket.io event system (already in place)
- Three.js scene rendering (already in place)

## Success Criteria

1. **Database Seeding:** `npm run db:seed` executes successfully, populates demo data, idempotent on re-run
2. **Environment Validation:** Dev server fails to start with clear error if DATABASE_URL missing or DB unreachable
3. **Network Status:** UI clearly displays connection state, updates in real-time during reconnects
4. **Collaborative Cursors:** Remote cursors render in 3D scene, follow pointer_update events, display names/colors, clean up on disconnect

