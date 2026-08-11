import { defineConfig } from '@playwright/test'

const TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
const common = [
  'E2E_TEST_MODE=true',
  `E2E_RESET_TOKEN=${TOKEN}`,
  'NODE_ENV=test',
  'FEATURE_MULTI_REPLICA_READY=true',
  'FEATURE_QUILT_PROTOCOL_V2_ENABLED=true',
  'FEATURE_LEGACY_MUTATION_COMPATIBILITY_ENABLED=false',
  'FEATURE_PROTOCOL_V2_MUTATION_ENABLED=true',
  'AUTH_TEST_ISSUER=true',
  'AUTH_TRUSTED_ISSUER=http://127.0.0.1:3299/',
  'AUTH_API_AUDIENCE=api://zzyix-e2e',
  'AUTH_REQUIRED_SCOPE=quilt.access',
  'AUTH_AGENT_TRUSTED_ISSUER=http://127.0.0.1:3299/',
  'AUTH_AGENT_API_AUDIENCE=api://zzyix-e2e',
  'AUTH_JWKS_URI=http://127.0.0.1:3299/jwks',
  'AUTH_ACCEPTED_ALGORITHM=RS256',
  'HOST=127.0.0.1',
]

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['support/**/*.test.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalTeardown: './e2e/support/multiReplicaGlobalTeardown.ts',
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'NODE_ENV=test E2E_TEST_MODE=true TEST_OIDC_PORT=3299 node --import tsx/esm e2e/support/testOidcIssuer.ts',
      url: 'http://127.0.0.1:3299/.well-known/openid-configuration',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'VITE_E2E_TEST_MODE=true VITE_SERVER_URL=http://127.0.0.1:3201 VITE_TEST_OIDC_ISSUER=http://127.0.0.1:3299/ VITE_TEST_OIDC_TOKEN_URL=http://127.0.0.1:3299/token npm run dev --workspace=apps/client -- --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: [...common, 'REPLICA_ID=replica-a', 'PORT=3201', 'CORS_ORIGIN=http://127.0.0.1:4174', 'node --import tsx/esm e2e/support/startMultiReplicaServer.ts'].join(' '),
      url: 'http://127.0.0.1:3201/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: [...common, 'REPLICA_ID=replica-b', 'PORT=3202', 'CORS_ORIGIN=http://127.0.0.1:4174', 'node --import tsx/esm e2e/support/startMultiReplicaServer.ts'].join(' '),
      url: 'http://127.0.0.1:3202/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})