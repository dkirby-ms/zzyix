import { describe, expect, it } from 'vitest'
import { assertMigrationStatusCompatible } from './migrate.js'

describe('database schema compatibility', () => {
  it('accepts an exact migration count match', () => {
    expect(() => assertMigrationStatusCompatible({
      localMigrationCount: 6,
      appliedMigrationCount: 6,
    })).not.toThrow()
  })

  it('rejects production startup when migrations are pending', () => {
    expect(() => assertMigrationStatusCompatible({
      localMigrationCount: 6,
      appliedMigrationCount: 5,
    })).toThrow(/Run the one-shot db:apply command/)
  })

  it('rejects startup when the database is ahead of the application image', () => {
    expect(() => assertMigrationStatusCompatible({
      localMigrationCount: 6,
      appliedMigrationCount: 7,
    })).toThrow(/expected 6 applied migrations, found 7/)
  })
})