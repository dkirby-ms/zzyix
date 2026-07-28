import { describe, expect, it } from 'vitest'
import { QUILT_PROTOCOL_VERSION, SCHEMA_VERSION } from './contracts.js'

describe('shared contract version', () => {
  it('identifies the protocol-v2 contract generation', () => {
    expect(SCHEMA_VERSION).toBe('2.0.0')
    expect(QUILT_PROTOCOL_VERSION).toBe(2)
  })
})