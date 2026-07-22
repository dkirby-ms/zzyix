<!-- markdownlint-disable-file -->

# Planning Log: Suggested Features Implementation

**Date:** 2026-07-21  
**Plan:** `.copilot-tracking/plans/2026-07-21/suggested-features-plan.md`

## Discrepancy Log

None at planning stage. All tasks are well-defined from Phase 5 suggestions.

## Implementation Paths Considered

### Selected Approach

**Parallel Execution Strategy:**
1. Database seeding and environment validation run in parallel (Phase 1 & 2)
   - No dependencies between them
   - Both enhance developer experience
   - Faster overall execution
2. Network status indicator (Phase 3)
   - Depends on understanding useSocketConnection
   - Builds foundation for Phase 4
3. Collaborative cursors (Phase 4)
   - Most complex, builds on network status changes
   - Requires Phase 3's connection state exposure

**Technical Decisions:**
- Database seeding: Use TypeScript, match server's tech stack
- Env validation: Minimal external dependencies, fail fast
- Network status: Extend existing useSocketConnection hook, no new context layer
- Collaborative cursors: Render in Three.js scene (not DOM overlay) for seamless integration

### Alternatives Considered

1. **Collaborative Cursors First** - Rejected: Depends on network state clarity
2. **DOM Overlay for Cursors** - Rejected: Would require coord translation, less performant
3. **Python Seed Script** - Rejected: TypeScript/Node.js consistency preferred

## Suggested Follow-On Work

After these features:
1. User presence indicators in lobby (show live user count, names)
2. Cursor trail animations for smoother visual feedback
3. Seed data expansion (more tile patterns, more demo canvases)
4. Persistence of user preferences (recent palette, brush settings)

