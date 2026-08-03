<!-- markdownlint-disable-file -->
# Release Changes: Monitoring and Observability

**Related Plan**: .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md
**Implementation Date**: 2026-08-03

## Summary

Implements monitoring and observability baseline across infrastructure, deployment configuration, server instrumentation, client telemetry normalization, and SLO policy artifacts.

## Changes

### Added

* infra/bicep/modules/diagnostics.bicep - Added ACA managed-environment diagnostic settings to route logs and metrics to Log Analytics.
* apps/server/src/telemetry.ts - Added Node `--import` telemetry loader that initializes Azure Monitor OpenTelemetry when connection string is configured.
* docs/decisions/2026-08-03-observability-slo-policy.md - Added observability SLO governance policy with telemetry gate evidence and cost guardrails.

### Modified

* infra/bicep/modules/monitoring.bicep - Added workspace-based Application Insights resource and emitted connection string/instrumentation outputs.
* infra/bicep/main.bicep - Wired diagnostics module and exposed top-level Application Insights connection string output.
* scripts/bootstrap-cd-environment.sh - Added `APPLICATIONINSIGHTS_CONNECTION_STRING` as required environment variable and optional `OTEL_SAMPLING_RATIO` environment variable support.
* .github/workflows/cd.yml - Added `APPLICATIONINSIGHTS_CONNECTION_STRING`, `OTEL_SERVICE_NAME`, and `OTEL_SAMPLING_RATIO` to both server `az containerapp update` env var sets.
* apps/server/package.json - Added `@azure/monitor-opentelemetry`; updated dev/start scripts to preload telemetry loader.
* apps/server/Dockerfile - Updated runtime command to preload telemetry loader before server entry point.
* apps/server/src/index.ts - Added OpenTelemetry trace correlation suffix to `writeLog`; upgraded `/health` endpoint to include DB readiness and degraded status handling.
* apps/client/package.json - Added `@opentelemetry/api` dependency.
* apps/client/src/network/useSocketConnection.ts - Replaced raw socket lifecycle `console.log`/`console.error` calls with structured telemetry events logged via helper.
* package-lock.json - Updated workspace lockfile for server/client observability dependency additions.
* .copilot-tracking/plans/2026-08-03/monitoring-observability-plan.instructions.md - Marked all phases and steps complete.

### Removed

* None.

## Additional or Deviating Changes

* Server validation reported one pre-existing warning in `apps/server/src/db/purge.postgres.integration.test.ts` for an unused import.
	* Warning is unrelated to observability changes and did not block lint/build/test completion.
* Client build reported existing Vite chunk-size warnings and a config-native compatibility warning for `__dirname` usage in `apps/client/vite.config.ts`.
	* Warnings are pre-existing build optimization concerns and did not block successful build/test completion.

## Release Summary

Implemented all six plan phases and validated end-to-end.

* Files added: 3 (`infra/bicep/modules/diagnostics.bicep`, `apps/server/src/telemetry.ts`, `docs/decisions/2026-08-03-observability-slo-policy.md`)
* Files modified: 10 (`infra/bicep/modules/monitoring.bicep`, `infra/bicep/main.bicep`, `scripts/bootstrap-cd-environment.sh`, `.github/workflows/cd.yml`, `apps/server/package.json`, `apps/server/Dockerfile`, `apps/server/src/index.ts`, `apps/client/package.json`, `apps/client/src/network/useSocketConnection.ts`, `package-lock.json`) plus tracking plan state
* Files removed: 0

Validation status:

* `cd apps/server && npm run lint && npm run build && npm test` passed
* `cd apps/client && npm run lint && npm run build && npm test` passed
* `az bicep build --file infra/bicep/main.bicep` passed
* `bash -n scripts/bootstrap-cd-environment.sh` passed

No blocking issues were identified. Non-blocking warnings were captured in Additional or Deviating Changes.
