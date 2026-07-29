// Copyright (c) Microsoft Corporation.
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import test from 'node:test'

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

test('production rollout requires operational approvals and keeps mutation disabled', async () => {
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
  assert.match(workflow, /FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'false'/)
  assert.match(workflow, /AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED/)
  assert.match(workflow, /Mutation approval is not granted: \$\{approval_name\}/)
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

  assert.match(workflow, /const parseExactHttpsOrigin = \(name, value\) =>/)
  assert.match(workflow, /value\.includes\("\*"\)/)
  assert.match(workflow, /parsed\.protocol !== "https:"/)
  assert.match(workflow, /parsed\.username !== ""/)
  assert.match(workflow, /parsed\.password !== ""/)
  assert.match(workflow, /parsed\.pathname !== "\/"/)
  assert.match(workflow, /parsed\.search !== ""/)
  assert.match(workflow, /parsed\.hash !== ""/)
  assert.match(workflow, /parseExactHttpsOrigin\("AUTH_API_ORIGIN", process\.env\.AUTH_API_ORIGIN\)/)
  assert.match(workflow, /parseExactHttpsOrigin\("SERVER_CORS_ORIGIN", process\.env\.CONFIGURED_CORS_ORIGIN\)/)
  assert.match(workflow, /SERVER_CORS_ORIGIN must match AUTH_API_ORIGIN for same-origin deployment/)
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
  assert.doesNotMatch(dockerfile, /auth-config\.template\.json/)
})

test('nginx proxies only the documented same-origin API roots', async () => {
  const nginx = await readFile(nginxPath, 'utf8')

  assert.ok(nginx.includes('location ~ ^/(health|me|sessions|quilts|claims|ownership-transfers|account)(/|$) {'))
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
