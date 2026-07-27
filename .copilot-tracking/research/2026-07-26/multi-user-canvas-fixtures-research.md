<!-- markdownlint-disable-file -->
# Task Research: Deterministic Multi-User Canvas Fixtures (Issue #91)

Research and recommend an implementation approach for issue #91: reusable Playwright fixtures and helpers for multiple independent users collaborating on the same shared canvas.

## Task Implementation Requests

* Create two or more independent browser contexts representing distinct users.
* Connect all users to the same isolated shared canvas.
* Add stable test hooks or abstractions for selecting and placing a tile.
* Add helpers to inspect tile identity, shape, color, position, and orientation through observable application state.
* Add synchronization helpers based on connection status, acknowledgements, or rendered state rather than fixed sleeps.
* Ensure fixture cleanup closes contexts and removes test state.

## Scope and Success Criteria

* Scope: Playwright fixtures and support helpers, client-side test observability, targeted e2e coverage, and any minimal configuration needed to enable test-only hooks. The work excludes the final sequential and concurrent placement scenarios and excludes CI workflow changes.
* Assumptions:
  * Browser-context isolation is sufficient to represent distinct users because the app persists identity in per-context `localStorage` and session choice in per-context `sessionStorage`.
  * Server-side `/test/reset` can remain the source of truth for isolated test canvases.
  * Test-only observability can expose existing application state and invoke existing placement behavior without changing production runtime semantics.
* Success criteria:
  * Identify the smallest client seam that exposes authoritative connection and tile state already owned by the app.
  * Provide multi-user fixtures that create independent contexts and join one shared test canvas deterministically.
  * Eliminate fixed-duration sleeps from synchronization helpers.
  * Keep cleanup reliable after both success and failure.

## Research Executed

### File Analysis

* `e2e/smoke.spec.ts`
  * Current e2e coverage is a single smoke test using one page.
  * There is no reusable fixture layer yet.
* `e2e/support/testState.ts`
  * Test support already resets server state through `POST /test/reset` with a shared token.
  * The endpoint currently supports optional session creation, which is the right primitive for isolated shared canvases.
* `playwright.config.ts`
  * Playwright already boots dedicated client and server processes for e2e.
  * The client server does not yet receive any test-only Vite flag.
* `apps/client/src/network/session.ts`
  * `ensureClientId()` persists a UUID in `localStorage`.
  * `setStoredSessionId()` persists the joined canvas in `sessionStorage`.
  * Separate `browser.newContext()` instances will therefore produce distinct user identity and session storage automatically.
* `apps/client/src/App.tsx`
  * App owns authoritative observable state needed by tests: `clientId`, `sessionId`, `connectionState`, `sequencedState.tiles`, collaborator roster, and active tile settings.
  * Real placement behavior already funnels through `updatePointer()` and `attemptPlace()`.
  * No existing test API or stable application-state bridge is exposed on `window`.
* `apps/client/src/interaction/controller.ts`
  * Authoritative observable tile data already includes `id`, `shape`, `color`, `material`, `transform.position`, `transform.rotation`, `transform.mirrored`, and `placedBy`.
* `apps/server/src/index.ts`
  * Test mode supports `POST /test/reset` with `createSession` and returns a seeded session ID.
  * This lets every test start from one isolated, known canvas without listing or creating canvases through the ordinary UI first.

## Key Discoveries

### Isolation Model Already Exists

Independent browser contexts are enough to represent separate users because identity and joined session are stored in browser storage rather than in server-managed auth sessions. No server auth changes are required for this work.

### Stable Placement Needs a Client Bridge

The current canvas interaction plane is rendered through React Three Fiber and real pointer world coordinates. That is suitable for production behavior but brittle as the only e2e control surface for deterministic multi-user tests. The app already owns a precise placement seam in `updatePointer()` plus `attemptPlace()`, so a test-only bridge should call that seam instead of reimplementing placement logic in Playwright.

### Observable State Already Exists In-Memory

Tests need tile identity, shape, color, material, position, rotation, mirrored state, client identity, and connection status. All of that state already exists in App memory. The missing piece is a test-only way to read it without pixel assertions or debug-only DOM that changes the production UI.

### Synchronization Can Be State-Based

Connection readiness can wait on the existing `StatusIndicator` state or App connection status. Remote propagation can wait until the second client's authoritative tile list contains a tile ID or matching observable attributes. This avoids arbitrary sleeps and aligns with the issue requirements.

## Alternatives Considered

### Selected: Test-Only Window Bridge Over Existing App State

* Approach: Register a test-only API on `window` when a dedicated Vite env flag is enabled. Expose read-only snapshots of observable client state plus thin commands that route through existing App behavior for tile selection, pointer movement, and placement.
* Advantages:
  * Keeps placement on the real application path.
  * Gives Playwright precise synchronization points without DOM scraping or pixel assertions.
  * Leaves production behavior unchanged when the env flag is absent.
* Risks:
  * The bridge must stay narrowly scoped to observability and deterministic control, not become a parallel application API.

### Rejected: Pure DOM-Driven Tile Placement

* Approach: Use only visible controls and pointer actions from Playwright.
* Trade-offs: Good for black-box coverage, but brittle for Three.js world coordinates and awkward for precise remote-state assertions.
* Rejection rationale: The issue explicitly calls out the risk of brittle pointer coordinates and insufficient observable state.

### Rejected: Server-Side Test Placement Endpoints

* Approach: Add special server endpoints or socket events that place tiles directly.
* Trade-offs: Simplifies e2e mechanics but bypasses the real client behavior that later multi-user scenarios need to exercise.
* Rejection rationale: This would weaken the fixture value and create a parallel behavior path.

## Recommended Implementation

1. Add a small test-only client bridge in the client app, enabled only when a dedicated Vite env flag is present.
2. Expose a read-only state snapshot with:
   * `clientId`
   * `sessionId`
   * `mode`
   * `connectionStatus`
   * `tiles` with complete observable placement attributes
   * active-tile settings
   * collaborator count or IDs
3. Expose thin control methods that reuse existing App logic:
   * set active tile fields
   * move pointer in world coordinates
   * place the active tile at a world coordinate
4. Add Playwright support helpers to:
   * reset test state and create an isolated session
   * create multiple browser contexts and pages
   * join all users to the same session
   * wait for connection and remote tile propagation using state polling
   * assert tile attributes through the bridge
5. Add one focused e2e spec that proves the fixture primitives, not the final collaboration scenarios.

## Validation Strategy

* Run the new focused Playwright spec for multi-user fixtures.
* Run targeted client tests if the bridge extraction introduces unit-testable code.
* Re-run the existing smoke e2e spec if needed to confirm no regression in ordinary test bootstrapping.

## Risks and Mitigations

* Risk: The bridge leaks into production behavior.
  * Mitigation: Guard registration behind a dedicated Vite env flag set only in Playwright config.
* Risk: Placement helper becomes a custom behavior path.
  * Mitigation: Route helper methods through existing App state transitions and placement functions.
* Risk: Test cleanup leaves contexts or shared server state behind.
  * Mitigation: Centralize context closure in fixture teardown and reset shared state after each test.

## Potential Next Research

* Evaluate whether the same bridge should expose remote cursor and selection state for later multi-user collaboration scenarios.
* Decide whether later end-to-end collaboration suites should compose on top of the same fixtures or split into higher-level scenario builders.