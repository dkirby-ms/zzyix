<!-- markdownlint-disable-file -->

# Application Insights Wiring Fixes - Changes Summary

**Date**: 2026-08-08  
**Issue**: Live site doesn't have Application Insights data  
**Root Cause**: Server create command missing env var, client has no telemetry instrumentation  

## Changes Made

### 1. Server Deployment Fix

**File**: `.github/workflows/cd.yml`

- **Issue**: Server container app `create` command was missing `APPLICATIONINSIGHTS_CONNECTION_STRING` env var
- **Fix**: Added `APPLICATIONINSIGHTS_CONNECTION_STRING=${{ vars.APPLICATIONINSIGHTS_CONNECTION_STRING }}` and `OTEL_SERVICE_NAME=zzyix-server` and `OTEL_SAMPLING_RATIO=${{ vars.OTEL_SAMPLING_RATIO || '1.0' }}` to the server create command (lines ~707-715)
- **Impact**: When server is first deployed or recreated, it will now receive the connection string and initialize telemetry

### 2. Client Application Insights SDK

**File**: `apps/client/package.json`

- **Issue**: Client React app had no Application Insights SDK installed
- **Fix**: Added `@azure/monitor-opentelemetry-web` v1.5.0 to dependencies
- **Impact**: Client now has the capability to initialize Application Insights browser telemetry

### 3. Client Telemetry Config Loader

**File**: `apps/client/src/config/telemetryConfig.ts` (new file)

- **Purpose**: Loads telemetry configuration from runtime endpoint (`/telemetry-config.json`)
- **Features**:
  - Gracefully handles missing configuration
  - Returns `null` if telemetry is not configured
  - Provides structured type for config validation
  - Graceful error handling and logging

### 4. Client Telemetry Initialization Module

**File**: `apps/client/src/telemetry.ts` (new file)

- **Purpose**: Initializes Application Insights SDK on app startup
- **Features**:
  - Async initialization that doesn't block app rendering
  - Graceful failure if telemetry config is missing
  - Console logging for debugging

### 5. Main Entry Point Update

**File**: `apps/client/src/main.tsx`

- **Change**: Added `initializeTelemetry()` call before React rendering
- **Implementation**: Non-blocking async call with fire-and-forget pattern
- **Impact**: Telemetry initialization starts as early as possible without blocking UI

### 6. Client Container Runtime Configuration

**File**: `apps/client/Dockerfile`

- **Change**: Updated nginx entrypoint script to generate `telemetry-config.json`
- **Implementation**:
  - Checks for `APPLICATIONINSIGHTS_CONNECTION_STRING` environment variable
  - If present: generates JSON config file with the connection string
  - If absent: generates `null` to disable telemetry gracefully
  - Uses jq for safe JSON generation
- **Impact**: Telemetry config is injected at container startup, matching the auth-config pattern

### 7. Client Container Deployment

**File**: `.github/workflows/cd.yml`

- **Changes**:
  - Client container app `update` command: Added `APPLICATIONINSIGHTS_CONNECTION_STRING=${{ vars.APPLICATIONINSIGHTS_CONNECTION_STRING }}`
  - Client container app `create` command: Added `APPLICATIONINSIGHTS_CONNECTION_STRING=${{ vars.APPLICATIONINSIGHTS_CONNECTION_STRING }}`
- **Impact**: Client container receives the connection string at deployment time for runtime injection

## Architecture

### Server Telemetry Flow

```
GitHub Vars (APPLICATIONINSIGHTS_CONNECTION_STRING)
          ↓
CD Workflow (cd.yml) passes to container app env
          ↓
Server app startup (dist/telemetry.js)
          ↓
@azure/monitor-opentelemetry initializes
          ↓
Traces/metrics sent to Azure Application Insights
```

### Client Telemetry Flow

```
GitHub Vars (APPLICATIONINSIGHTS_CONNECTION_STRING)
          ↓
CD Workflow (cd.yml) passes to container app env
          ↓
Nginx entrypoint generates telemetry-config.json
          ↓
React app loads from /telemetry-config.json
          ↓
main.tsx calls initializeTelemetry()
          ↓
@azure/monitor-opentelemetry-web initializes
          ↓
Browser traces/metrics sent to Azure Application Insights
```

## Graceful Degradation

Both server and client handle missing `APPLICATIONINSIGHTS_CONNECTION_STRING` gracefully:

- **Server**: Guard in telemetry.ts only initializes if env var is present
- **Client**: 
  - telemetry-config.json can be `null` or missing
  - telemetry.ts catches all errors and logs without crashing
  - App continues to function normally without telemetry

## Testing Checklist

- [ ] GitHub variable `APPLICATIONINSIGHTS_CONNECTION_STRING` is set to connection string from Azure
- [ ] GitHub variable `OTEL_SAMPLING_RATIO` is optionally set (defaults to 1.0)
- [ ] Deploy server - verify `APPLICATIONINSIGHTS_CONNECTION_STRING` env var is present in Container App
- [ ] Deploy client - verify `APPLICATIONINSIGHTS_CONNECTION_STRING` env var is present in Container App
- [ ] Access live site - open browser console and check for telemetry logs
- [ ] Check Azure Portal Application Insights - should see incoming traces from both server and client
- [ ] Test graceful degradation - temporarily remove env var from GitHub variables and redeploy

## Files Modified

- `.github/workflows/cd.yml` (2 changes: server create + client update/create)
- `apps/client/package.json` (1 change: add SDK dependency)
- `apps/client/Dockerfile` (1 change: add telemetry-config.json generation)
- `apps/client/src/main.tsx` (1 change: initialize telemetry)

## Files Created

- `apps/client/src/config/telemetryConfig.ts` (new: runtime config loader)
- `apps/client/src/telemetry.ts` (new: initialization module)

## Next Steps

1. Ensure `vars.APPLICATIONINSIGHTS_CONNECTION_STRING` is properly set in GitHub repository
2. Redeploy server and client to Azure Container Apps
3. Monitor Application Insights in Azure Portal for incoming telemetry data
4. Verify both server and client traces are appearing
