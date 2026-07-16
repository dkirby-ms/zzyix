export const tileShapeValues = ['square', 'triangle', 'rectangle', 'l-shape'] as const

export const materialVariantValues = ['ceramic', 'glass', 'stone'] as const

export const operationTypeValues = ['tile_placed', 'tile_removed'] as const

export type TileShapeValue = (typeof tileShapeValues)[number]

export type MaterialVariantValue = (typeof materialVariantValues)[number]

export type OperationTypeValue = (typeof operationTypeValues)[number]