import { pathToFileURL } from 'node:url'
import {
  activateCanonicalWorld,
  getCanonicalWorldStatus,
  provisionCanonicalWorld,
  type CanonicalActivateInput,
  type CanonicalProvisionInput,
  type CanonicalWorldOperatorResult,
} from './repository.js'
import { closeDatabaseBundle } from './index.js'

const CANONICAL_OPERATOR_ID = 'canonical-world-initializer'
const CANONICAL_INITIALIZATION_REASON = 'initialize canonical world during deployment'

type CanonicalWorldInitializerDependencies = {
  status: () => Promise<CanonicalWorldOperatorResult>
  provision: (input: CanonicalProvisionInput) => Promise<CanonicalWorldOperatorResult>
  activate: (input: CanonicalActivateInput) => Promise<CanonicalWorldOperatorResult>
  close: () => Promise<void>
}

type InitializerResult = {
  schemaVersion: 1
  result: 'succeeded' | 'idempotent' | 'failed'
  pointerStatus?: 'active'
  generation?: number
  quiltId?: string
  message?: string
}

const defaultDependencies: CanonicalWorldInitializerDependencies = {
  status: getCanonicalWorldStatus,
  provision: provisionCanonicalWorld,
  activate: activateCanonicalWorld,
  close: closeDatabaseBundle,
}

const provisionInput: CanonicalProvisionInput = {
  action: 'provision',
  expectedGeneration: 0,
  patchRows: 32,
  patchColumns: 32,
  patchWidth: 31.2,
  patchHeight: 20.4,
  originX: 0,
  originY: 0,
  operatorId: CANONICAL_OPERATOR_ID,
  reason: CANONICAL_INITIALIZATION_REASON,
}

const activeResult = (result: CanonicalWorldOperatorResult): InitializerResult | null => {
  if (result.pointerStatus !== 'active' || !result.quilt) return null
  return {
    schemaVersion: 1,
    result: result.idempotent ? 'idempotent' : 'succeeded',
    pointerStatus: 'active',
    generation: result.generation,
    quiltId: result.quilt.id,
  }
}

const activate = async (
  status: CanonicalWorldOperatorResult,
  dependencies: CanonicalWorldInitializerDependencies,
): Promise<InitializerResult | null> => {
  if (status.pointerStatus !== 'inactive' || !status.quilt) return null
  const result = await dependencies.activate({
    action: 'activate',
    quiltId: status.quilt.id,
    expectedGeneration: status.generation,
    operatorId: CANONICAL_OPERATOR_ID,
    reason: CANONICAL_INITIALIZATION_REASON,
  })
  return activeResult(result)
}

export const runCanonicalWorldInitializer = async (
  dependencies: CanonicalWorldInitializerDependencies = defaultDependencies,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> => {
  let result: InitializerResult | null | undefined
  try {
    const status = await dependencies.status()
    if (status.pointerStatus === 'active') {
      result = activeResult(status)
    } else if (status.pointerStatus === 'inactive') {
      result = await activate(status, dependencies)
    } else if (status.pointerStatus === 'missing') {
      result = await activate(await dependencies.provision(provisionInput), dependencies)
    }
  } catch {
    result = undefined
  } finally {
    try {
      await dependencies.close()
    } catch {
      result = undefined
    }
  }

  if (!result) {
    output.error(JSON.stringify({
      schemaVersion: 1,
      result: 'failed',
      message: 'Canonical world initialization failed.',
    } satisfies InitializerResult))
    return 1
  }

  output.log(JSON.stringify(result))
  return 0
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  void runCanonicalWorldInitializer().then((exitCode) => {
    process.exitCode = exitCode
  })
}