// Copyright (c) Microsoft Corporation.
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import test from 'node:test'
import { parseExactHttpsOrigin, validateDeploymentOrigins } from './deployment-origin.mjs'

const workflowPath = new URL('../.github/workflows/cd.yml', import.meta.url)
const ciWorkflowPath = new URL('../.github/workflows/ci.yml', import.meta.url)
const infrastructurePath = new URL('../infra/bicep/main.bicep', import.meta.url)
const recoveryJobModulePath = new URL('../infra/bicep/modules/recovery-job.bicep', import.meta.url)
const dockerfilePath = new URL('../apps/client/Dockerfile', import.meta.url)
const nginxPath = new URL('../apps/client/nginx.conf', import.meta.url)
const migrationScriptPath = new URL('./verify-quilt-migration.sh', import.meta.url)
const execFileAsync = promisify(execFile)

const readWorkflow = () => readFile(workflowPath, 'utf8')

const extractCommand = (workflow, command) => {
  const start = workflow.indexOf(`az containerapp job ${command} \\\n`)
  assert.notEqual(start, -1, `workflow must invoke az containerapp job ${command}`)
  const nextCommand = workflow.indexOf('\n              az containerapp job ', start + 1)
  return workflow.slice(start, nextCommand === -1 ? undefined : nextCommand)
}

test('CD releases queue without cancelling an in-flight migration owner', async () => {
  const workflow = await readWorkflow()

  assert.match(workflow, /concurrency:\n  group: cd-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false/)
  assert.match(workflow, /if az containerapp job show[\s\S]*job execution list[\s\S]*job secret set/)
  assert.match(workflow, /properties\.status/)
})

test('production rollout requires immutable retirement evidence and keeps mutation disabled', async () => {
  const workflow = await readWorkflow()

  for (const approval of [
    'AUTH_TELEMETRY_GATE_APPROVED',
    'AUTH_ROLLBACK_GATE_APPROVED',
    'AUTH_RETENTION_POLICY_APPROVED',
    'AUTH_DELETION_COMPLETION_POLICY_APPROVED',
  ]) {
    assert.match(workflow, new RegExp(`${approval}: \\$\\{\\{ vars\\.${approval} \\}\\}`))
  }
  assert.match(workflow, /Release approval is not granted: \$\{approval_name\}/)
  assert.doesNotMatch(workflow, /"FEATURE_PROTOCOL_V2_MUTATION_ENABLED=true"/)
  assert.match(workflow, /FEATURE_PROTOCOL_V2_MUTATION_ENABLED: \$\{\{ vars\.FEATURE_PROTOCOL_V2_MUTATION_ENABLED \|\| 'false' \}\}/)
  assert.match(workflow, /AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED/)
  assert.match(workflow, /Mutation approval is not granted: \$\{approval_name\}/)
  for (const evidenceSetting of [
    'LEGACY_RETIREMENT_REPORT_SHA256',
    'LEGACY_RETIREMENT_PARITY_PASSED',
    'LEGACY_RETIREMENT_RECOVERY_PASSED',
    'LEGACY_RETIREMENT_MULTI_REPLICA_PASSED',
    'LEGACY_RETIREMENT_AUTHENTICATED_PRINCIPAL_INTEGRATION_PASSED',
    'LEGACY_RETIREMENT_ROLLBACK_POLICY_APPROVED',
  ]) {
    assert.match(workflow, new RegExp(evidenceSetting))
  }
  assert.match(workflow, /legacy-retirement-report=\$\{\{ secrets\.LEGACY_RETIREMENT_REPORT_BASE64 \}\}/)
  assert.equal(workflow.match(/LEGACY_RETIREMENT_REPORT_PATH=\$\{LEGACY_RETIREMENT_REPORT_PATH\}/g)?.length, 3)
  assert.doesNotMatch(workflow, /FEATURE_CANONICAL_DISCOVERY_ENABLED|FEATURE_CANONICAL_ENTRY_ENABLED/)
})

test('CI requires authenticated multi-replica E2E', async () => {
  const workflow = await readFile(ciWorkflowPath, 'utf8')

  assert.match(workflow, /authenticated-multi-replica-e2e:/)
  assert.match(workflow, /name: Authenticated multi-replica E2E/)
  assert.match(workflow, /needs: authenticated-e2e/)
  assert.match(workflow, /run: npm run test:e2e:multi-replica/)
})

test('restricted recovery job is provisioned and resolved from infrastructure output', async () => {
  const workflow = await readWorkflow()
  const infrastructure = await readFile(infrastructurePath, 'utf8')
  const recoveryModule = await readFile(recoveryJobModulePath, 'utf8')

  assert.match(infrastructure, /output recoveryJobName string = recoveryJob\.outputs\.jobName/)
  assert.match(workflow, /properties\.outputs\.recoveryJobName\.value/)
  assert.doesNotMatch(workflow, /RECOVERY_JOB_NAME: \$\{\{ vars\.RECOVERY_JOB_NAME \}\}/)
  assert.match(recoveryModule, /scope: recoveryJob/)
  assert.match(recoveryModule, /'Microsoft\.App\/jobs\/read'/)
  assert.match(recoveryModule, /'Microsoft\.App\/jobs\/start\/action'/)
  assert.match(recoveryModule, /'Microsoft\.App\/jobs\/executions\/read'/)
  assert.doesNotMatch(recoveryModule, /Microsoft\.Authorization\/roleAssignments\/write/)
})

test('deployment accepts only exact same-origin HTTPS client and CORS values', async () => {
  const workflow = await readWorkflow()

  assert.match(workflow, /node scripts\/validate-deployment-origins\.mjs/)
  assert.equal(parseExactHttpsOrigin('AUTH_API_ORIGIN', 'https://app.example.com'), 'https://app.example.com')

  for (const invalidOrigin of [
    '',
    'not-a-url',
    'http://app.example.com',
    'https://user:password@app.example.com',
    'https://app.example.com/path',
    'https://app.example.com?query=true',
    'https://app.example.com#fragment',
    'https://*.example.com',
  ]) {
    assert.throws(() => parseExactHttpsOrigin('AUTH_API_ORIGIN', invalidOrigin))
  }

  assert.doesNotThrow(() => validateDeploymentOrigins({
    apiOrigin: 'https://app.example.com',
    redirectUri: 'https://app.example.com/callback',
    corsOrigin: 'https://app.example.com',
  }))
  assert.throws(() => validateDeploymentOrigins({
    apiOrigin: 'https://api.example.com',
    redirectUri: 'https://app.example.com/callback',
    corsOrigin: 'https://api.example.com',
  }), /client redirect origin/)
  assert.throws(() => validateDeploymentOrigins({
    apiOrigin: 'https://app.example.com',
    redirectUri: 'https://app.example.com/callback',
    corsOrigin: 'https://api.example.com',
  }), /same-origin deployment/)
})

test('migration job create and update reassert single-owner execution settings', async () => {
  const workflow = await readWorkflow()
  const createArguments = [
    '--trigger-type Manual',
    '--replica-timeout 1800',
    '--replica-retry-limit 2',
    '--parallelism 1',
    '--replica-completion-count 1',
  ]

  const createBlock = extractCommand(workflow, 'create')
  for (const argument of createArguments) {
    assert.match(createBlock, new RegExp(argument), `create must include ${argument}`)
  }

  const updateBlock = extractCommand(workflow, 'update')
  for (const argument of createArguments.slice(1)) {
    assert.match(updateBlock, new RegExp(argument), `update must include ${argument}`)
  }

  assert.match(workflow, /az resource update[\s\S]*properties\.configuration\.triggerType=Manual/)
  assert.match(workflow, /properties\.configuration\.replicaTimeout=1800/)
  assert.match(workflow, /properties\.configuration\.replicaRetryLimit=2/)
  assert.match(workflow, /properties\.configuration\.manualTriggerConfig\.parallelism=1/)
  assert.match(workflow, /properties\.configuration\.manualTriggerConfig\.replicaCompletionCount=1/)

  assert.match(workflow, /job show[\s\S]*properties\.configuration\.triggerType/)
  assert.match(workflow, /properties\.configuration\.manualTriggerConfig\.parallelism/)
  assert.match(workflow, /properties\.configuration\.replicaTimeout/)
  assert.match(workflow, /properties\.configuration\.replicaRetryLimit/)
  assert.match(workflow, /properties\.configuration\.manualTriggerConfig\.replicaCompletionCount/)
})

test('container runtime JSON generation escapes special characters', async () => {
  const values = [
    'https://tenant.example.com/path/"quoted"',
    String.raw`client\identifier`,
    'api://identifier/scope\twith-tab'.replace('\\t', '\t'),
    'https://app.example.com',
    'https://app.example.com/callback\nnext-line'.replace('\\n', '\n'),
    'https://app.example.com/logout\rreturn'.replace('\\r', '\r'),
  ]
  const jqArguments = [
    '-n',
    '--arg', 'authority', values[0],
    '--arg', 'clientId', values[1],
    '--arg', 'apiScope', values[2],
    '--arg', 'apiOrigin', values[3],
    '--arg', 'redirectUri', values[4],
    '--arg', 'postLogoutRedirectUri', values[5],
    '{authority: $authority, clientId: $clientId, apiScope: $apiScope, apiOrigin: $apiOrigin, redirectUri: $redirectUri, postLogoutRedirectUri: $postLogoutRedirectUri}',
  ]
  const { stdout } = await execFileAsync('jq', jqArguments)

  assert.deepEqual(Object.values(JSON.parse(stdout)), values)
  const dockerfile = await readFile(dockerfilePath, 'utf8')
  assert.match(dockerfile, /apk add --no-cache gettext jq/)
  assert.match(dockerfile, /jq empty \/usr\/share\/nginx\/html\/auth-config\.json/)
  assert.match(dockerfile, /nginx -t/)
  assert.doesNotMatch(dockerfile, /FEATURE_CANONICAL_ENTRY_ENABLED|canonicalEntryEnabled/)
  assert.doesNotMatch(dockerfile, /auth-config\.template\.json/)
})

test('nginx proxies only the documented same-origin API roots', async () => {
  const nginx = await readFile(nginxPath, 'utf8')

  assert.ok(nginx.includes('location ~ ^/(health|me|sessions|ownership|quilts|claims|ownership-transfers|account)(/|$) {'))
  assert.match(nginx, /location \/socket\.io/)
  assert.match(nginx, /location \/ \{\n    try_files \$uri \$uri\/ \/index\.html;/)
})

test('migration rehearsal help is dependency-free and prefix cleanup is scoped', async () => {
  const script = await readFile(migrationScriptPath, 'utf8')
  const main = script.slice(script.indexOf('main() {'))

  assert.ok(main.indexOf('help|-h|--help)') < main.indexOf('require_command node'))
  assert.match(script, /apply_migration_prefix\(\) \(/)
  assert.match(script, /trap 'rm -rf "\$\{migrations_folder\}"' EXIT/)

  const { stdout } = await execFileAsync(migrationScriptPath.pathname, ['--help'])
  assert.match(stdout, /^Usage: verify-quilt-migration\.sh/)
})
