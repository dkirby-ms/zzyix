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
import { materialVariantValues, operationTypeValues, tileShapeValues } from './types.js'

const asSqlLiteralList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '))

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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    updatedAtIndex: index('canvases_updated_at_idx').on(table.updatedAt),
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
    shape: text('shape').notNull(),
    color: text('color').notNull(),
    material: text('material').notNull(),
    posX: doublePrecision('pos_x').notNull(),
    posY: doublePrecision('pos_y').notNull(),
    rotation: doublePrecision('rotation').notNull(),
    mirrored: boolean('mirrored').default(false).notNull(),
    placedBy: text('placed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    canvasIdIndex: index('tiles_canvas_id_idx').on(table.canvasId),
    shapeCheck: check('tiles_shape_check', sql`${table.shape} in (${asSqlLiteralList(tileShapeValues)})`),
    materialCheck: check(
      'tiles_material_check',
      sql`${table.material} in (${asSqlLiteralList(materialVariantValues)})`,
    ),
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