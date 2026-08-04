<!-- markdownlint-disable-file -->
# Release Changes: Monitoring and Observability

**Related Plan**: .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md
**Implementation Date**: 2026-08-03

## Summary

Implements monitoring and observability baseline across infrastructure, deployment configuration, server instrumentation, client telemetry normalization, and SLO policy artifacts.

Review rework completed the remaining production blockers by routing client lifecycle outcomes through canonical telemetry, hardening server startup/auth failure behavior, and removing the Log Analytics shared key from deployment outputs.

## Changes

### Added

* infra/bicep/modules/diagnostics.bicep - Added ACA managed-environment diagnostic settings to route logs and metrics to Log Analytics.
* apps/server/src/telemetry.ts - Added Node `--import` telemetry loader that initializes Azure Monitor OpenTelemetry when connection string is configured.
* docs/decisions/2026-08-03-observability-slo-policy.md - Added observability SLO governance policy with telemetry gate evidence and cost guardrails.

### Modified

* infra/bicep/modules/monitoring.bicep - Added workspace-based Application Insights resource and emitted connection string/instrumentation outputs.
* infra/bicep/main.bicep - Wired diagnostics module, exposed the top-level Application Insights connection string output, passed only the Log Analytics workspace ID into the ACA environment module, and added `deploymentLocation`/`deploymentStamp` for idempotent regional stacks.
* infra/bicep/main.bicepparam - Added a sample `westus3` regional deployment location and stamp.
* infra/bicep/host.main.bicepparam - Configured the host deployment as an independent `westus3` staging stamp.
* infra/bicep/modules/recovery-job.bicep - Shortened the recovery job resource name to fit Container Apps' 32-character limit and made the custom role definition GUID region-stamp-specific.
* infra/bicep/main.bicep - Removed the unused recovery job module, its operational parameters, and the recovery job output.
* infra/bicep/main.bicepparam - Removed unused recovery-job deployment parameters.
* .github/workflows/cd.yml - Removed the manual restricted recovery workflow dispatch inputs and job.
* apps/server/package.json - Removed the unused principal recovery operation command.
* scripts/release-contract.test.mjs - Removed recovery-job contract assertions.
* infra/bicep/modules/postgresql.bicep - Added explicit application database provisioning for `zzyix` on new PostgreSQL Flexible Server deployments.
* infra/bicep/main.bicep - Added `postgresDatabaseName` and passed it into the PostgreSQL module.
* scripts/bootstrap-cd-environment.sh - Added `APPLICATIONINSIGHTS_CONNECTION_STRING` as required environment variable and optional `OTEL_SAMPLING_RATIO` environment variable support.
* .github/workflows/cd.yml - Added `APPLICATIONINSIGHTS_CONNECTION_STRING`, `OTEL_SERVICE_NAME`, and `OTEL_SAMPLING_RATIO` to both server `az containerapp update` env var sets.
* apps/server/package.json - Added `@azure/monitor-opentelemetry`; updated dev/start scripts to preload telemetry loader.
* apps/server/Dockerfile - Updated runtime command to preload telemetry loader before server entry point.
* apps/server/src/index.ts - Added OpenTelemetry trace correlation suffix to `writeLog`; upgraded `/health` endpoint to include DB readiness, degraded status handling, and runtime package version reporting.
* apps/server/src/logging/redact.ts - Added IP-address key redaction for request and socket log payloads.
* apps/server/src/telemetry.ts - Wrapped Azure Monitor preload initialization so startup degrades gracefully on SDK initialization failure.
* apps/client/package.json - Removed the no-op `@opentelemetry/api` client dependency during review rework.
* apps/client/src/network/useSocketConnection.ts - Removed the console-only lifecycle helper, relied on canonical telemetry for lifecycle outcomes, and advanced socket auth failures with `callback({})`.
* apps/client/src/network/useSocketConnection.test.ts - Added coverage for socket auth token acquisition failure progression.
* infra/bicep/modules/containerAppsEnvironment.bicep - Resolved the Log Analytics workspace via `existing` and fetched customer ID/shared key inside the module boundary.
* package-lock.json - Updated workspace lockfile for server/client observability dependency additions.
* .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md - Marked all phases and steps complete.

### Removed

* infra/bicep/modules/recovery-job.bicep - Removed the unused manual Container Apps recovery job and its custom role assignment.
* apps/server/src/operations/principalRecovery.ts - Removed unused principal recovery operation logic.
* apps/server/src/operations/principalRecoveryCli.ts - Removed unused principal recovery command-line entry point.
* apps/server/src/operations/principalRecovery.test.ts - Removed tests for the deleted recovery operation.

## Additional or Deviating Changes

* Server validation reported one pre-existing warning in `apps/server/src/db/purge.postgres.integration.test.ts` for an unused import.
	* Warning is unrelated to observability changes and did not block lint/build/test completion.
* Review rework removed the client `@opentelemetry/api` stub that the original implementation had introduced.
	* The dependency had no runtime effect because no browser tracer provider was initialized; canonical telemetry remains the supported client observability path for this iteration.
* Client build reported existing Vite chunk-size warnings and a config-native compatibility warning for `__dirname` usage in `apps/client/vite.config.ts`.
	* Warnings are pre-existing build optimization concerns and did not block successful build/test completion.

## Release Summary

Implemented all six plan phases and validated end-to-end.

Completed a seventh review-rework phase to resolve the remaining production blockers from independent validation.

* Files added: 3 (`infra/bicep/modules/diagnostics.bicep`, `apps/server/src/telemetry.ts`, `docs/decisions/2026-08-03-observability-slo-policy.md`)
* Files modified: 13 (`infra/bicep/modules/monitoring.bicep`, `infra/bicep/modules/containerAppsEnvironment.bicep`, `infra/bicep/main.bicep`, `scripts/bootstrap-cd-environment.sh`, `.github/workflows/cd.yml`, `apps/server/package.json`, `apps/server/Dockerfile`, `apps/server/src/index.ts`, `apps/server/src/logging/redact.ts`, `apps/server/src/telemetry.ts`, `apps/client/package.json`, `apps/client/src/network/useSocketConnection.ts`, `apps/client/src/network/useSocketConnection.test.ts`, `package-lock.json`) plus tracking plan state
* Files removed: 0

Validation status:

* `cd apps/server && npm run lint && npm run build && npm test` passed
* `cd apps/client && npm run lint && npm run build && npm test` passed
* `az bicep build --file infra/bicep/main.bicep` passed
* `az bicep build-params --file infra/bicep/main.bicepparam` passed via Bicep MCP parameter compilation
* `az bicep build-params --file infra/bicep/host.main.bicepparam` passed via Bicep MCP parameter compilation after the westus3 regional stamp change
* `az bicep build-params --file infra/bicep/host.main.bicepparam` passed after the recovery job name-limit fix
* `az bicep build-params --file infra/bicep/host.main.bicepparam` passed after removing the recovery job parameters and module
* `az bicep build-params --file infra/bicep/host.main.bicepparam` passed after adding PostgreSQL application database provisioning
* `npm run test:release-contract` passed after removing the manual recovery workflow
* `npm run test --workspace=apps/server` passed after deleting the recovery operation
* `bash -n scripts/bootstrap-cd-environment.sh` passed
* `npm run test --workspace=apps/client -- useSocketConnection` passed
* `npm run lint --workspace=apps/client` passed
* `npm run lint --workspace=apps/server` passed (1 pre-existing warning)
* `npm run test --workspace=apps/server` passed

No blocking issues were identified. Non-blocking warnings were captured in Additional or Deviating Changes.
