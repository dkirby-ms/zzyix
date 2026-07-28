import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { SessionCanvasConfig } from '../contracts.js'
import {
  materialVariantValues,
  operationTypeValues,
  patchMembershipRoleValues,
  patchStateValues,
  principalKindValues,
  quiltTopologyValues,
  tileShapeValues,
} from './types.js'

const asSqlLiteralList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '))

export const patchesParentBoundsConstraintName = 'patches_parent_bounds_check'

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: text('client_id').notNull(),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    clientIdUnique: unique('users_client_id_unique').on(table.clientId),
  }),
)

export const canvases = pgTable(
  'canvases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    version: integer('version').default(0).notNull(),
    canvasConfig: jsonb('canvas_config').$type<SessionCanvasConfig>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    updatedAtIndex: index('canvases_updated_at_idx').on(table.updatedAt),
  }),
)

export const principals = pgTable(
  'principals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').notNull(),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    kindCheck: check('principals_kind_check', sql`${table.kind} in (${asSqlLiteralList(principalKindValues)})`),
  }),
)

export const externalPrincipalMappings = pgTable(
  'external_principal_mappings',
  {
    providerNamespace: text('provider_namespace').notNull(),
    externalSubject: text('external_subject').notNull(),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => principals.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.providerNamespace, table.externalSubject],
      name: 'external_principal_mappings_pk',
    }),
    principalIndex: index('external_principal_mappings_principal_idx').on(table.principalId),
  }),
)

export const quilts = pgTable(
  'quilts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    legacyCanvasId: uuid('legacy_canvas_id').references(() => canvases.id, { onDelete: 'restrict' }),
    patchRows: integer('patch_rows').notNull(),
    patchColumns: integer('patch_columns').notNull(),
    patchWidth: doublePrecision('patch_width').notNull(),
    patchHeight: doublePrecision('patch_height').notNull(),
    originX: doublePrecision('origin_x').default(0).notNull(),
    originY: doublePrecision('origin_y').default(0).notNull(),
    topology: text('topology').notNull(),
    protocolVersion: integer('protocol_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    legacyCanvasUnique: unique('quilts_legacy_canvas_id_unique').on(table.legacyCanvasId),
    topologyCheck: check(
      'quilts_topology_check',
      sql`${table.topology} in (${asSqlLiteralList(quiltTopologyValues)})`,
    ),
    dimensionsCheck: check(
      'quilts_dimensions_check',
      sql`${table.patchRows} > 0 and ${table.patchColumns} > 0 and ${table.patchWidth} > 0 and ${table.patchHeight} > 0`,
    ),
  }),
)

export const patches = pgTable(
  'patches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quiltId: uuid('quilt_id')
      .notNull()
      .references(() => quilts.id, { onDelete: 'cascade' }),
    row: integer('row').notNull(),
    column: integer('column').notNull(),
    ownerPrincipalId: uuid('owner_principal_id').references(() => principals.id, { onDelete: 'restrict' }),
    state: text('state').default('unclaimed').notNull(),
    revision: integer('revision').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    quiltAddressUnique: unique('patches_quilt_row_column_unique').on(table.quiltId, table.row, table.column),
    quiltStateIndex: index('patches_quilt_state_idx').on(table.quiltId, table.state),
    stateCheck: check('patches_state_check', sql`${table.state} in (${asSqlLiteralList(patchStateValues)})`),
    addressCheck: check('patches_address_check', sql`${table.row} >= 0 and ${table.column} >= 0`),
  }),
)

export const patchMemberships = pgTable(
  'patch_memberships',
  {
    patchId: uuid('patch_id')
      .notNull()
      .references(() => patches.id, { onDelete: 'cascade' }),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => principals.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.patchId, table.principalId], name: 'patch_memberships_pk' }),
    patchRoleIndex: index('patch_memberships_patch_role_idx').on(table.patchId, table.role),
    roleCheck: check(
      'patch_memberships_role_check',
      sql`${table.role} in (${asSqlLiteralList(patchMembershipRoleValues)})`,
    ),
  }),
)

export const participants = pgTable(
  'participants',
  {
    canvasId: uuid('canvas_id')
      .notNull()
      .references(() => canvases.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.canvasId, table.clientId], name: 'participants_pk' }),
    canvasIdIndex: index('participants_canvas_id_idx').on(table.canvasId),
  }),
)

export const tiles = pgTable(
  'tiles',
  {
    id: uuid('id').primaryKey(),
    canvasId: uuid('canvas_id')
      .notNull()
      .references(() => canvases.id, { onDelete: 'cascade' }),
    quiltId: uuid('quilt_id').references(() => quilts.id, { onDelete: 'restrict' }),
    anchorPatchId: uuid('anchor_patch_id').references(() => patches.id, { onDelete: 'restrict' }),
    shape: text('shape').notNull(),
    color: text('color').notNull(),
    material: text('material').notNull(),
    posX: doublePrecision('pos_x').notNull(),
    posY: doublePrecision('pos_y').notNull(),
    chunkX: integer('chunk_x').default(0).notNull(),
    chunkY: integer('chunk_y').default(0).notNull(),
    rotation: doublePrecision('rotation').notNull(),
    mirrored: boolean('mirrored').default(false).notNull(),
    placedBy: text('placed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    canvasIdIndex: index('tiles_canvas_id_idx').on(table.canvasId),
    quiltIdIndex: index('tiles_quilt_id_idx').on(table.quiltId),
    anchorPatchCreatedIndex: index('tiles_anchor_patch_created_idx').on(table.anchorPatchId, table.createdAt),
    canvasChunkCreatedIndex: index('tiles_canvas_chunk_created_idx').on(
      table.canvasId,
      table.chunkX,
      table.chunkY,
      table.createdAt,
    ),
    shapeCheck: check('tiles_shape_check', sql`${table.shape} in (${asSqlLiteralList(tileShapeValues)})`),
    materialCheck: check(
      'tiles_material_check',
      sql`${table.material} in (${asSqlLiteralList(materialVariantValues)})`,
    ),
  }),
)

export const tileSpatialRefs = pgTable(
  'tile_spatial_refs',
  {
    tileId: uuid('tile_id')
      .notNull()
      .references(() => tiles.id, { onDelete: 'cascade' }),
    patchId: uuid('patch_id')
      .notNull()
      .references(() => patches.id, { onDelete: 'cascade' }),
    chunkX: integer('chunk_x').notNull(),
    chunkY: integer('chunk_y').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.tileId, table.patchId, table.chunkX, table.chunkY],
      name: 'tile_spatial_refs_pk',
    }),
    patchChunkTileIndex: index('tile_spatial_refs_patch_chunk_tile_idx').on(
      table.patchId,
      table.chunkX,
      table.chunkY,
      table.tileId,
    ),
  }),
)

export const patchOperations = pgTable(
  'patch_operations',
  {
    id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
    patchId: uuid('patch_id')
      .notNull()
      .references(() => patches.id, { onDelete: 'cascade' }),
    opSeq: integer('op_seq').notNull(),
    eventId: uuid('event_id').defaultRandom().notNull(),
    operationId: uuid('operation_id').defaultRandom().notNull(),
    actorPrincipalId: uuid('actor_principal_id').references(() => principals.id, { onDelete: 'restrict' }),
    opType: text('op_type').notNull(),
    payload: jsonb('payload').notNull(),
    legacyOperationId: bigint('legacy_operation_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    patchSeqUnique: unique('patch_operations_patch_id_op_seq_unique').on(table.patchId, table.opSeq),
    eventIdUnique: unique('patch_operations_event_id_unique').on(table.eventId),
    legacyOperationUnique: unique('patch_operations_legacy_operation_id_unique').on(table.legacyOperationId),
    patchCreatedIndex: index('patch_operations_patch_created_idx').on(table.patchId, table.createdAt),
    opTypeCheck: check(
      'patch_operations_op_type_check',
      sql`${table.opType} in (${asSqlLiteralList(operationTypeValues)})`,
    ),
  }),
)

export const patchSnapshots = pgTable(
  'patch_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    patchId: uuid('patch_id')
      .notNull()
      .references(() => patches.id, { onDelete: 'cascade' }),
    opSeq: integer('op_seq').notNull(),
    state: jsonb('state').notNull(),
    legacySnapshotId: uuid('legacy_snapshot_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    patchSeqUnique: unique('patch_snapshots_patch_id_op_seq_unique').on(table.patchId, table.opSeq),
    legacySnapshotUnique: unique('patch_snapshots_legacy_snapshot_id_unique').on(table.legacySnapshotId),
    patchSeqIndex: index('patch_snapshots_patch_seq_idx').on(table.patchId, table.opSeq.desc()),
  }),
)

export const operationLog = pgTable(
  'operation_log',
  {
    id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
    canvasId: uuid('canvas_id')
      .notNull()
      .references(() => canvases.id, { onDelete: 'cascade' }),
    opSeq: integer('op_seq').notNull(),
    opType: text('op_type').notNull(),
    payload: jsonb('payload').notNull(),
    clientId: text('client_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    canvasSeqUnique: unique('operation_log_canvas_id_op_seq_unique').on(table.canvasId, table.opSeq),
    canvasSeqIndex: index('op_log_canvas_seq_idx').on(table.canvasId, table.opSeq),
    canvasCreatedAtIndex: index('op_log_canvas_created_idx').on(table.canvasId, table.createdAt),
    opTypeCheck: check(
      'operation_log_op_type_check',
      sql`${table.opType} in (${asSqlLiteralList(operationTypeValues)})`,
    ),
  }),
)

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    clientId: text('client_id').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    response: jsonb('response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.key, table.clientId], name: 'idempotency_keys_pk' }),
    expiresAtIndex: index('idempotency_keys_expires_at_idx').on(table.expiresAt),
    clientKeyUnique: unique('idempotency_keys_client_id_key_unique').on(table.clientId, table.key),
  }),
)

export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    canvasId: uuid('canvas_id')
      .notNull()
      .references(() => canvases.id, { onDelete: 'cascade' }),
    opSeq: integer('op_seq').notNull(),
    state: jsonb('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    canvasOpSeqIndex: index('snapshots_canvas_seq_idx').on(table.canvasId, table.opSeq.desc()),
    canvasOpSeqUnique: uniqueIndex('snapshots_canvas_id_op_seq_unique').on(table.canvasId, table.opSeq),
  }),
)