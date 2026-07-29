import { closeDatabaseBundle } from '../db/index.js'
import { runPrincipalRecovery, type PrincipalRecoveryInput } from './principalRecovery.js'

const readArgument = (name: string): string => {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`--${name} is required`)
  return process.argv[index + 1]
}

const main = async (): Promise<void> => {
  const action = readArgument('action')
  if (action !== 'recover-principal' && action !== 'cancel-transfer') {
    throw new Error('--action must be recover-principal or cancel-transfer')
  }
  const input: PrincipalRecoveryInput = {
    action,
    targetId: readArgument('target-id'),
    operatorId: readArgument('operator-id'),
    supportTicket: readArgument('support-ticket'),
    reason: readArgument('reason'),
  }
  const result = await runPrincipalRecovery(input)
  if (!result.succeeded) {
    throw new Error('Operational recovery was denied')
  }
  console.log('Operational recovery completed successfully.')
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Operational recovery failed.')
    process.exitCode = 1
  })
  .finally(() => closeDatabaseBundle())