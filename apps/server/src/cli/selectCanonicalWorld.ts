import { pathToFileURL } from 'node:url'
import {
  activateCanonicalWorld,
  CanonicalWorldGenerationConflictError,
  CanonicalWorldTargetInvalidError,
  deactivateCanonicalWorld,
  getCanonicalWorldStatus,
  provisionCanonicalWorld,
  type CanonicalActivateInput,
  type CanonicalDeactivateInput,
  type CanonicalProvisionInput,
  type CanonicalWorldOperatorResult,
} from '../db/repository.js'
import { closeDatabaseBundle } from '../db/index.js'

type CanonicalWorldCliInput =
  | { action: 'status' }
  | CanonicalProvisionInput
  | CanonicalActivateInput
  | CanonicalDeactivateInput

type CanonicalWorldCliDependencies = {
  status: () => Promise<CanonicalWorldOperatorResult>
  provision: (input: CanonicalProvisionInput) => Promise<CanonicalWorldOperatorResult>
  activate: (input: CanonicalActivateInput) => Promise<CanonicalWorldOperatorResult>
  deactivate: (input: CanonicalDeactivateInput) => Promise<CanonicalWorldOperatorResult>
  close: () => Promise<void>
}

type CanonicalWorldCliErrorCode =
  | 'usage_error'
  | 'generation_conflict'
  | 'target_invalid'
  | 'database_error'

export class CanonicalWorldUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalWorldUsageError'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const actionValues = new Set(['status', 'provision', 'activate', 'deactivate'])
const commonMutationArguments = ['expected-generation', 'operator-id', 'reason'] as const
const allowedArgumentsByAction = {
  status: new Set(['action']),
  provision: new Set([
    'action',
    ...commonMutationArguments,
    'patch-rows',
    'patch-columns',
    'patch-width',
    'patch-height',
    'origin-x',
    'origin-y',
  ]),
  activate: new Set(['action', ...commonMutationArguments, 'quilt-id']),
  deactivate: new Set(['action', ...commonMutationArguments]),
} as const

const parseArgumentMap = (argv: string[]): Map<string, string> => {
  const argumentsByName = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index]
    const value = argv[index + 1]
    if (!token?.startsWith('--') || token.length === 2) {
      throw new CanonicalWorldUsageError('Arguments must use --name value pairs.')
    }
    const name = token.slice(2)
    if (argumentsByName.has(name)) throw new CanonicalWorldUsageError(`--${name} may be provided only once.`)
    if (value === undefined || value.startsWith('--')) {
      throw new CanonicalWorldUsageError(`--${name} requires a value.`)
    }
    if (value.trim().length === 0) throw new CanonicalWorldUsageError(`--${name} cannot be empty.`)
    argumentsByName.set(name, value)
  }
  return argumentsByName
}

const required = (argumentsByName: Map<string, string>, name: string): string => {
  const value = argumentsByName.get(name)
  if (value === undefined) throw new CanonicalWorldUsageError(`--${name} is required.`)
  return value
}

const requiredText = (argumentsByName: Map<string, string>, name: string): string => {
  const value = required(argumentsByName, name).trim()
  if (value.length === 0) throw new CanonicalWorldUsageError(`--${name} cannot be empty.`)
  return value
}

const safeInteger = (value: string, name: string, positive: boolean): number => {
  if (!/^\d+$/.test(value)) throw new CanonicalWorldUsageError(`--${name} must be a safe integer.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || (positive ? parsed <= 0 : parsed < 0)) {
    throw new CanonicalWorldUsageError(`--${name} must be a ${positive ? 'positive ' : ''}safe integer.`)
  }
  return parsed
}

const finiteNumber = (value: string, name: string, positive: boolean): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || (positive && parsed <= 0)) {
    throw new CanonicalWorldUsageError(`--${name} must be a ${positive ? 'positive ' : ''}finite number.`)
  }
  return parsed
}

export const parseCanonicalWorldArguments = (argv: string[]): CanonicalWorldCliInput => {
  const argumentsByName = parseArgumentMap(argv)
  const action = required(argumentsByName, 'action')
  if (!actionValues.has(action)) {
    throw new CanonicalWorldUsageError('--action must be status, provision, activate, or deactivate.')
  }
  const parsedAction = action as keyof typeof allowedArgumentsByAction
  const allowedArguments = allowedArgumentsByAction[parsedAction]
  for (const name of argumentsByName.keys()) {
    if (!allowedArguments.has(name)) {
      throw new CanonicalWorldUsageError(`--${name} is not valid for action ${parsedAction}.`)
    }
  }
  if (parsedAction === 'status') return { action: 'status' }

  const expectedGeneration = safeInteger(required(argumentsByName, 'expected-generation'), 'expected-generation', false)
  const operatorId = requiredText(argumentsByName, 'operator-id')
  const reason = requiredText(argumentsByName, 'reason')
  if (parsedAction === 'deactivate') {
    return { action: parsedAction, expectedGeneration, operatorId, reason }
  }
  if (parsedAction === 'activate') {
    const quiltId = required(argumentsByName, 'quilt-id')
    if (!UUID_PATTERN.test(quiltId)) throw new CanonicalWorldUsageError('--quilt-id must be a UUID.')
    return { action: parsedAction, quiltId, expectedGeneration, operatorId, reason }
  }
  if (expectedGeneration !== 0) {
    throw new CanonicalWorldUsageError('--expected-generation must be 0 for provision.')
  }
  return {
    action: parsedAction,
    expectedGeneration: 0,
    patchRows: safeInteger(required(argumentsByName, 'patch-rows'), 'patch-rows', true),
    patchColumns: safeInteger(required(argumentsByName, 'patch-columns'), 'patch-columns', true),
    patchWidth: finiteNumber(required(argumentsByName, 'patch-width'), 'patch-width', true),
    patchHeight: finiteNumber(required(argumentsByName, 'patch-height'), 'patch-height', true),
    originX: finiteNumber(required(argumentsByName, 'origin-x'), 'origin-x', false),
    originY: finiteNumber(required(argumentsByName, 'origin-y'), 'origin-y', false),
    operatorId,
    reason,
  }
}

const defaultDependencies: CanonicalWorldCliDependencies = {
  status: getCanonicalWorldStatus,
  provision: provisionCanonicalWorld,
  activate: activateCanonicalWorld,
  deactivate: deactivateCanonicalWorld,
  close: closeDatabaseBundle,
}

const errorCode = (error: unknown): CanonicalWorldCliErrorCode => {
  if (error instanceof CanonicalWorldUsageError) return 'usage_error'
  if (error instanceof CanonicalWorldGenerationConflictError) return 'generation_conflict'
  if (error instanceof CanonicalWorldTargetInvalidError) return 'target_invalid'
  return 'database_error'
}

const safeMessage = (code: CanonicalWorldCliErrorCode): string => {
  if (code === 'usage_error') return 'Invalid canonical world command arguments.'
  if (code === 'generation_conflict') return 'Canonical world generation conflict.'
  if (code === 'target_invalid') return 'Canonical world target is invalid.'
  return 'Canonical world database operation failed.'
}

const parsedActionFrom = (argv: string[]): string | undefined => {
  const actionIndex = argv.indexOf('--action')
  const action = actionIndex >= 0 ? argv[actionIndex + 1] : undefined
  return action && !action.startsWith('--') ? action : undefined
}

export const runCanonicalWorldCli = async (
  argv: string[],
  dependencies: CanonicalWorldCliDependencies = defaultDependencies,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> => {
  let result: CanonicalWorldOperatorResult | undefined
  let failure: unknown
  try {
    const input = parseCanonicalWorldArguments(argv)
    result = input.action === 'status'
      ? await dependencies.status()
      : await dependencies[input.action](input as never)
  } catch (error) {
    failure = error
  } finally {
    try {
      await dependencies.close()
    } catch (error) {
      failure ??= error
      result = undefined
    }
  }

  if (failure) {
    const code = errorCode(failure)
    const action = parsedActionFrom(argv)
    output.error(JSON.stringify({
      schemaVersion: 1,
      ...(action ? { action } : {}),
      result: 'failed',
      message: safeMessage(code),
      code,
    }))
    return 1
  }
  output.log(JSON.stringify(result))
  return 0
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  void runCanonicalWorldCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode
  })
}