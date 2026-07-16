import { and, asc, desc, eq, inArray, isNull, lte, max, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { ClientPresence, Session, TileInstance } from '../contracts'
import type { PlaceTilePayload, RemoveTilePayload, TilePlacedPayload, TileRemovedPayload } from '../contracts'
import { canvases, operationLog, participants, snapshots, tiles } from './schema'
import { getDatabaseBundle, type DatabaseClient } from './client'

export type AuthoritativeSessionRecord = {
  session: Session
  clients: ClientPresence[]
  lastOpSeq: number
}

export type PersistedMutationResult =
  | {
      opSeq: number
      session: Session
      ack: { placed: TileInstance; rejected: false } | { removed: true }
      event: TilePlacedPayload | TileRemovedPayload
    }
  | {
      session: Session
      ack:
        | { placed: null; rejected: true; reason: 'OUT_OF_BOUNDS' | 'OVERLAP' | 'GAP_TOO_LARGE' | 'PLACEMENT_REJECTED' }
        | { removed: false }
      event?: undefined
    }

export type PersistedOperationRecord = {
  opSeq: number
  opType: 'tile_placed' | 'tile_removed'
  payload: unknown
  clientId: string
  createdAt: number
}

export type ReplaySessionRecord = AuthoritativeSessionRecord & {
  snapshotOpSeq: number
  replayedOperations: PersistedOperationRecord[]
}

const toMillis = (value: Date): number => value.getTime()

const mapTile = (row: typeof tiles.$inferSelect): TileInstance => ({
  id: row.id,
  shape: row.shape as TileInstance['shape'],
  color: row.color,
  material: row.material as TileInstance['material'],
  transform: {
    position: { x: row.posX, y: row.posY },
    rotation: row.rotation,
    mirrored: row.mirrored,
  },
  createdAt: toMillis(row.createdAt),
})

const mapSession = (
  canvas: typeof canvases.$inferSelect,
  tileRows: Array<typeof tiles.$inferSelect>,
): Session => ({
  id: canvas.id,
  tiles: tileRows.map(mapTile),
  createdAt: toMillis(canvas.createdAt),
  updatedAt: toMillis(canvas.updatedAt),
})

const mapClient = (row: typeof participants.$inferSelect): ClientPresence => ({
  clientId: row.clientId,
  joinedAt: toMillis(row.joinedAt),
})

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isTileInstance = (value: unknown): value is TileInstance => {
  if (!isObjectRecord(value)) {
    return false
  }

  if (typeof value.id !== 'string' || typeof value.shape !== 'string' || typeof value.color !== 'string') {
    return false
  }

  if (typeof value.material !== 'string' || typeof value.createdAt !== 'number') {
    return false
  }

  const transform = value.transform
  if (!isObjectRecord(transform)) {
    return false
  }

  const position = transform.position
  if (!isObjectRecord(position)) {
    return false
  }

  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    typeof transform.rotation === 'number' &&
    (transform.mirrored === undefined || typeof transform.mirrored === 'boolean')
  )
}

const isPlaceOperationPayload = (value: unknown): value is PlaceTilePayload & { tileId: string } => {
  if (!isObjectRecord(value) || typeof value.tileId !== 'string' || typeof value.shape !== 'string') {
    return false
  }

  if (typeof value.color !== 'string' || typeof value.material !== 'string') {
    return false
  }

  const transform = value.transform
  if (!isObjectRecord(transform)) {
    return false
  }

  const position = transform.position
  if (!isObjectRecord(position)) {
    return false
  }

  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    typeof transform.rotation === 'number' &&
    (transform.mirrored === undefined || typeof transform.mirrored === 'boolean')
  )
}

const isRemoveOperationPayload = (value: unknown): value is RemoveTilePayload =>
  isObjectRecord(value) && typeof value.tileId === 'string'

const applyOperationToTiles = (tilesState: TileInstance[], operation: PersistedOperationRecord): TileInstance[] => {
  if (operation.opType === 'tile_placed' && isPlaceOperationPayload(operation.payload)) {
    const tile: TileInstance = {
      id: operation.payload.tileId,
      shape: operation.payload.shape,
      color: operation.payload.color,
      material: operation.payload.material,
      transform: operation.payload.transform,
      createdAt: operation.createdAt,
    }

    const withoutPrevious = tilesState.filter((entry) => entry.id !== tile.id)
    return [...withoutPrevious, tile]
  }

  if (operation.opType === 'tile_removed' && isRemoveOperationPayload(operation.payload)) {
    const removePayload = operation.payload
    return tilesState.filter((entry) => entry.id !== removePayload.tileId)
  }

  return tilesState
}

const getNextOpSeq = async (db: DatabaseClient, canvasId: string): Promise<number> => {
  const [result] = await db
    .select({ value: sql<number>`coalesce(max(${operationLog.opSeq}), 0)` })
    .from(operationLog)
    .where(eq(operationLog.canvasId, canvasId))

  return (result?.value ?? 0) + 1
}

export const loadSessionRecord = async (sessionId: string): Promise<AuthoritativeSessionRecord> => {
  const { db } = getDatabaseBundle()

  let [canvas] = await db.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
  if (!canvas) {
    const now = new Date()
    ;[canvas] = await db.insert(canvases).values({ id: sessionId, createdAt: now, updatedAt: now }).returning()
  }

  const [tileRows, participantRows, latestOpSeq] = await Promise.all([
    db.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt)),
    db
      .select()
      .from(participants)
      .where(and(eq(participants.canvasId, sessionId), isNull(participants.leftAt)))
      .orderBy(asc(participants.joinedAt)),
    db
      .select({ value: max(operationLog.opSeq) })
      .from(operationLog)
      .where(eq(operationLog.canvasId, sessionId)),
  ])

  return {
    session: mapSession(canvas, tileRows),
    clients: participantRows.map(mapClient),
    lastOpSeq: latestOpSeq[0]?.value ?? 0,
  }
}

export const markParticipantJoined = async (
  sessionId: string,
  clientId: string,
  joinedAt: number,
): Promise<ClientPresence> => {
  const { db } = getDatabaseBundle()
  const joinedAtDate = new Date(joinedAt)

  await db
    .insert(participants)
    .values({ canvasId: sessionId, clientId, joinedAt: joinedAtDate, leftAt: null })
    .onConflictDoUpdate({
      target: [participants.canvasId, participants.clientId],
      set: { joinedAt: joinedAtDate, leftAt: null },
    })

  return { clientId, joinedAt }
}

export const markParticipantLeft = async (sessionId: string, clientId: string, leftAt: number): Promise<void> => {
  const { db } = getDatabaseBundle()
  await db
    .update(participants)
    .set({ leftAt: new Date(leftAt) })
    .where(and(eq(participants.canvasId, sessionId), eq(participants.clientId, clientId)))
}

export const listActiveParticipants = async (sessionId: string): Promise<ClientPresence[]> => {
  const { db } = getDatabaseBundle()
  const rows = await db
    .select()
    .from(participants)
    .where(and(eq(participants.canvasId, sessionId), isNull(participants.leftAt)))
    .orderBy(asc(participants.joinedAt))

  return rows.map(mapClient)
}

export const persistTilePlacement = async (params: {
  sessionId: string
  payload: PlaceTilePayload
  placedBy: string
  tileId?: string
  createdAt?: number
}): Promise<PersistedMutationResult> => {
  const { db } = getDatabaseBundle()
  const { sessionId, payload, placedBy } = params

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`)
    const opSeq = await getNextOpSeq(tx, sessionId)

    const tileId = params.tileId ?? randomUUID()
    const createdAt = new Date(params.createdAt ?? Date.now())

    await tx.insert(tiles).values({
      id: tileId,
      canvasId: sessionId,
      shape: payload.shape,
      color: payload.color,
      material: payload.material,
      posX: payload.transform.position.x,
      posY: payload.transform.position.y,
      rotation: payload.transform.rotation,
      mirrored: payload.transform.mirrored ?? false,
      placedBy,
      createdAt,
    })

    await tx.insert(operationLog).values({
      canvasId: sessionId,
      opSeq,
      opType: 'tile_placed',
      payload: { tileId, ...payload },
      clientId: placedBy,
      createdAt,
    })

    const now = new Date()
    const [canvas] = await tx
      .update(canvases)
      .set({ updatedAt: now })
      .where(eq(canvases.id, sessionId))
      .returning()

    const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
    const tile = tileRows.find((entry) => entry.id === tileId)
    if (!tile || !canvas) {
      throw new Error('Failed to persist tile placement')
    }

    const session = mapSession(canvas, tileRows)
    const placedTile = mapTile(tile)

    return {
      opSeq,
      session,
      ack: { placed: placedTile, rejected: false, opSeq },
      event: { tile: placedTile, placedBy, opSeq },
    }
  })
}

export const persistTileRemoval = async (params: {
  sessionId: string
  payload: RemoveTilePayload
  removedBy: string
}): Promise<PersistedMutationResult> => {
  const { db } = getDatabaseBundle()
  const { sessionId, payload, removedBy } = params

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`)
    const opSeq = await getNextOpSeq(tx, sessionId)

    const [existing] = await tx.select().from(tiles).where(eq(tiles.id, payload.tileId)).limit(1)
    if (!existing || existing.canvasId !== sessionId) {
      const record = await loadSessionRecord(sessionId)
      return {
        session: record.session,
        ack: { removed: false },
      }
    }

    await tx.delete(tiles).where(eq(tiles.id, payload.tileId))
    const now = new Date()
    await tx.insert(operationLog).values({
      canvasId: sessionId,
      opSeq,
      opType: 'tile_removed',
      payload: { tileId: payload.tileId },
      clientId: removedBy,
      createdAt: now,
    })

    const [canvas] = await tx
      .update(canvases)
      .set({ updatedAt: now })
      .where(eq(canvases.id, sessionId))
      .returning()
    const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
    if (!canvas) {
      throw new Error('Failed to persist tile removal')
    }

    return {
      opSeq,
      session: mapSession(canvas, tileRows),
      ack: { removed: true, opSeq },
      event: { tileId: payload.tileId, removedBy, opSeq },
    }
  })
}

export const saveSnapshot = async (sessionId: string, opSeq: number, session: Session): Promise<void> => {
  const { db } = getDatabaseBundle()
  await db.insert(snapshots).values({
    id: randomUUID(),
    canvasId: sessionId,
    opSeq,
    state: session.tiles,
  })
}

export const getLatestSnapshot = async (sessionId: string): Promise<{ opSeq: number; tiles: TileInstance[] } | null> => {
  const { db } = getDatabaseBundle()
  const [snapshot] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.canvasId, sessionId))
    .orderBy(desc(snapshots.opSeq))
    .limit(1)

  if (!snapshot) {
    return null
  }

  return {
    opSeq: snapshot.opSeq,
    tiles: snapshot.state as TileInstance[],
  }
}

export const listOperationsAfter = async (sessionId: string, opSeq: number): Promise<PersistedOperationRecord[]> => {
  const { db } = getDatabaseBundle()
  const rows = await db
    .select()
    .from(operationLog)
    .where(and(eq(operationLog.canvasId, sessionId), sql`${operationLog.opSeq} > ${opSeq}`))
    .orderBy(asc(operationLog.opSeq))

  return rows.map((row) => ({
    opSeq: row.opSeq,
    opType: row.opType as PersistedOperationRecord['opType'],
    payload: row.payload,
    clientId: row.clientId,
    createdAt: toMillis(row.createdAt),
  }))
}

export const loadSessionReplayRecord = async (sessionId: string): Promise<ReplaySessionRecord> => {
  const [record, snapshot, operations] = await Promise.all([
    loadSessionRecord(sessionId),
    getLatestSnapshot(sessionId),
    getLatestSnapshot(sessionId).then((latestSnapshot) => listOperationsAfter(sessionId, latestSnapshot?.opSeq ?? 0)),
  ])

  const baseTiles = Array.isArray(snapshot?.tiles) ? snapshot.tiles.filter(isTileInstance) : []
  const replayedTiles = operations.reduce(applyOperationToTiles, baseTiles)

  return {
    ...record,
    session: {
      ...record.session,
      tiles: replayedTiles,
    },
    snapshotOpSeq: snapshot?.opSeq ?? 0,
    replayedOperations: operations,
  }
}

export const pruneRetention = async (params: {
  operationCutoffMs: number
  snapshotCutoffMs: number
}): Promise<{ deletedOperations: number; deletedSnapshots: number }> => {
  const { db } = getDatabaseBundle()
  const operationCutoff = new Date(Date.now() - params.operationCutoffMs)
  const snapshotCutoff = new Date(Date.now() - params.snapshotCutoffMs)

  const staleSnapshots = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(lte(snapshots.createdAt, snapshotCutoff))

  const staleOperations = await db
    .select({ id: operationLog.id })
    .from(operationLog)
    .where(lte(operationLog.createdAt, operationCutoff))

  if (staleSnapshots.length > 0) {
    await db.delete(snapshots).where(inArray(snapshots.id, staleSnapshots.map((entry) => entry.id)))
  }

  if (staleOperations.length > 0) {
    await db.delete(operationLog).where(inArray(operationLog.id, staleOperations.map((entry) => entry.id)))
  }

  return {
    deletedOperations: staleOperations.length,
    deletedSnapshots: staleSnapshots.length,
  }
}