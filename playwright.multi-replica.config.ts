import { defineConfig } from '@playwright/test'

const TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
const common = [
  'E2E_TEST_MODE=true',
  `E2E_RESET_TOKEN=${TOKEN}`,
  'NODE_ENV=test',
  'FEATURE_MULTI_REPLICA_READY=true',
  'FEATURE_QUILT_PROTOCOL_V2_ENABLED=true',
  'FEATURE_LEGACY_MUTATION_COMPATIBILITY_ENABLED=false',
  'HOST=127.0.0.1',
]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalTeardown: './e2e/support/multiReplicaGlobalTeardown.ts',
  use: { trace: 'retain-on-failure' },
  webServer: [
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