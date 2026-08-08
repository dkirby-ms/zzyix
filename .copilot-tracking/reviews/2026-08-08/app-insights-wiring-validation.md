<!-- markdownlint-disable-file -->

# Application Insights Wiring - Validation Plan

**Date**: 2026-08-08

## Pre-Deployment Checks

### 1. GitHub Variable Verification

Check that the repository has the required GitHub variable set:

```bash
# This needs to be verified in GitHub Settings:
# Settings → Secrets and variables → Variables → APPLICATIONINSIGHTS_CONNECTION_STRING

# Expected format:
# InstrumentationKey=<key>;IngestionEndpoint=https://<region>.in.applicationinsights.azure.com/;...
```

**Validation**: 
- [ ] Variable `APPLICATIONINSIGHTS_CONNECTION_STRING` exists in GitHub repository variables
- [ ] Value is a valid Application Insights connection string
- [ ] Not empty or containing placeholder text

### 2. Code Changes Validation

#### Server Changes
- [x] `.github/workflows/cd.yml` line ~707: Server `az containerapp create` includes `APPLICATIONINSIGHTS_CONNECTION_STRING`
- [x] `.github/workflows/cd.yml` line ~695: Server `az containerapp update` includes `APPLICATIONINSIGHTS_CONNECTION_STRING`
- [x] `apps/server/src/telemetry.ts`: Guard check allows graceful startup if env var is missing

#### Client Changes
- [x] `apps/client/package.json`: Contains `@azure/monitor-opentelemetry-web` dependency
- [x] `apps/client/src/telemetry.ts` (new): Implements initialization
- [x] `apps/client/src/config/telemetryConfig.ts` (new): Implements config loader
- [x] `apps/client/src/main.tsx`: Calls `initializeTelemetry()` before React render
- [x] `apps/client/Dockerfile`: Entrypoint generates `telemetry-config.json` from env var

### 3. Local Development Test

Test locally before deploying to cloud:

```bash
# Terminal 1: Start dev servers
npm run dev

# Terminal 2: Check for telemetry initialization
# Open browser console (F12 → Console)
# Look for messages like:
# [telemetry] Application Insights initialized successfully
# or
# [telemetry] Telemetry not configured; Application Insights will not be initialized
```

**Validation**:
- [ ] Client starts without errors
- [ ] Browser console shows telemetry logs
- [ ] Application continues to function normally

### 4. Build Validation

```bash
# Test building the client locally
cd apps/client
npm install
npm run build

# Check that build succeeds
# Verify dist folder exists and contains index.html, telemetry config loader, etc
```

**Validation**:
- [ ] Client builds successfully
- [ ] No telemetry-related build errors

## Post-Deployment Checks

### 5. Container Deployment Validation

After CD pipeline runs:

```bash
# Verify server container app env vars
az containerapp show \
  --resource-group <resource-group> \
  --name <server-container-app-name> \
  --query properties.template.containers[0].env \
  --output table

# Look for APPLICATIONINSIGHTS_CONNECTION_STRING in the output
```

**Validation**:
- [ ] Server container app has `APPLICATIONINSIGHTS_CONNECTION_STRING` set
- [ ] Server container app has `OTEL_SERVICE_NAME=zzyix-server`
- [ ] Client container app has `APPLICATIONINSIGHTS_CONNECTION_STRING` set

### 6. Runtime Configuration Check

```bash
# From browser console or server logs, check that config was loaded:

# Browser (client):
# fetch('/telemetry-config.json').then(r => r.json()).then(console.log)

# Should return:
# {connectionString: "InstrumentationKey=..."}
# or
# null (if not configured)

# Server logs:
# Should show: [telemetry] Azure Monitor initialization failed; 
#   or no telemetry messages if not initialized
```

**Validation**:
- [ ] `/telemetry-config.json` is accessible and returns valid JSON
- [ ] Connection string matches GitHub variable value
- [ ] Server logs show successful initialization or graceful skipping

### 7. Application Insights Portal Check

```bash
# In Azure Portal:
# Navigate to Application Insights resource
# Check these sections:

# 1. Performance > Page View Load Time
#    Should show incoming requests from browser

# 2. Availability > Custom availability test results
#    Should show traces from both server and client

# 3. Metrics
#    Should show Request Duration, Dependency Duration, Server Response Time

# 4. Performance > Server response time
#    Should show server-side performance data

# 5. Browser > Page load performance
#    Should show client-side performance data
```

**Validation**:
- [ ] Application Insights shows incoming telemetry data
- [ ] Both server and client traces are present (within 5-10 minutes of deployment)
- [ ] Performance metrics are being recorded
- [ ] No exceptions or errors in Failures view (unless expected)

### 8. End-to-End Validation

```bash
# Navigate to live site
# Perform some user actions:
# - Load page
# - Navigate between features
# - Trigger some API calls

# Expected telemetry:
# - Page views and timing
# - API call performance
# - Server response times
# - Client-side errors (if any)
```

**Validation**:
- [ ] Live site functions normally
- [ ] No console errors related to telemetry
- [ ] Application Insights shows activity in real-time (or within ~1 minute)

### 9. Graceful Degradation Test (Optional)

If you want to verify graceful degradation:

```bash
# Temporarily unset the GitHub variable:
# Settings → Secrets and variables → Variables → APPLICATIONINSIGHTS_CONNECTION_STRING → Delete

# Redeploy the application

# Verify:
# - Server starts without errors
# - Client loads without errors
# - No telemetry data appears in Application Insights
# - `/telemetry-config.json` returns `null`

# Then restore the variable and redeploy
```

## Troubleshooting

### Server Telemetry Not Working

1. Check env var: `az containerapp show ... | grep APPLICATIONINSIGHTS_CONNECTION_STRING`
2. Check server logs for initialization errors
3. Verify connection string format: `InstrumentationKey=...;IngestionEndpoint=...`
4. Check if server app has network access to Application Insights endpoint

### Client Telemetry Not Working

1. Open browser console (F12) and look for telemetry logs
2. Check `/telemetry-config.json` response in Network tab
3. Verify `@azure/monitor-opentelemetry-web` was included in build
4. Check if browser has network access to Application Insights endpoint
5. Look for Content Security Policy (CSP) violations that might block telemetry

### Data Not Appearing in Portal

1. Wait 5-10 minutes (telemetry ingestion can have latency)
2. Refresh Application Insights portal
3. Check sampling ratio - if `OTEL_SAMPLING_RATIO=0.1`, only 10% of traces are sampled
4. Verify ingestion endpoint in connection string is correct for your region
5. Check Application Insights resource is in the correct Azure subscription

## Success Criteria

✅ All of the following must be true:

1. Server container app has `APPLICATIONINSIGHTS_CONNECTION_STRING` env var set
2. Client container app has `APPLICATIONINSIGHTS_CONNECTION_STRING` env var set
3. Browser console shows telemetry initialization messages
4. `/telemetry-config.json` endpoint is accessible and returns valid config
5. Application Insights portal shows incoming telemetry data within 10 minutes
6. Both server and client traces are visible in Application Insights
7. Live site continues to function normally without any errors
8. Performance metrics are being recorded for both client and server

## Rollback Plan

If telemetry breaks the application:

1. The application is designed to fail gracefully if telemetry doesn't initialize
2. If needed, revert the commits that added telemetry wiring
3. Redeploy previous version
4. Application should continue to work normally

No data loss or critical failures expected from telemetry initialization.
