import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveOrProvisionPrincipal } from '../auth/principalContext.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import {
  acceptOwnershipTransfer,
  claimPatch,
  createOwnershipTransfer,
  listSessionSummaries,
  persistQuiltTilePlacement,
  persistQuiltTileRemoval,
} from './repository.js'

const enabled = process.env.RUN_AUTHORIZATION_BENCHMARKS === 'true'
const cardinality = 10_000
const mappingPrincipalId = 'f1000000-0000-4000-8000-000000000001'
const claimPrincipalId = 'f1000000-0000-4000-8000-000000000002'
const transferRecipientId = 'f1000000-0000-4000-8000-000000000003'
const mutationPrincipalId = 'f1000000-0000-4000-8000-000000000004'
const lifecycleCanvasId = 'f2000000-0000-4000-8000-000000000001'
const lifecycleQuiltId = 'f3000000-0000-4000-8000-000000000001'
const claimPatchId = 'f4000000-0000-4000-8000-000000000001'
const transferPatchId = 'f4000000-0000-4000-8000-000000000002'
const mutationCanvasId = 'f2000000-0000-4000-8000-000000000002'
const mutationQuiltId = 'f3000000-0000-4000-8000-000000000002'
const mutationPatchId = 'f4000000-0000-4000-8000-000000000003'

const localRegressionCeilingsMs = {
  principalMapping: 250,
  catalogPolicy: 1_000,
  claim: 500,
  transfer: 750,
  placement: 750,
  removal: 750,
} as const

const measure = async <Result>(operation: () => Promise<Result>): Promise<{ durationMs: number; result: Result }> => {
  const startedAt = performance.now()
  const result = await operation()
  return { durationMs: performance.now() - startedAt, result }
}

describe.runIf(enabled)('authorization query benchmark', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_authorization_benchmark')
    const pool = database.createConnection()
    try {
      await pool.query('BEGIN')
      await pool.query(`
        INSERT INTO principals (id, kind)
        SELECT ('10000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid, 'human'
        FROM generate_series(1, $1) AS value
      `, [cardinality])
      await pool.query(`
        INSERT INTO external_principal_mappings (provider_namespace, external_subject, principal_id)
        SELECT 'https://benchmark.invalid/tenant/v2.0', 'subject-' || value,
          ('10000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid
        FROM generate_series(1, $1) AS value
      `, [cardinality])
      await pool.query(`
        INSERT INTO canvases (id, updated_at)
        SELECT ('20000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
          now() - (value || ' seconds')::interval
        FROM generate_series(1, 100) AS value
      `)
      await pool.query(`
        INSERT INTO quilts (
          id, legacy_canvas_id, patch_rows, patch_columns, patch_width, patch_height, topology, protocol_version
        )
        SELECT ('30000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
          ('20000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
          10, 10, 10, 10, 'toroidal', 2
        FROM generate_series(1, 100) AS value
      `)
      await pool.query(`
        INSERT INTO patches (id, quilt_id, row, "column")
        SELECT ('40000000-0000-4000-8000-' || lpad(((quilt - 1) * 100 + offset_value)::text, 12, '0'))::uuid,
          ('30000000-0000-4000-8000-' || lpad(quilt::text, 12, '0'))::uuid,
          offset_value / 10, offset_value % 10
        FROM generate_series(1, 100) AS quilt
        CROSS JOIN generate_series(0, 99) AS offset_value
      `)
      await pool.query(`
        INSERT INTO patch_visibility_policies (patch_id)
        SELECT id FROM patches
      `)
      await pool.query(`
        INSERT INTO principals (id, kind) VALUES
          ($1, 'human'), ($2, 'human'), ($3, 'human'), ($4, 'human')
      `, [mappingPrincipalId, claimPrincipalId, transferRecipientId, mutationPrincipalId])
      await pool.query(`
        INSERT INTO external_principal_mappings (provider_namespace, external_subject, principal_id)
        VALUES ('https://benchmark.invalid/tenant/v2.0', 'benchmark-target', $1)
      `, [mappingPrincipalId])
      await pool.query(`
        INSERT INTO canvases (id) VALUES ($1), ($2)
      `, [lifecycleCanvasId, mutationCanvasId])
      await pool.query(`
        INSERT INTO quilts (
          id, legacy_canvas_id, patch_rows, patch_columns, patch_width, patch_height, topology, protocol_version
        ) VALUES
          ($1, $2, 1, 2, 10, 10, 'toroidal', 2),
          ($3, $4, 1, 1, 10, 10, 'toroidal', 2)
      `, [lifecycleQuiltId, lifecycleCanvasId, mutationQuiltId, mutationCanvasId])
      await pool.query(`
        INSERT INTO patches (id, quilt_id, row, "column", owner_principal_id, state) VALUES
          ($1, $2, 0, 0, NULL, 'unclaimed'),
          ($3, $2, 0, 1, $4, 'active'),
          ($5, $6, 0, 0, $7, 'active')
      `, [
        claimPatchId,
        lifecycleQuiltId,
        transferPatchId,
        mappingPrincipalId,
        mutationPatchId,
        mutationQuiltId,
        mutationPrincipalId,
      ])
      await pool.query(`
        INSERT INTO patch_visibility_policies (patch_id, claim_enabled) VALUES
          ($1, true), ($2, false), ($3, false)
      `, [claimPatchId, transferPatchId, mutationPatchId])
      await pool.query('COMMIT')
    } catch (error) {
      await pool.query('ROLLBACK')
      throw error
    } finally {
      await pool.end()
    }
  }, 120_000)

  afterAll(async () => database?.dispose(), 30_000)

  it('records local regression evidence at production-like cardinality', async () => {
    const principalMapping = await measure(() => resolveOrProvisionPrincipal({
      issuer: 'https://benchmark.invalid/tenant/v2.0',
      subject: 'benchmark-target',
      scope: ['quilt.access'],
      expiresAt: new Date(Date.now() + 60_000),
    }))
    const catalogPolicy = await measure(() => listSessionSummaries(mappingPrincipalId))
    const claim = await measure(() => claimPatch({
      operationId: randomUUID(),
      principalId: claimPrincipalId,
      patchId: claimPatchId,
    }))
    const transfer = await measure(async () => {
      const created = await createOwnershipTransfer({
        operationId: randomUUID(),
        patchId: transferPatchId,
        senderPrincipalId: mappingPrincipalId,
        recipientPrincipalId: transferRecipientId,
      })
      expect(created.succeeded).toBe(true)
      return acceptOwnershipTransfer({
        operationId: randomUUID(),
        transferId: created.transferId!,
        recipientPrincipalId: transferRecipientId,
      })
    })
    const tileId = randomUUID()
    const placement = await measure(() => persistQuiltTilePlacement({
      quiltId: mutationQuiltId,
      operationId: randomUUID(),
      principalId: mutationPrincipalId,
      expectedPatchRevisions: { [mutationPatchId]: 0 },
      payload: {
        tileId,
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: { x: 5, y: 5 }, rotation: 0 },
      },
    }))
    expect(placement.result).toMatchObject({ committed: true })
    const removal = await measure(() => persistQuiltTileRemoval({
      quiltId: mutationQuiltId,
      operationId: randomUUID(),
      principalId: mutationPrincipalId,
      expectedPatchRevisions: { [mutationPatchId]: 1 },
      tileId,
    }))

    const timings = {
      principalMapping: principalMapping.durationMs,
      catalogPolicy: catalogPolicy.durationMs,
      claim: claim.durationMs,
      transfer: transfer.durationMs,
      placement: placement.durationMs,
      removal: removal.durationMs,
    }
    console.info('AUTHORIZATION_BENCHMARK', JSON.stringify({
      cardinality: { principalsAndMappings: cardinality, policyProtectedPatches: cardinality },
      timingsMs: timings,
      localRegressionCeilingsMs,
      productionThresholdApproved: false,
    }))

    expect(principalMapping.result.principalId).toBe(mappingPrincipalId)
    expect(catalogPolicy.result).toHaveLength(102)
    expect(claim.result).toMatchObject({ claimed: true })
    expect(transfer.result).toMatchObject({ succeeded: true })
    expect(removal.result).toMatchObject({ committed: true })
    for (const [operation, durationMs] of Object.entries(timings)) {
      expect(durationMs, `${operation} exceeded its local-only regression ceiling`)
        .toBeLessThan(localRegressionCeilingsMs[operation as keyof typeof localRegressionCeilingsMs])
    }
  }, 30_000)
})