import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const node = process.execPath
const serverUrl = 'http://127.0.0.1:3101'
const clientUrl = 'http://127.0.0.1:4173'
const issuerUrl = 'http://127.0.0.1:3199/'
const children = []
let shuttingDown = false

const spawnService = (name, args, environment) => {
  const child = spawn(node, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  })
  children.push(child)
  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`${name} stopped unexpectedly (${signal ?? code ?? 'unknown'})`)
    void shutdown(code ?? 1)
  })
  return child
}

const waitForUrl = async (url, name) => {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${name} did not become ready at ${url}`)
}

const shutdown = async (exitCode) => {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }

  const forceStop = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  }, 3_000)

  await Promise.all(children.map((child) => child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => child.once('exit', resolve))))
  clearTimeout(forceStop)
  process.exit(exitCode)
}

process.once('SIGINT', () => void shutdown(0))
process.once('SIGTERM', () => void shutdown(0))

const testEnvironment = {
  NODE_ENV: 'test',
  E2E_TEST_MODE: 'true',
}

const serverArgs = [
  ...(existsSync(path.join(root, '.env')) ? ['--env-file=.env'] : []),
  '--import',
  'tsx/esm',
  'apps/server/src/index.ts',
]

spawnService('Local OIDC issuer', [
  '--import',
  'tsx/esm',
  'e2e/support/testOidcIssuer.ts',
], {
  ...testEnvironment,
  TEST_OIDC_PORT: '3199',
})

spawnService('API server', serverArgs, {
  ...testEnvironment,
  PORT: '3101',
  HOST: '127.0.0.1',
  CORS_ORIGIN: `${clientUrl},http://localhost:4173`,
  AUTH_TEST_ISSUER: 'true',
  AUTH_TRUSTED_ISSUER: issuerUrl,
  AUTH_API_AUDIENCE: 'api://zzyix-e2e',
  AUTH_REQUIRED_SCOPE: 'quilt.access',
  AUTH_JWKS_URI: `${issuerUrl}jwks`,
  AUTH_ACCEPTED_ALGORITHM: 'RS256',
  FEATURE_MULTI_REPLICA_READY: 'true',
})

spawnService('Vite client', [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  path.join(root, 'apps/client'),
  '--host',
  '127.0.0.1',
  '--port',
  '4173',
  '--strictPort',
], {
  VITE_SERVER_URL: serverUrl,
  VITE_E2E_TEST_MODE: 'true',
  VITE_CANONICAL_ENTRY_ENABLED: 'true',
  VITE_TEST_OIDC_ISSUER: issuerUrl,
  VITE_TEST_OIDC_TOKEN_URL: '/__test-oidc/token',
})

try {
  await Promise.all([
    waitForUrl(`${issuerUrl}.well-known/openid-configuration`, 'Local OIDC issuer'),
    waitForUrl(`${serverUrl}/health`, 'API server'),
    waitForUrl(clientUrl, 'Vite client'),
  ])
  console.log(`\nLocal test-auth stack is ready: ${clientUrl}`)
  console.log('Use the Sign in button to create a local test identity. Press Ctrl+C to stop.')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await shutdown(1)
}