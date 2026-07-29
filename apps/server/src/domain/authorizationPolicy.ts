import { patchStateValues, patchVisibilityValues } from '../db/types.js'
import type { PatchStateValue, PatchVisibilityValue } from '../db/types.js'

export const visibilitySurfaces = [
  'existence',
  'fineData',
  'aggregateData',
  'presence',
  'search',
  'durableEvents',
] as const

export type VisibilitySurface = (typeof visibilitySurfaces)[number]

export type PersistedVisibilityPolicy = Record<VisibilitySurface, PatchVisibilityValue> & {
  claimEnabled: boolean
  policyVersion: number
}

export type PatchVisibilitySubject = {
  authenticated: boolean
  isMember: boolean
}

export type PatchVisibilityContext = {
  state: PatchStateValue
  policy: PersistedVisibilityPolicy | null | undefined
  subject: PatchVisibilitySubject
}

const visibilitySet = new Set<string>(patchVisibilityValues)
const stateSet = new Set<string>(patchStateValues)

export const isPersistedVisibilityPolicy = (value: unknown): value is PersistedVisibilityPolicy => {
  if (!value || typeof value !== 'object') return false
  const policy = value as Record<string, unknown>
  return visibilitySurfaces.every((surface) => visibilitySet.has(String(policy[surface])))
    && typeof policy.claimEnabled === 'boolean'
    && Number.isSafeInteger(policy.policyVersion)
    && Number(policy.policyVersion) > 0
    && policy.presence !== 'public'
}

const lifecycleAllows = (surface: VisibilitySurface, state: PatchStateValue): boolean => {
  if (!stateSet.has(state) || state === 'deleted') return false
  if (state === 'deletion_requested') return surface === 'aggregateData'
  if (state === 'suspended') return surface !== 'presence'
  return true
}

export const canAccessPatchSurface = (
  surface: VisibilitySurface,
  context: PatchVisibilityContext,
): boolean => {
  if (!isPersistedVisibilityPolicy(context.policy) || !lifecycleAllows(surface, context.state)) {
    return false
  }

  const visibility = context.policy[surface]
  if (visibility === 'public') return surface !== 'presence'
  if (visibility === 'authenticated') return context.subject.authenticated
  return context.subject.isMember
}

export const evaluatePatchVisibility = (
  context: PatchVisibilityContext,
): Record<VisibilitySurface, boolean> => Object.fromEntries(
  visibilitySurfaces.map((surface) => [surface, canAccessPatchSurface(surface, context)]),
) as Record<VisibilitySurface, boolean>