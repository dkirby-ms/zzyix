export const tileShapeValues = [
  'square',
  'triangle',
  'rectangle',
  'l-shape',
  'large-square',
  'circle',
  'right-triangle',
  'large-right-triangle',
] as const

export const materialVariantValues = ['ceramic', 'glass', 'stone'] as const

export const operationTypeValues = ['tile_placed', 'tile_removed'] as const

export const principalKindValues = ['human', 'system'] as const

export const principalStatusValues = ['active', 'disabled', 'deletion_pending', 'deleted'] as const

export const quiltTopologyValues = ['bounded', 'toroidal'] as const

export const patchStateValues = ['unclaimed', 'active', 'suspended', 'deletion_requested', 'deleted'] as const

export const patchMembershipRoleValues = ['member', 'owner'] as const

export const authorizationAuditOutcomeValues = ['allowed', 'denied', 'succeeded', 'failed'] as const

export const authorizationAuditChannelValues = ['http', 'socket', 'job', 'operation'] as const

export const patchClaimOutcomeValues = ['claimed', 'denied', 'conflict'] as const

export const ownershipTransferStatusValues = ['pending', 'accepted', 'cancelled', 'expired'] as const

export const patchVisibilityValues = ['hidden', 'authenticated', 'public'] as const

export type TileShapeValue = (typeof tileShapeValues)[number]

export type MaterialVariantValue = (typeof materialVariantValues)[number]

export type OperationTypeValue = (typeof operationTypeValues)[number]

export type PrincipalKindValue = (typeof principalKindValues)[number]

export type PrincipalStatusValue = (typeof principalStatusValues)[number]

export type QuiltTopologyValue = (typeof quiltTopologyValues)[number]

export type PatchStateValue = (typeof patchStateValues)[number]

export type PatchMembershipRoleValue = (typeof patchMembershipRoleValues)[number]

export type AuthorizationAuditOutcomeValue = (typeof authorizationAuditOutcomeValues)[number]

export type AuthorizationAuditChannelValue = (typeof authorizationAuditChannelValues)[number]

export type PatchClaimOutcomeValue = (typeof patchClaimOutcomeValues)[number]

export type OwnershipTransferStatusValue = (typeof ownershipTransferStatusValues)[number]

export type PatchVisibilityValue = (typeof patchVisibilityValues)[number]