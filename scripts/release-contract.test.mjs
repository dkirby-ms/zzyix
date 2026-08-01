// Copyright (c) Microsoft Corporation.
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import test from 'node:test'
import { generateNotes } from '@semantic-release/release-notes-generator'
import { parseExactHttpsOrigin, validateDeploymentOrigins } from './deployment-origin.mjs'

const workflowPath = new URL('../.github/workflows/cd.yml', import.meta.url)
const ciWorkflowPath = new URL('../.github/workflows/ci.yml', import.meta.url)
const infrastructurePath = new URL('../infra/bicep/main.bicep', import.meta.url)
const recoveryJobModulePath = new URL('../infra/bicep/modules/recovery-job.bicep', import.meta.url)
const dockerfilePath = new URL('../apps/client/Dockerfile', import.meta.url)
const nginxPath = new URL('../apps/client/nginx.conf', import.meta.url)
const migrationScriptPath = new URL('./verify-quilt-migration.sh', import.meta.url)
const purgeScriptPath = new URL('./database-purge.sh', import.meta.url)
const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const releaseConfig = require('../.releaserc.cjs')

const readWorkflow = () => readFile(workflowPath, 'utf8')

const extractPluginConfig = (releaseConfig, pluginName) =>
  releaseConfig.plugins.find(([name]) => name === pluginName)?.[1]

const extractServerDeploymentBranches = (workflow) => {
  const deploymentStart = workflow.indexOf('      - name: Deploy Server Container App')
  const deploymentEnd = workflow.indexOf('      - name: Deploy Client Container App', deploymentStart)
  assert.notEqual(deploymentStart, -1, 'workflow must deploy the server container app')
  assert.notEqual(deploymentEnd, -1, 'workflow must delimit the server deployment step')

  const deployment = workflow.slice(deploymentStart, deploymentEnd)
  const updateStart = deployment.indexOf('            if az containerapp show \\\n')
  const createStart = deployment.indexOf('            else\n              CREATE_REGISTRY_ARGS=()', updateStart)
  const branchesEnd = deployment.indexOf('\n            server_ingress_external=', createStart)
  assert.notEqual(updateStart, -1, 'server deployment must detect an existing app')
  assert.notEqual(createStart, -1, 'server deployment must include a create branch')
  assert.notEqual(branchesEnd, -1, 'server deployment branches must end before ingress validation')

  return {
    update: deployment.slice(updateStart, createStart),
    create: deployment.slice(createStart, branchesEnd),
  }
}

const extractCommand = (workflow, command) => {
  const start = workflow.indexOf(`az containerapp job ${command} \\\n`)
  assert.notEqual(start, -1, `workflow must invoke az containerapp job ${command}`)
  const nextCommand = workflow.indexOf('\n              az containerapp job ', start + 1)
  return workflow.slice(start, nextCommand === -1 ? undefined : nextCommand)
}

test('CD releases queue without cancelling an in-flight migration owner', async () => {
  const workflow = await readWorkflow()

  assert.match(workflow, /concurrency:\n  group: cd-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false/)
  assert.match(workflow, /if az containerapp job show[\s\S]*job execution list[\s\S]*job update[\s\S]*job start/)
  assert.match(workflow, /properties\.status/)
})

test('production rollout excludes legacy migration gates', async () => {
  const workflow = await readWorkflow()
  const deploymentBranches = extractServerDeploymentBranches(workflow)

  for (const approval of [
    'AUTH_TELEMETRY_GATE_APPROVED',
    'AUTH_ROLLBACK_GATE_APPROVED',
    'AUTH_RETENTION_POLICY_APPROVED',
    'AUTH_DELETION_COMPLETION_POLICY_APPROVED',
  ]) {
    assert.match(workflow, new RegExp(`${approval}: \\$\\{\\{ vars\\.${approval} \\}\\}`))
  }
  assert.match(workflow, /Release approval is not granted: \$\{approval_name\}/)
  for (const legacySetting of [
    'AUTH_OWNER_E2E_GATE_APPROVED',
    'AUTH_MIGRATION_REHEARSAL_APPROVED',
    'AUTH_MUTATION_ROLLBACK_APPROVED',
    'AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED',
    'FEATURE_PROTOCOL_V2_MUTATION_ENABLED',
    'FEATURE_QUILT_PROTOCOL_V2_ENABLED',
    'LEGACY_RETIREMENT_',
  ]) {
    assert.doesNotMatch(workflow, new RegExp(legacySetting))
  }
  for (const [branchName, branch] of Object.entries(deploymentBranches)) {
    assert.doesNotMatch(branch, /LEGACY_RETIREMENT|FEATURE_PROTOCOL_V2|AUTH_MIGRATION_REHEARSAL/, `${branchName} deployment must exclude legacy gates`)
  }
  assert.doesNotMatch(workflow, /FEATURE_CANONICAL_DISCOVERY_ENABLED|FEATURE_CANONICAL_ENTRY_ENABLED/)
})

test('CI requires authenticated multi-replica E2E', async () => {
  const workflow = await readFile(ciWorkflowPath, 'utf8')

  assert.match(workflow, /authenticated-multi-replica-e2e:/)
  assert.match(workflow, /name: Authenticated multi-replica E2E/)
  assert.match(workflow, /needs: authenticated-e2e/)
  assert.match(workflow, /run: npm run test:e2e:multi-replica/)
})

test('release workflow produces one repository changelog', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  const releaseNotesPlugin = extractPluginConfig(releaseConfig, '@semantic-release/release-notes-generator')
  const changelogPlugin = extractPluginConfig(releaseConfig, '@semantic-release/changelog')
  const gitPlugin = extractPluginConfig(releaseConfig, '@semantic-release/git')

  assert.equal(releaseConfig.tagFormat, 'v${version}')
  assert.equal(changelogPlugin?.changelogFile, 'CHANGELOG.md')
  assert.deepEqual(gitPlugin?.assets, ['CHANGELOG.md'])
  assert.match(workflow, /run: npm run release/)
  assert.doesNotMatch(workflow, /release:(client|server)|should-release-app/)
  assert.ok(releaseNotesPlugin?.presetConfig?.types, 'release notes generator must declare changelog sections')

  assert.deepEqual(
    releaseNotesPlugin.presetConfig.types.filter(({ type }) => type === 'feat' || type === 'fix'),
    [
      { type: 'feat', section: 'Features', hidden: false },
      { type: 'fix', section: 'Bug Fixes', hidden: false },
    ],
    'release notes generator must render Features and Bug Fixes sections',
  )

  const notes = await generateNotes(releaseNotesPlugin, {
    commits: [
      { hash: '1234567890abcdef', message: 'fix(client): preserve release details' },
      { hash: 'abcdef1234567890', message: 'test(server): cover changelog generation' },
    ],
    lastRelease: { gitTag: 'v1.0.0' },
    nextRelease: { gitTag: 'v1.0.1', version: '1.0.1' },
    options: { repositoryUrl: 'https://github.com/dkirby-ms/zzyix.git' },
    cwd: new URL('..', import.meta.url).pathname,
  })

  assert.match(notes, /### Bug Fixes/)
  assert.match(notes, /preserve release details/)
  assert.match(notes, /### Tests/)
  assert.match(notes, /cover changelog generation/)
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

test('database-purge enforces safety contracts and rejects invalid arguments', async () => {
  const script = await readFile(purgeScriptPath, 'utf8')
  const main = script.slice(script.indexOf('main() {'))

  // Help flag must be handled inside the arg-parsing loop, before psql is required
  assert.ok(
    main.indexOf('--help|-h)') < main.indexOf("require_command 'psql'"),
    'help must be accessible before psql is required',
  )

  // Script must use strict error handling
  assert.match(script, /set -euo pipefail/)

  // purge_all must delete every canonical game-data table to avoid partial purges
  for (const table of ['authorization_audit_events', 'canonical_world', 'tiles', 'quilts', 'canvases']) {
    assert.match(script, new RegExp(`DELETE FROM ${table}`), `purge_all must delete from ${table}`)
  }

  // Canvas-scoped purge must gate audit deletion on quilt and patch membership
  assert.match(script, /WHERE quilt_id IN \(SELECT id FROM target_quilt\)/)
  assert.match(script, /FROM patches\b/)

  // Canvas-scoped tile deletion must include tiles that reference target-quilt patches via
  // anchor_patch_id even when those tiles belong to a different canvas (quilt_id = NULL).
  // Without this clause, cascade-deleting quilt patches raises a RESTRICT FK violation.
  assert.match(
    script,
    /anchor_patch_id IN[\s\S]*SELECT id FROM patches[\s\S]*quilt_id IN/,
    'purge_canvas must clear cross-canvas anchor_patch_id references before deleting patches',
  )

  // --yes bypass must be an explicit opt-in to skip interactive confirmation
  assert.match(script, /bypass_confirmation.*==.*['"']true['"']/)

  // --help output must describe all supported options
  const { stdout } = await execFileAsync(purgeScriptPath.pathname, ['--help'])
  assert.match(stdout, /^Usage: database-purge\.sh/)
  assert.match(stdout, /--canvas-id/)
  assert.match(stdout, /--database-url/)
  assert.match(stdout, /--yes/)

  // Unknown argument must be rejected before any database connection attempt
  await assert.rejects(
    execFileAsync(purgeScriptPath.pathname, ['--bogus']),
    (err) => { assert.match(err.stderr, /Unknown argument: --bogus/); return true },
  )

  // --canvas-id must require a non-flag value
  await assert.rejects(
    execFileAsync(purgeScriptPath.pathname, ['--canvas-id']),
    (err) => { assert.match(err.stderr, /--canvas-id requires a value/); return true },
  )

  // --database-url must require a non-flag value
  await assert.rejects(
    execFileAsync(purgeScriptPath.pathname, ['--database-url']),
    (err) => { assert.match(err.stderr, /--database-url requires a value/); return true },
  )

  // Missing DATABASE_URL and SERVER_DATABASE_URL must produce a clear error
  await assert.rejects(
    execFileAsync(purgeScriptPath.pathname, ['--yes'], { env: { ...process.env, DATABASE_URL: '', SERVER_DATABASE_URL: '' } }),
    (err) => { assert.match(err.stderr, /DATABASE_URL or SERVER_DATABASE_URL must be set/); return true },
  )

  // Incorrect confirmation text must abort the purge
  await assert.rejects(
    new Promise((resolve, reject) => {
      const child = execFile(
        purgeScriptPath.pathname,
        ['--database-url', 'postgresql://localhost/test'],
        (err, stdout, stderr) => (err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr })),
      )
      child.stdin.end('wrong\n')
    }),
    (err) => { assert.match(err.stderr, /Confirmation text did not match/); return true },
  )
})
