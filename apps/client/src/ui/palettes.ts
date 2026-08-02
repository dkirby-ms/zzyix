export const palettes = {
  terracotta: ['#d4614f', '#eea655', '#f4d8a4', '#5f7588', '#2f4557'],
  lagoon: ['#4e6d7c', '#67aeb3', '#9fced8', '#d9efe6', '#f1b672'],
  dusk: ['#5f4b66', '#7b667f', '#b08ba4', '#d7bfce', '#f3d9b1'],
  quarry: ['#817267', '#a6907f', '#c7b6a3', '#e4d7c6', '#5c646a'],
  forest: ['#355e3b', '#5f8f52', '#97b86a', '#d6d88d', '#f4edc3'],
  aurora: ['#2f4858', '#33658a', '#49a078', '#9cc5a1', '#f6e8c3'],
  ember: ['#5a2a27', '#8c3b31', '#c35a3a', '#e08a45', '#f2c078'],
  frost: ['#2c3e50', '#4f6d8a', '#7fa1c3', '#bfd7ea', '#edf4fa'],
} as const

export type PaletteName = keyof typeof palettes

export const resolvePaletteColorSelection = (name: PaletteName, currentColor: string) => {
  const nextPalette = palettes[name]
  const didPreserveColor = nextPalette.some((swatch) => swatch === currentColor)
  const color = didPreserveColor ? currentColor : nextPalette[0]
  return {
    color,
    didFallback: !didPreserveColor,
  }
}

export const getCollaboratorColor = (clientId: string): string => {
  const swatches = Object.values(palettes).flat()
  let hash = 0

  for (let i = 0; i < clientId.length; i += 1) {
    hash = ((hash << 5) - hash) + clientId.charCodeAt(i)
    hash |= 0
  }

  return swatches[Math.abs(hash) % swatches.length]
}
