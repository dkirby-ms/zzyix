import { describe, expect, it } from 'vitest'
import {
  canAccessPatchSurface,
  evaluatePatchVisibility,
  type PersistedVisibilityPolicy,
} from './authorizationPolicy.js'

const authenticatedPolicy: PersistedVisibilityPolicy = {
  existence: 'authenticated',
  fineData: 'authenticated',
  aggregateData: 'authenticated',
  presence: 'authenticated',
  search: 'authenticated',
  durableEvents: 'authenticated',
  claimEnabled: false,
  policyVersion: 1,
}

describe('persisted visibility policy', () => {
  it('uses one policy across catalog, snapshots, aggregates, presence, search, and replay', () => {
    expect(evaluatePatchVisibility({
      state: 'active',
      policy: authenticatedPolicy,
      subject: { authenticated: true, isMember: false },
    })).toEqual({
      existence: true,
      fineData: true,
      aggregateData: true,
      presence: true,
      search: true,
      durableEvents: true,
    })
  })

  it('denies every quilt surface to anonymous subjects, including public aggregates', () => {
    const publicPolicy: PersistedVisibilityPolicy = {
      ...authenticatedPolicy,
      existence: 'public',
      fineData: 'public',
      aggregateData: 'public',
      search: 'public',
      durableEvents: 'public',
    }

    expect(evaluatePatchVisibility({
      state: 'active',
      policy: publicPolicy,
      subject: { authenticated: false, isMember: false },
    })).toEqual({
      existence: false,
      fineData: false,
      aggregateData: false,
      presence: false,
      search: false,
      durableEvents: false,
    })
  })

  it('fails closed for missing or invalid persisted policy', () => {
    const subject = { authenticated: true, isMember: true }
    expect(evaluatePatchVisibility({ state: 'active', policy: null, subject })).toEqual({
      existence: false,
      fineData: false,
      aggregateData: false,
      presence: false,
      search: false,
      durableEvents: false,
    })
    expect(canAccessPatchSurface('fineData', {
      state: 'active',
      policy: { ...authenticatedPolicy, policyVersion: 0 },
      subject,
    })).toBe(false)
  })

  it('keeps hidden resources inaccessible to non-members and restricts lifecycle states', () => {
    const hiddenPolicy: PersistedVisibilityPolicy = {
      ...authenticatedPolicy,
      existence: 'hidden',
      fineData: 'hidden',
      presence: 'hidden',
      durableEvents: 'hidden',
    }
    expect(canAccessPatchSurface('existence', {
      state: 'active',
      policy: hiddenPolicy,
      subject: { authenticated: true, isMember: false },
    })).toBe(false)
    expect(canAccessPatchSurface('existence', {
      state: 'active',
      policy: hiddenPolicy,
      subject: { authenticated: true, isMember: true },
    })).toBe(true)
    expect(canAccessPatchSurface('presence', {
      state: 'suspended',
      policy: hiddenPolicy,
      subject: { authenticated: true, isMember: true },
    })).toBe(false)
  })
})