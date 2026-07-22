/**
 * Environment and startup validation
 * Checks that required environment variables are set and system is ready
 */

import { getDatabaseBundle, closeDatabaseBundle } from '../db/client.js'

export type ValidationResult = {
  success: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate environment variables
 */
const validateEnvironmentVariables = (): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  if (!process.env.DATABASE_URL) {
    errors.push(
      'DATABASE_URL environment variable is not set. ' +
      'Please set DATABASE_URL to your PostgreSQL connection string.'
    )
  }

  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV is not set, defaulting to development mode')
  }

  return { success: errors.length === 0, errors, warnings }
}

/**
 * Validate database connectivity
 */
const validateDatabaseConnectivity = async (): Promise<ValidationResult> => {
  const errors: string[] = []

  try {
    const { db } = getDatabaseBundle()
    
    // Try a simple query to verify connection
    await db.execute('SELECT 1')
    
    console.log('[validation] ✓ Database connection successful')
  } catch (error) {
    errors.push(
      `Database connection failed: ${error instanceof Error ? error.message : String(error)}. ` +
      'Ensure PostgreSQL is running and DATABASE_URL is correct.'
    )
  } finally {
    await closeDatabaseBundle()
  }

  return { success: errors.length === 0, errors, warnings: [] }
}

/**
 * Run all validation checks
 */
export const validateStartup = async (): Promise<ValidationResult> => {
  console.log('[validation] Running startup validation checks...')

  // Environment variables check (synchronous)
  const envResult = validateEnvironmentVariables()
  if (!envResult.success) {
    console.error('[validation] ✗ Environment validation failed:')
    envResult.errors.forEach(err => console.error(`  - ${err}`))
    return envResult
  }

  envResult.warnings.forEach(warn => console.warn(`[validation] ⚠ ${warn}`))

  // Database connectivity check (asynchronous)
  const dbResult = await validateDatabaseConnectivity()
  if (!dbResult.success) {
    console.error('[validation] ✗ Database validation failed:')
    dbResult.errors.forEach(err => console.error(`  - ${err}`))
    return dbResult
  }

  console.log('[validation] ✓ All startup validation checks passed')
  return { success: true, errors: [], warnings: [] }
}
