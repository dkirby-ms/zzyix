import type { Session } from '../contracts.js'
import { getLatestSnapshot, listOperationsAfter, saveSnapshot } from './repository.js'

const SNAPSHOT_EVERY_OPS = Number(process.env.SNAPSHOT_EVERY_OPS ?? 25)

export const shouldPersistSnapshot = (opSeq: number): boolean => opSeq > 0 && opSeq % SNAPSHOT_EVERY_OPS === 0

export const persistSnapshotIfNeeded = async (sessionId: string, opSeq: number, session: Session): Promise<void> => {
  if (!shouldPersistSnapshot(opSeq)) {
    return
  }

  await saveSnapshot(sessionId, opSeq, session)
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