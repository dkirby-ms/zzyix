import type { LegacySession as Session } from '../domain/legacySession.js'
import { getLatestSnapshot, listOperationsAfter, listPatchIds, savePatchSnapshot, saveSnapshot } from './repository.js'

const SNAPSHOT_EVERY_OPS = Number(process.env.SNAPSHOT_EVERY_OPS ?? 25)

export const shouldPersistSnapshot = (opSeq: number): boolean => opSeq > 0 && opSeq % SNAPSHOT_EVERY_OPS === 0

export const persistSnapshotIfNeeded = async (sessionId: string, opSeq: number, session: Session): Promise<void> => {
  if (!shouldPersistSnapshot(opSeq)) {
    return
  }

  await saveSnapshot(sessionId, opSeq, session)
}

export const persistPatchSnapshotIfNeeded = async (patchId: string, opSeq: number): Promise<void> => {
  if (!shouldPersistSnapshot(opSeq)) {
    return
  }

  await savePatchSnapshot(patchId)
}

export const persistRetentionPatchSnapshots = async (): Promise<number> => {
  const patchIds = await listPatchIds()
  await Promise.all(patchIds.map((patchId) => savePatchSnapshot(patchId)))
  return patchIds.length
}

export const loadReplayState = async (sessionId: string): Promise<{
  snapshot: Awaited<ReturnType<typeof getLatestSnapshot>>
  operations: Awaited<ReturnType<typeof listOperationsAfter>>
}> => {
  const snapshot = await getLatestSnapshot(sessionId)
  const operations = await listOperationsAfter(sessionId, snapshot?.opSeq ?? 0)

  return {
    snapshot,
    operations,
  }
}