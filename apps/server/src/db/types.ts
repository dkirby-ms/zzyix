export const tileShapeValues = ['square', 'triangle', 'rectangle', 'l-shape'] as const

export const materialVariantValues = ['ceramic', 'glass', 'stone'] as const

export const operationTypeValues = ['tile_placed', 'tile_removed'] as const

export const principalKindValues = ['human', 'system'] as const

export const quiltTopologyValues = ['bounded', 'toroidal'] as const

export const patchStateValues = ['unclaimed', 'active', 'suspended', 'deletion_requested', 'deleted'] as const

export const patchMembershipRoleValues = ['member', 'owner'] as const

export type TileShapeValue = (typeof tileShapeValues)[number]

export type MaterialVariantValue = (typeof materialVariantValues)[number]

export type OperationTypeValue = (typeof operationTypeValues)[number]

export type PrincipalKindValue = (typeof principalKindValues)[number]

export type QuiltTopologyValue = (typeof quiltTopologyValues)[number]

export type PatchStateValue = (typeof patchStateValues)[number]

export type PatchMembershipRoleValue = (typeof patchMembershipRoleValues)[number]