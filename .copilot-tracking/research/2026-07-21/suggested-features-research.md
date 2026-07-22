<!-- markdownlint-disable-file -->

# Research: Four Suggested Features for Zzyix

**Date:** 2026-07-21  
**Session Focus:** Implementing database seeding, environment validation, network status indicators, and collaborative cursors

## Scope & Assumptions

- Difficulty assessment: Medium to Medium-Hard tasks
- Parallel work possible for independent features
- Database seeding: Low priority foundation work
- Environment validation: Single startup check
- Network status: UI enhancement, minimal state added
- Collaborative cursors: Most complex, requires data structure expansion

## Discovered Context

### Database Schema
- `users` table: id (uuid), clientId (text), displayName (text)
- `canvases` table: core workspace container
- `participants` table: tracks who's in each canvas (canvasId, clientId pairs)
- `tiles` table: individual mosaic pieces with shape, color, material, position, rotation
- `operationLog` table: tracks tile operations for audit/playback

### Network Infrastructure
- WebSocket via Socket.io with reconnection logic (1s-5s delays, max 5 attempts)
- Events: `client_joined`, `client_left`, `pointer_update`, `selection_update` (partially implemented)
- useSocketConnection hook manages all socket events
- Existing event handlers for client join/leave already exist

### Collaborator Tracking
- `RemoteCollaboratorMap` in collaboratorUtils.ts tracks remote users
- Signals include pointer position, palette selection, tile being placed
- Cleanup runs at `COLLABORATOR_CLEANUP_INTERVAL_MS` to evict stale signals
- Collaboration emit happens at `COLLABORATION_EMIT_INTERVAL_MS`

### UI State
- App.tsx manages mode state: 'lobby' | 'canvas'
- ControlsPanel has been enhanced with Return to Lobby button
- Status strip exists with data-state attribute (currently shows ghost confidence)
- LobbyScreen displays session list with connected user count

## Tasks Assessment

### 1. Database Seeding Script
**Difficulty:** Medium  
**Status:** Not started  

**Current State:**
- db:apply script added and working (builds + applies migrations)
- No seed data exists yet
- Example data needed: demo canvases, tiles, sample palettes

**Needs:**
- Create seed data generation file
- Add db:seed script to package.json
- Seed should be optional and idempotent (safe to run multiple times)

**Dependencies:** None - can start immediately

**Risk:** Low - seed data is non-destructive if properly guarded

---

### 2. Environment Validation
**Difficulty:** Medium  
**Status:** Not started  

**Current State:**
- .env file exists with DATABASE_URL
- migrate.ts already checks for DATABASE_URL existence
- Dev server currently doesn't validate before starting

**Needs:**
- Startup script or hook that verifies:
  - DATABASE_URL is set
  - Database is reachable/connectable
  - Migrations are applied
- Clear error messaging if checks fail

**Dependencies:** None - can start after database tasks

**Risk:** Low - startup check only, doesn't alter data

---

### 3. Visual Feedback for Network State
**Difficulty:** Medium  
**Status:** Partially started (status strip exists)  

**Current State:**
- Status strip element exists in App.tsx showing ghost confidence
- useSocketConnection logs connection events to console
- No UI currently displays connection state

**Needs:**
- Track socket connection state (connecting, connected, error, disconnected)
- Display in status strip or new indicator component
- Show reconnection progress
- Color coding: green (connected), yellow (reconnecting), red (error)

**Dependencies:** Requires updating useSocketConnection hook to expose connection state

**Risk:** Low-Medium - minimal state addition, clear state machine

---

### 4. Collaborative Cursor Display
**Difficulty:** Medium-Hard  
**Status:** Partially started (client_joined/client_left events exist)  

**Current State:**
- Pointer updates received via `pointer_update` event
- ClientJoined/ClientLeft events available
- RemoteCollaboratorMap already tracks pointer positions
- MosaicScene renders canvas for current client

**Needs:**
- New cursor render layer in Three.js scene
- Track cursor visuals for each remote collaborator
- Display collaborator name/color with cursor
- Update cursor positions from pointer_update events
- Clean up cursors when clients leave

**Dependencies:**
- Requires connection state tracking
- Needs color palette for cursor differentiation
- May need socket event expansion to include cursor metadata

**Risk:** Medium - Three.js integration, performance with many users

---

## Recommended Execution Sequence

1. **Database Seeding** - Foundation work, enables consistent dev environments
2. **Environment Validation** - Quick win, improves developer experience
3. **Network Status Indicator** - UI enhancement, builds on existing infrastructure
4. **Collaborative Cursors** - Most complex, can be iterated later if needed

## Next Steps

- Proceed to Phase 2: Planning with focus on parallelizable work
- Database seeding and environment validation can proceed in parallel
- Network status and collaborative cursors dependent on network state tracking
