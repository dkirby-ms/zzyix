<!-- markdownlint-disable-file -->
# Planning Log: Deterministic Multi-User Canvas Fixtures

## Discrepancy Log

### Unaddressed Research Items

* None at planning time. The current scope is well bounded around the existing e2e harness, client state, and test reset endpoint.

### Plan Deviations from Research

* None at planning time. The plan follows the selected bridge-plus-fixtures approach directly.

## Implementation Paths Considered

### Selected: Test-Only Client Bridge Plus Playwright Multi-Context Fixtures

* Approach: Expose the app's authoritative observable state and deterministic controls only in e2e runs, then build reusable Playwright helpers on top.
* Rationale: This keeps the test path aligned with real client behavior while solving isolation, observability, and synchronization in one place.

### Rejected: Pure DOM and Pointer Automation Only

* Approach: Drive only visible controls and world-coordinate pointer gestures from Playwright.
* Rejection rationale: Too brittle for deterministic multi-user collaboration setup and tile assertions.

### Rejected: Server-Side Placement Test Endpoints

* Approach: Place tiles through dedicated server test APIs.
* Rejection rationale: Would bypass the client behavior that future collaboration scenarios must cover.

## Suggested Follow-On Work

* Add higher-level scenario builders for sequential and concurrent placement tests on top of the shared fixture layer.
* Consider remote cursor and selection observability helpers if later collaboration issues need them.