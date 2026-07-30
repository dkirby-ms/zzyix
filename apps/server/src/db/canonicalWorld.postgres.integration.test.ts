import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  activateCanonicalWorld,
  CanonicalWorldGenerationConflictError,
  CanonicalWorldTargetInvalidError,
  deactivateCanonicalWorld,
  discoverCanonicalWorld,
  ensureCanonicalPatchAssignment,
  getCanonicalWorldStatus,
  listEligibleCanonicalPatches,
  provisionCanonicalWorld,
  resolveCanonicalPatchNavigation,
  type CanonicalProvisionInput,
} from './repository.js'
import {
  closeDatabaseBundle,
  configureDatabaseBundleForTests,
  createDatabaseBundle,
  getDatabaseBundle,
} from './client.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'

const provisionInput: CanonicalProvisionInput = {
  action: 'provision',
  expectedGeneration: 0,
  patchRows: 2,
  patchColumns: 3,
  patchWidth: 31.2,
  patchHeight: 20.4,
  originX: 0,
  originY: 0,
  operatorId: 'integration-test',
  reason: 'verify canonical control plane',
}

describe('canonical world control plane', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_canonical_world')
  }, 30_000)

  beforeEach(async () => {
    await getDatabaseBundle().db.execute(sql`truncate table canvases, principals cascade`)
  })

  afterAll(async () => database?.dispose(), 30_000)

  it('atomically provisions only the complete canonical graph and replays without writes', async () => {
    const created = await provisionCanonicalWorld(provisionInput)
    expect(created).toMatchObject({
      schemaVersion: 1,
      action: 'provision',
      result: 'succeeded',
      idempotent: false,
      productKey: 'canonical',
      pointerStatus: 'inactive',
      generation: 1,
      quilt: {
        topology: 'toroidal',
        protocolVersion: 2,
        patchRows: 2,
        patchColumns: 3,
        patchWidth: 31.2,
        patchHeight: 20.4,
        originX: 0,
        originY: 0,
      },
      patchCount: 6,
      initialPatch: { row: 0, column: 0 },
      policyVersion: 1,
    })

    const pool = database.createConnection()
    try {
      const graphCounts = await pool.query<{
        canvases: string
        quilts: string
        patches: string
        policies: string
        principals: string
        memberships: string
        tiles: string
        participants: string
        operations: string
        snapshots: string
        spatialReferences: string
      }>(`
        SELECT
          (SELECT count(*) FROM canvases)::text AS canvases,
          (SELECT count(*) FROM quilts)::text AS quilts,
          (SELECT count(*) FROM patches)::text AS patches,
          (SELECT count(*) FROM patch_visibility_policies)::text AS policies,
          (SELECT count(*) FROM principals)::text AS principals,
          (SELECT count(*) FROM patch_memberships)::text AS memberships,
          (SELECT count(*) FROM tiles)::text AS tiles,
          (SELECT count(*) FROM participants)::text AS participants,
          (SELECT count(*) FROM patch_operations)::text AS operations,
          (SELECT count(*) FROM patch_snapshots)::text AS snapshots,
          (SELECT count(*) FROM tile_spatial_refs)::text AS "spatialReferences"
      `)
      expect(graphCounts.rows[0]).toEqual({
        canvases: '1',
        quilts: '1',
        patches: '6',
        policies: '6',
        principals: '0',
        memberships: '0',
        tiles: '0',
        participants: '0',
        operations: '0',
        snapshots: '0',
        spatialReferences: '0',
      })
      const beforeReplay = await pool.query<{ fingerprint: string }>(`
        SELECT md5(string_agg(value, '|' ORDER BY value)) AS fingerprint
        FROM (
          SELECT concat_ws(':', product_key, quilt_id, status, generation, created_at, updated_at) AS value
          FROM canonical_world
          UNION ALL
          SELECT concat_ws(':', id, quilt_id, row, "column", state, revision) FROM patches
          UNION ALL
          SELECT concat_ws(':', patch_id, existence, fine_data, aggregate_data, presence, search,
            durable_events, claim_enabled, policy_version) FROM patch_visibility_policies
        ) records
      `)
      const replay = await provisionCanonicalWorld(provisionInput)
      const afterReplay = await pool.query<{ fingerprint: string }>(`
        SELECT md5(string_agg(value, '|' ORDER BY value)) AS fingerprint
        FROM (
          SELECT concat_ws(':', product_key, quilt_id, status, generation, created_at, updated_at) AS value
          FROM canonical_world
          UNION ALL
          SELECT concat_ws(':', id, quilt_id, row, "column", state, revision) FROM patches
          UNION ALL
          SELECT concat_ws(':', patch_id, existence, fine_data, aggregate_data, presence, search,
            durable_events, claim_enabled, policy_version) FROM patch_visibility_policies
        ) records
      `)
      expect(replay).toEqual({ ...created, result: 'idempotent', idempotent: true })
      expect(afterReplay.rows[0]?.fingerprint).toBe(beforeReplay.rows[0]?.fingerprint)
    } finally {
      await pool.end()
    }
  })

  it('applies exact generation CAS and keeps discovery active-only', async () => {
    const provisioned = await provisionCanonicalWorld(provisionInput)
    const quiltId = provisioned.quilt?.id
    expect(quiltId).toBeDefined()
    await expect(activateCanonicalWorld({
      action: 'activate',
      quiltId: quiltId!,
      expectedGeneration: 0,
      operatorId: 'integration-test',
      reason: 'stale activation',
    })).rejects.toBeInstanceOf(CanonicalWorldGenerationConflictError)
    expect(await discoverCanonicalWorld()).toBeNull()
    await expect(activateCanonicalWorld({
      action: 'activate',
      quiltId: 'ca000000-0000-4000-8000-000000000099',
      expectedGeneration: 1,
      operatorId: 'integration-test',
      reason: 'attempt to repoint provisioned pointer',
    })).rejects.toBeInstanceOf(CanonicalWorldGenerationConflictError)

    const activated = await activateCanonicalWorld({
      action: 'activate',
      quiltId: quiltId!,
      expectedGeneration: 1,
      operatorId: 'integration-test',
      reason: 'activate target',
    })
    expect(activated).toMatchObject({ pointerStatus: 'active', generation: 2, idempotent: false })
    expect(await discoverCanonicalWorld()).toMatchObject({
      quiltId,
      legacyCanvasId: provisioned.quilt?.legacyCanvasId,
      generation: 2,
      initialPatch: provisioned.initialPatch,
    })
    await expect(activateCanonicalWorld({
      action: 'activate',
      quiltId: quiltId!,
      expectedGeneration: 1,
      operatorId: 'integration-test',
      reason: 'repeat activation',
    })).resolves.toMatchObject({ generation: 2, idempotent: true, result: 'idempotent' })

    await expect(deactivateCanonicalWorld({
      action: 'deactivate',
      expectedGeneration: 2,
      operatorId: 'integration-test',
      reason: 'routing rollback',
    })).resolves.toMatchObject({ pointerStatus: 'inactive', generation: 3, idempotent: false })
    expect(await discoverCanonicalWorld()).toBeNull()
    await expect(deactivateCanonicalWorld({
      action: 'deactivate',
      expectedGeneration: 2,
      operatorId: 'integration-test',
      reason: 'repeat rollback',
    })).resolves.toMatchObject({ generation: 3, idempotent: true, result: 'idempotent' })
    await expect(activateCanonicalWorld({
      action: 'activate',
      quiltId: quiltId!,
      expectedGeneration: 3,
      operatorId: 'integration-test',
      reason: 'attempt to reactivate after retirement rollback',
    })).rejects.toBeInstanceOf(CanonicalWorldGenerationConflictError)
  })

  it('discovers eligible patches row-major and navigates by stable patch identity', async () => {
    const principalId = 'ca000000-0000-4000-8000-000000000001'
    const provisioned = await provisionCanonicalWorld(provisionInput)
    const quiltId = provisioned.quilt!.id
    await activateCanonicalWorld({
      action: 'activate', quiltId, expectedGeneration: 1, operatorId: 'integration-test', reason: 'discover patches',
    })
    await getDatabaseBundle().db.execute(sql`
      insert into principals (id, kind) values (${principalId}, 'human')
    `)

    const eligible = await listEligibleCanonicalPatches(principalId)
    expect(eligible).toMatchObject({ quiltId, generation: 2, claimAllowed: true })
    expect(eligible?.patches.map(({ row, column }) => [row, column])).toEqual([
      [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2],
    ])

    const target = eligible!.patches[4]
    await expect(resolveCanonicalPatchNavigation(quiltId, target.patchId)).resolves.toEqual(target)
    await expect(resolveCanonicalPatchNavigation('ca000000-0000-4000-8000-000000000099', target.patchId)).resolves.toBeNull()

    await getDatabaseBundle().db.execute(sql`
      update patches set owner_principal_id = ${principalId}, state = 'active' where id = ${target.patchId}
    `)
    await expect(listEligibleCanonicalPatches(principalId)).resolves.toMatchObject({ claimAllowed: false, patches: [] })
  })

  it('assigns one stable random patch per principal without collisions', async () => {
    const principalIds = [
      'ca000000-0000-4000-8000-000000000011',
      'ca000000-0000-4000-8000-000000000012',
    ]
    const provisioned = await provisionCanonicalWorld(provisionInput)
    await activateCanonicalWorld({
      action: 'activate', quiltId: provisioned.quilt!.id, expectedGeneration: 1,
      operatorId: 'integration-test', reason: 'assign patches',
    })
    await getDatabaseBundle().db.execute(sql`
      insert into principals (id, kind) values
        (${principalIds[0]}, 'human'),
        (${principalIds[1]}, 'human')
    `)

    const assignments = await Promise.all(principalIds.map(ensureCanonicalPatchAssignment))

    expect(assignments[0]).not.toBeNull()
    expect(assignments[1]).not.toBeNull()
    expect(assignments[0]?.patchId).not.toBe(assignments[1]?.patchId)
    await expect(ensureCanonicalPatchAssignment(principalIds[0])).resolves.toEqual(assignments[0])

    const ownership = await getDatabaseBundle().db.execute(sql`
      select owner_principal_id, count(*)::integer as count
      from patches
      where owner_principal_id in (${principalIds[0]}, ${principalIds[1]}) and state = 'active'
      group by owner_principal_id
    `)
    expect(ownership.rows).toHaveLength(2)
    expect(ownership.rows.every((row) => row.count === 1)).toBe(true)
    const auditEvents = await getDatabaseBundle().db.execute(sql`
      select count(*)::integer as count
      from authorization_audit_events
      where attempted_action = 'automatic_patch_assignment'
    `)
    expect(auditEvents.rows[0]?.count).toBe(2)
  })

  it('fails closed for invalid policy, lifecycle, topology, protocol, alias, and incomplete grids', async () => {
    const provisioned = await provisionCanonicalWorld(provisionInput)
    const quiltId = provisioned.quilt!.id
    await activateCanonicalWorld({
      action: 'activate', quiltId, expectedGeneration: 1, operatorId: 'integration-test', reason: 'validate',
    })
    const pool = database.createConnection()
    try {
      const invalidations = [
        `UPDATE patch_visibility_policies SET claim_enabled = false WHERE patch_id = '${provisioned.initialPatch!.id}'`,
        `UPDATE patches SET state = 'suspended' WHERE id = '${provisioned.initialPatch!.id}'`,
        `UPDATE quilts SET topology = 'bounded' WHERE id = '${quiltId}'`,
        `UPDATE quilts SET protocol_version = 1 WHERE id = '${quiltId}'`,
        `UPDATE quilts SET legacy_canvas_id = NULL WHERE id = '${quiltId}'`,
        `DELETE FROM patches WHERE id = '${provisioned.initialPatch!.id}'`,
      ]
      const repairs = [
        `UPDATE patch_visibility_policies SET claim_enabled = true WHERE patch_id = '${provisioned.initialPatch!.id}'`,
        `UPDATE patches SET state = 'unclaimed' WHERE id = '${provisioned.initialPatch!.id}'`,
        `UPDATE quilts SET topology = 'toroidal' WHERE id = '${quiltId}'`,
        `UPDATE quilts SET protocol_version = 2 WHERE id = '${quiltId}'`,
        `UPDATE quilts SET legacy_canvas_id = '${provisioned.quilt!.legacyCanvasId}' WHERE id = '${quiltId}'`,
      ]
      for (let index = 0; index < invalidations.length; index += 1) {
        await pool.query(invalidations[index]!)
        expect(await discoverCanonicalWorld()).toBeNull()
        await expect(getCanonicalWorldStatus()).rejects.toBeInstanceOf(CanonicalWorldTargetInvalidError)
        if (repairs[index]) await pool.query(repairs[index]!)
      }
    } finally {
      await pool.end()
    }
  })

  it('serializes concurrent provision attempts into one success and one read-only replay', async () => {
    const outcomes = await Promise.all([
      provisionCanonicalWorld(provisionInput),
      provisionCanonicalWorld(provisionInput),
    ])
    expect(outcomes.map((outcome) => outcome.result).sort()).toEqual(['idempotent', 'succeeded'])
    expect(outcomes[0]?.quilt?.id).toBe(outcomes[1]?.quilt?.id)
    expect(outcomes[0]?.initialPatch?.id).toBe(outcomes[1]?.initialPatch?.id)
  })

  it('serializes concurrent activation into one generation-2 transition and one replay', async () => {
    const provisioned = await provisionCanonicalWorld(provisionInput)
    const input = {
      action: 'activate' as const,
      quiltId: provisioned.quilt!.id,
      expectedGeneration: 1,
      operatorId: 'integration-test',
      reason: 'concurrent activation',
    }

    const outcomes = await Promise.all([activateCanonicalWorld(input), activateCanonicalWorld(input)])

    expect(outcomes.map(({ result }) => result).sort()).toEqual(['idempotent', 'succeeded'])
    expect(outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ generation: 2, pointerStatus: 'active', idempotent: false }),
      expect.objectContaining({ generation: 2, pointerStatus: 'active', idempotent: true }),
    ]))
  })

  it('returns the same descriptor after rebuilding the database bundle', async () => {
    const provisioned = await provisionCanonicalWorld(provisionInput)
    await activateCanonicalWorld({
      action: 'activate',
      quiltId: provisioned.quilt!.id,
      expectedGeneration: 1,
      operatorId: 'integration-test',
      reason: 'restart stability',
    })
    const beforeRestart = await discoverCanonicalWorld()

    await closeDatabaseBundle()
    configureDatabaseBundleForTests(createDatabaseBundle({ connectionString: database.connectionString, max: 4 }))

    expect(await discoverCanonicalWorld()).toEqual(beforeRestart)
  })
})