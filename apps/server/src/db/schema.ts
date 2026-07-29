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
  authorizationAuditChannelValues,
  authorizationAuditOutcomeValues,
  materialVariantValues,
  operationTypeValues,
  ownershipTransferStatusValues,
  patchClaimOutcomeValues,
  patchMembershipRoleValues,
  patchStateValues,
  patchVisibilityValues,
  principalKindValues,
  principalStatusValues,
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
    status: text('status').default('active').notNull(),
    displayName: text('display_name'),
    email: text('email'),
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
    deletionRecoveryDeadline: timestamp('deletion_recovery_deadline', { withTimezone: true }),
    deletionCompletedAt: timestamp('deletion_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    kindCheck: check('principals_kind_check', sql`${table.kind} in (${asSqlLiteralList(principalKindValues)})`),
    statusCheck: check(
      'principals_status_check',
      sql`${table.status} in (${asSqlLiteralList(principalStatusValues)})`,
    ),
    deletionTimelineCheck: check(
      'principals_deletion_timeline_check',
      sql`(${table.status} not in ('deletion_pending', 'deleted') or ${table.deletionRequestedAt} is not null)
        and (${table.status} <> 'deletion_pending' or ${table.deletionRecoveryDeadline} is not null)
        and (${table.status} <> 'deleted' or ${table.deletionCompletedAt} is not null)`,
    ),
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
    principalUnique: unique('external_principal_mappings_principal_id_unique').on(table.principalId),
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

export const canonicalWorld = pgTable(
  'canonical_world',
  {
    productKey: text('product_key').primaryKey(),
    quiltId: uuid('quilt_id')
      .notNull()
      .references(() => quilts.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    generation: integer('generation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    quiltIndex: index('canonical_world_quilt_id_idx').on(table.quiltId),
    productKeyCheck: check('canonical_world_product_key_check', sql`${table.productKey} = 'canonical'`),
    statusCheck: check('canonical_world_status_check', sql`${table.status} in ('inactive', 'active')`),
    generationCheck: check('canonical_world_generation_check', sql`${table.generation} > 0`),
  }),
)

export const quiltPresenceLeases = pgTable(
  'quilt_presence_leases',
  {
    socketId: text('socket_id').primaryKey(),
    quiltId: uuid('quilt_id')
      .notNull()
      .references(() => quilts.id, { onDelete: 'cascade' }),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => principals.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    principalExpiryIndex: index('quilt_presence_leases_principal_expiry_idx').on(
      table.quiltId,
      table.principalId,
      table.expiresAt,
    ),
    expiryIndex: index('quilt_presence_leases_expiry_idx').on(table.expiresAt),
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

export const patchVisibilityPolicies = pgTable(
  'patch_visibility_policies',
  {
    patchId: uuid('patch_id')
      .primaryKey()
      .references(() => patches.id, { onDelete: 'cascade' }),
    existence: text('existence').default('authenticated').notNull(),
    fineData: text('fine_data').default('authenticated').notNull(),
    aggregateData: text('aggregate_data').default('authenticated').notNull(),
    presence: text('presence').default('authenticated').notNull(),
    search: text('search').default('authenticated').notNull(),
    durableEvents: text('durable_events').default('authenticated').notNull(),
    claimEnabled: boolean('claim_enabled').default(false).notNull(),
    policyVersion: integer('policy_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    existenceCheck: check(
      'patch_visibility_policies_existence_check',
      sql`${table.existence} in (${asSqlLiteralList(patchVisibilityValues)})`,
    ),
    fineDataCheck: check(
      'patch_visibility_policies_fine_data_check',
      sql`${table.fineData} in (${asSqlLiteralList(patchVisibilityValues)})`,
    ),
    aggregateDataCheck: check(
      'patch_visibility_policies_aggregate_data_check',
      sql`${table.aggregateData} in (${asSqlLiteralList(patchVisibilityValues)})`,
    ),
    presenceCheck: check(
      'patch_visibility_policies_presence_check',
      sql`${table.presence} in (${asSqlLiteralList(patchVisibilityValues)}) and ${table.presence} <> 'public'`,
    ),
    searchCheck: check(
      'patch_visibility_policies_search_check',
      sql`${table.search} in (${asSqlLiteralList(patchVisibilityValues)})`,
    ),
    durableEventsCheck: check(
      'patch_visibility_policies_durable_events_check',
      sql`${table.durableEvents} in (${asSqlLiteralList(patchVisibilityValues)})`,
    ),
    policyVersionCheck: check('patch_visibility_policies_policy_version_check', sql`${table.policyVersion} > 0`),
  }),
)

export const patchClaimQuotaRecords = pgTable(
  'patch_claim_quota_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    operationId: uuid('operation_id').notNull(),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => principals.id, { onDelete: 'restrict' }),
    quiltId: uuid('quilt_id')
      .notNull()
      .references(() => quilts.id, { onDelete: 'cascade' }),
    patchId: uuid('patch_id')
      .notNull()
      .references(() => patches.id, { onDelete: 'cascade' }),
    outcome: text('outcome').notNull(),
    reasonCode: text('reason_code'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    operationUnique: unique('patch_claim_quota_records_operation_id_unique').on(table.operationId),
    principalAttemptIndex: index('patch_claim_quota_records_principal_attempt_idx').on(
      table.principalId,
      table.attemptedAt,
    ),
    principalOutcomeIndex: index('patch_claim_quota_records_principal_outcome_idx').on(
      table.principalId,
      table.outcome,
      table.attemptedAt,
    ),
    outcomeCheck: check(
      'patch_claim_quota_records_outcome_check',
      sql`${table.outcome} in (${asSqlLiteralList(patchClaimOutcomeValues)})`,
    ),
  }),
)

export const pendingOwnershipTransfers = pgTable(
  'pending_ownership_transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    operationId: uuid('operation_id').notNull(),
    patchId: uuid('patch_id')
      .notNull()
      .references(() => patches.id, { onDelete: 'cascade' }),
    senderPrincipalId: uuid('sender_principal_id')
      .notNull()
      .references(() => principals.id, { onDelete: 'restrict' }),
    recipientPrincipalId: uuid('recipient_principal_id')
      .notNull()
      .references(() => principals.id, { onDelete: 'restrict' }),
    status: text('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    operationUnique: unique('pending_ownership_transfers_operation_id_unique').on(table.operationId),
    patchStatusIndex: index('pending_ownership_transfers_patch_status_idx').on(table.patchId, table.status),
    recipientStatusIndex: index('pending_ownership_transfers_recipient_status_idx').on(
      table.recipientPrincipalId,
      table.status,
    ),
    statusCheck: check(
      'pending_ownership_transfers_status_check',
      sql`${table.status} in (${asSqlLiteralList(ownershipTransferStatusValues)})`,
    ),
    distinctPrincipalsCheck: check(
      'pending_ownership_transfers_distinct_principals_check',
      sql`${table.senderPrincipalId} <> ${table.recipientPrincipalId}`,
    ),
    resolutionCheck: check(
      'pending_ownership_transfers_resolution_check',
      sql`(${table.status} = 'pending' and ${table.resolvedAt} is null)
        or (${table.status} <> 'pending' and ${table.resolvedAt} is not null)`,
    ),
  }),
)

export const authorizationAuditEvents = pgTable(
  'authorization_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: text('event_type').notNull(),
    attemptedAction: text('attempted_action').notNull(),
    outcome: text('outcome').notNull(),
    reasonCode: text('reason_code'),
    actorPrincipalId: uuid('actor_principal_id').references(() => principals.id, { onDelete: 'restrict' }),
    subjectPrincipalId: uuid('subject_principal_id').references(() => principals.id, { onDelete: 'restrict' }),
    quiltId: uuid('quilt_id').references(() => quilts.id, { onDelete: 'restrict' }),
    patchId: uuid('patch_id').references(() => patches.id, { onDelete: 'restrict' }),
    requestId: text('request_id'),
    socketId: text('socket_id'),
    operationId: uuid('operation_id'),
    sourceChannel: text('source_channel').notNull(),
    replicaId: text('replica_id'),
    policyVersion: integer('policy_version'),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    actorCreatedIndex: index('authorization_audit_events_actor_created_idx').on(
      table.actorPrincipalId,
      table.createdAt,
    ),
    patchCreatedIndex: index('authorization_audit_events_patch_created_idx').on(table.patchId, table.createdAt),
    eventTypeCreatedIndex: index('authorization_audit_events_type_created_idx').on(
      table.eventType,
      table.createdAt,
    ),
    outcomeCheck: check(
      'authorization_audit_events_outcome_check',
      sql`${table.outcome} in (${asSqlLiteralList(authorizationAuditOutcomeValues)})`,
    ),
    sourceChannelCheck: check(
      'authorization_audit_events_source_channel_check',
      sql`${table.sourceChannel} in (${asSqlLiteralList(authorizationAuditChannelValues)})`,
    ),
    policyVersionCheck: check(
      'authorization_audit_events_policy_version_check',
      sql`${table.policyVersion} is null or ${table.policyVersion} > 0`,
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