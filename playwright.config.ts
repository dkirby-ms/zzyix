import { defineConfig } from '@playwright/test'

const SERVER_PORT = 3101
const CLIENT_PORT = 4173
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`
const TEST_RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
const TEST_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/zzyix'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['quilt-reconnect.spec.ts', 'support/**/*.test.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : [['html', { open: 'never' }]],
  use: {
    baseURL: CLIENT_URL,
    storageState: {
      cookies: [],
      origins: [{
        origin: CLIENT_URL,
        localStorage: [{ name: 'zzyix:e2e-authenticated', value: 'true' }],
      }],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'NODE_ENV=test E2E_TEST_MODE=true TEST_OIDC_PORT=3199 node --import tsx/esm e2e/support/testOidcIssuer.ts',
      url: 'http://127.0.0.1:3199/.well-known/openid-configuration',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: [
        'E2E_TEST_MODE=true',
        `E2E_RESET_TOKEN=${TEST_RESET_TOKEN}`,
        `E2E_SERVER_URL=${SERVER_URL}`,
        `DATABASE_URL=${TEST_DATABASE_URL}`,
        'NODE_ENV=test',
        'AUTH_TEST_ISSUER=true',
        'AUTH_TRUSTED_ISSUER=http://127.0.0.1:3199/',
        'AUTH_API_AUDIENCE=api://zzyix-e2e',
        'AUTH_REQUIRED_SCOPE=quilt.access',
        'AUTH_JWKS_URI=http://127.0.0.1:3199/jwks',
        'AUTH_ACCEPTED_ALGORITHM=RS256',
        'FEATURE_MULTI_REPLICA_READY=true',
        'FEATURE_QUILT_PROTOCOL_V2_ENABLED=true',
        'FEATURE_PROTOCOL_V2_MUTATION_ENABLED=true',
        'FEATURE_CANONICAL_DISCOVERY_ENABLED=true',
        'LOG_LEVEL=info',
        `PORT=${SERVER_PORT}`,
        'HOST=127.0.0.1',
        `CORS_ORIGIN=${CLIENT_URL}`,
        'node --import tsx/esm apps/server/src/index.ts',
      ].join(' '),
      url: `${SERVER_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: [
        `VITE_SERVER_URL=${SERVER_URL}`,
        'VITE_E2E_TEST_MODE=true',
        'VITE_CANONICAL_ENTRY_ENABLED=true',
        'VITE_TEST_OIDC_ISSUER=http://127.0.0.1:3199/',
        'npm run dev --workspace=apps/client -- --host 127.0.0.1 --port 4173 --strictPort',
      ].join(' '),
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
