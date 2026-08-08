<!-- markdownlint-disable-file -->

# Application Insights Missing Wiring Investigation

**Date**: 2026-08-08  
**Issue**: Live site doesn't have Application Insights data; telemetry not appearing in Azure Portal

## Findings

### 1. Server Application (Node.js/Express)
- ✅ Has `@azure/monitor-opentelemetry` SDK in dependencies
- ✅ Has `telemetry.ts` initialization that reads `APPLICATIONINSIGHTS_CONNECTION_STRING`
- ✅ Guard check ensures graceful degradation when env var is missing
- ⚠️ **ISSUE**: Container app `update` command has `APPLICATIONINSIGHTS_CONNECTION_STRING` (line 695 in cd.yml)
- ❌ **ISSUE**: Container app `create` command is MISSING `APPLICATIONINSIGHTS_CONNECTION_STRING` (line 707 in cd.yml)
  - When server is first deployed or recreated, env var is never set
  - Telemetry initializes but has no connection string to send data to Azure

### 2. Client Application (React SPA)
- ❌ **ISSUE**: No Application Insights SDK installed (`@azure/monitor-opentelemetry-web` or `applicationinsights` not in dependencies)
- ❌ **ISSUE**: No telemetry initialization code in client
- ❌ **ISSUE**: No APPLICATIONINSIGHTS_CONNECTION_STRING passed to client container app
- Client is served by nginx in container app; server-side env vars are irrelevant for browser telemetry
- Need browser/client-side instrumentation

### 3. GitHub Variables
- Variable name used: `vars.APPLICATIONINSIGHTS_CONNECTION_STRING`
- Need to verify this is actually set in GitHub repository variables

### 4. Agent Worker
- ✅ Correctly receives `APPLICATIONINSIGHTS_CONNECTION_STRING` in both create and update commands (line 774 in cd.yml)

## Root Causes

1. **Server deployment gap**: Missing env var in container app create command
2. **Client instrumentation gap**: No Application Insights SDK or initialization in React app
3. **Potential variable gap**: GitHub variable `APPLICATIONINSIGHTS_CONNECTION_STRING` may not be set

## Solution Phases

1. Fix server container app create command to include `APPLICATIONINSIGHTS_CONNECTION_STRING`
2. Add Application Insights web SDK to client dependencies
3. Initialize Application Insights in client React app
4. Verify GitHub variable is properly configured
5. Test telemetry end-to-end after deployment

## References

- `.github/workflows/cd.yml` - lines 695 (update), 707 (create - missing var)
- `apps/server/src/telemetry.ts` - server initialization
- `apps/client/package.json` - missing SDK
- `apps/server/package.json` - has `@azure/monitor-opentelemetry`
- `infra/bicep/modules/monitoring.bicep` - creates App Insights resource
