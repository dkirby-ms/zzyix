import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import type { QueryResultRow } from 'pg'

const QUILT_ID = 'd1000000-0000-4000-8000-000000000001'
const AGENT_PRINCIPAL_ID = 'd2000000-0000-4000-8000-000000000001'
const SECOND_AGENT_PRINCIPAL_ID = 'd2000000-0000-4000-8000-000000000002'
const RUN_ID = 'd3000000-0000-4000-8000-000000000001'
const SECOND_RUN_ID = 'd3000000-0000-4000-8000-000000000002'
const PATCH_ID = 'd4000000-0000-4000-8000-000000000001'

describe('agent control-plane PostgreSQL constraints', () => {
  let database: PostgresTestDatabase

  const query = async <Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => {
    const pool = database.createConnection()
    try {
      return await pool.query<Row>(text, values)
    } finally {
      await pool.end()
    }
  }

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_agent_control')

    await query(`
      insert into principals (id, kind) values
        ('${AGENT_PRINCIPAL_ID}', 'agent'),
        ('${SECOND_AGENT_PRINCIPAL_ID}', 'agent')
    `)
    await query(`
      insert into quilts (id, patch_rows, patch_columns, patch_width, patch_height, topology, protocol_version)
      values ('${QUILT_ID}', 1, 1, 10, 10, 'toroidal', 2)
    `)
    await query(`
      insert into patches (id, quilt_id, row, "column", state, revision)
      values ('${PATCH_ID}', '${QUILT_ID}', 0, 0, 'unclaimed', 0)
    `)
  }, 30_000)

  afterAll(async () => database?.dispose(), 30_000)

  beforeEach(async () => {
    await query('truncate table agent_control.lifecycle_audit, agent_control.model_call_metadata, agent_control.tool_call_outcomes, agent_control.trigger_queue, agent_control.checkpoints, agent_control.quilt_leases, agent_control.runs, agent_control.lifecycle_events, agent_control.agent_assignments cascade')
    await query("update agent_control.trigger_queue_limits set pending_limit = 500, updated_at = now() where singleton_key = 'default'")
    await query('update patches set revision = 0 where id = $1', [PATCH_ID])

    await query(`
      insert into agent_control.runs (id, quilt_id, agent_principal_id, status, started_at)
      values
        ('${RUN_ID}', '${QUILT_ID}', '${AGENT_PRINCIPAL_ID}', 'running', now()),
        ('${SECOND_RUN_ID}', '${QUILT_ID}', '${SECOND_AGENT_PRINCIPAL_ID}', 'running', now())
    `)
  })

  it('enforces one-active-lease-per-quilt with owner and run bound renewals', async () => {
    const firstAcquire = await query(
      `insert into agent_control.quilt_leases (
         quilt_id,
         lease_owner_principal_id,
         run_id,
         acquired_at,
         heartbeat_at,
         expires_at,
         generation
       )
       values ($1, $2, $3, now(), now(), now() + interval '60 seconds', 1)
       on conflict (quilt_id) do update
       set lease_owner_principal_id = excluded.lease_owner_principal_id,
           run_id = excluded.run_id,
           acquired_at = excluded.acquired_at,
           heartbeat_at = excluded.heartbeat_at,
           expires_at = excluded.expires_at,
           generation = agent_control.quilt_leases.generation + 1
       where agent_control.quilt_leases.expires_at <= now()
       returning quilt_id`,
      [QUILT_ID, AGENT_PRINCIPAL_ID, RUN_ID],
    )
    expect(firstAcquire.rowCount).toBe(1)

    const blockedTakeover = await query(
      `insert into agent_control.quilt_leases (
         quilt_id,
         lease_owner_principal_id,
         run_id,
         acquired_at,
         heartbeat_at,
         expires_at,
         generation
       )
       values ($1, $2, $3, now(), now(), now() + interval '60 seconds', 1)
       on conflict (quilt_id) do update
       set lease_owner_principal_id = excluded.lease_owner_principal_id,
           run_id = excluded.run_id,
           acquired_at = excluded.acquired_at,
           heartbeat_at = excluded.heartbeat_at,
           expires_at = excluded.expires_at,
           generation = agent_control.quilt_leases.generation + 1
       where agent_control.quilt_leases.expires_at <= now()
       returning quilt_id`,
      [QUILT_ID, SECOND_AGENT_PRINCIPAL_ID, SECOND_RUN_ID],
    )
    expect(blockedTakeover.rowCount).toBe(0)

    await query(
      "update agent_control.quilt_leases set expires_at = now() - interval '1 second' where quilt_id = $1",
      [QUILT_ID],
    )
    const allowedTakeover = await query(
      `insert into agent_control.quilt_leases (
         quilt_id,
         lease_owner_principal_id,
         run_id,
         acquired_at,
         heartbeat_at,
         expires_at,
         generation
       )
       values ($1, $2, $3, now(), now(), now() + interval '60 seconds', 1)
       on conflict (quilt_id) do update
       set lease_owner_principal_id = excluded.lease_owner_principal_id,
           run_id = excluded.run_id,
           acquired_at = excluded.acquired_at,
           heartbeat_at = excluded.heartbeat_at,
           expires_at = excluded.expires_at,
           generation = agent_control.quilt_leases.generation + 1
       where agent_control.quilt_leases.expires_at <= now()
       returning run_id`,
      [QUILT_ID, SECOND_AGENT_PRINCIPAL_ID, SECOND_RUN_ID],
    )
    expect(allowedTakeover.rowCount).toBe(1)

    const failedRenewal = await query(
      `update agent_control.quilt_leases
       set heartbeat_at = now(),
           expires_at = now() + interval '60 seconds'
       where quilt_id = $1
         and lease_owner_principal_id = $2
         and run_id = $3
         and expires_at > now()
       returning quilt_id`,
      [QUILT_ID, AGENT_PRINCIPAL_ID, RUN_ID],
    )
    expect(failedRenewal.rowCount).toBe(0)

    const successfulRenewal = await query(
      `update agent_control.quilt_leases
       set heartbeat_at = now(),
           expires_at = now() + interval '60 seconds'
       where quilt_id = $1
         and lease_owner_principal_id = $2
         and run_id = $3
         and expires_at > now()
       returning quilt_id`,
      [QUILT_ID, SECOND_AGENT_PRINCIPAL_ID, SECOND_RUN_ID],
    )
    expect(successfulRenewal.rowCount).toBe(1)
  })

  it('deduplicates active triggers and enforces a bounded pending queue', async () => {
    await query("update agent_control.trigger_queue_limits set pending_limit = 2, updated_at = now() where singleton_key = 'default'")

    const poolA = database.createConnection()
    const poolB = database.createConnection()
    const deduplicationKey = `key:${randomUUID()}`

    try {
      const [insertA, insertB] = await Promise.all([
        poolA.query(
          `insert into agent_control.trigger_queue (
             id,
             source,
             quilt_id,
             deduplication_key,
             priority,
             status,
             coalescing_policy_version,
             payload
           )
           values (gen_random_uuid(), $1, $2, $3, 100, 'pending', 'v1', '{}'::jsonb)
           on conflict do nothing
           returning id`,
          ['test-source', QUILT_ID, deduplicationKey],
        ),
        poolB.query(
          `insert into agent_control.trigger_queue (
             id,
             source,
             quilt_id,
             deduplication_key,
             priority,
             status,
             coalescing_policy_version,
             payload
           )
           values (gen_random_uuid(), $1, $2, $3, 100, 'pending', 'v1', '{}'::jsonb)
           on conflict do nothing
           returning id`,
          ['test-source', QUILT_ID, deduplicationKey],
        ),
      ])
      expect((insertA.rowCount ?? 0) + (insertB.rowCount ?? 0)).toBe(1)
    } finally {
      await poolA.end()
      await poolB.end()
    }

    await query(
      `insert into agent_control.trigger_queue (
         source,
         quilt_id,
         deduplication_key,
         priority,
         status,
         coalescing_policy_version,
         payload
       )
       values ('test-source', $1, $2, 200, 'pending', 'v1', '{}'::jsonb)`,
      [QUILT_ID, `key:${randomUUID()}`],
    )

    await expect(query(
      `insert into agent_control.trigger_queue (
         source,
         quilt_id,
         deduplication_key,
         priority,
         status,
         coalescing_policy_version,
         payload
       )
       values ('test-source', $1, $2, 300, 'pending', 'v1', '{}'::jsonb)`,
      [QUILT_ID, `key:${randomUUID()}`],
    )).rejects.toThrow(/pending trigger queue limit exceeded/)
  })

  it('uses compare-and-set checkpoint updates and persists pending trigger identifiers', async () => {
    const triggerIdA = randomUUID()
    const triggerIdB = randomUUID()

    await query(
      `insert into agent_control.checkpoints (
         quilt_id,
         run_id,
         checkpoint_version,
         workflow_state,
         observed_revision,
         pending_trigger_ids,
         policy_version,
         framework_version
       )
       values ($1, $2, 1, 'idle', 3, $3::jsonb, 'v1', 'afw-0.1')`,
      [QUILT_ID, RUN_ID, JSON.stringify([triggerIdA])],
    )

    const versionAdvance = await query(
      `update agent_control.checkpoints
       set checkpoint_version = checkpoint_version + 1,
           workflow_state = 'running',
           pending_trigger_ids = $4::jsonb,
           updated_at = now()
       where quilt_id = $1
         and run_id = $2
         and checkpoint_version = $3
       returning checkpoint_version, pending_trigger_ids`,
      [QUILT_ID, RUN_ID, 1, JSON.stringify([triggerIdA, triggerIdB])],
    )
    expect(versionAdvance.rowCount).toBe(1)
    expect(versionAdvance.rows[0]?.checkpoint_version).toBe(2)
    expect(versionAdvance.rows[0]?.pending_trigger_ids).toEqual([triggerIdA, triggerIdB])

    const staleWrite = await query(
      `update agent_control.checkpoints
       set checkpoint_version = checkpoint_version + 1
       where quilt_id = $1
         and run_id = $2
         and checkpoint_version = $3
       returning checkpoint_version`,
      [QUILT_ID, RUN_ID, 1],
    )
    expect(staleWrite.rowCount).toBe(0)
  })

  it('allows control-plane writes for the worker role while rejecting canonical writes', async () => {
    const pool = database.createConnection()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE agent_control_worker')

      await expect(client.query(
        `insert into agent_control.lifecycle_audit (
           quilt_id,
           run_id,
           agent_principal_id,
           event_type,
           details
         )
         values ($1, $2, $3, 'heartbeat', '{}'::jsonb)`,
        [QUILT_ID, RUN_ID, AGENT_PRINCIPAL_ID],
      )).resolves.toBeDefined()

      await expect(client.query(
        'update patches set revision = revision + 1 where id = $1',
        [PATCH_ID],
      )).rejects.toThrow(/permission denied|must be owner/i)

      await client.query('ROLLBACK')
    } finally {
      client.release()
      await pool.end()
    }
  })
})
