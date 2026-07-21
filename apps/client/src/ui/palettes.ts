export const palettes = {
  terracotta: ['#d4614f', '#eea655', '#f4d8a4', '#5f7588', '#2f4557'],
  lagoon: ['#4e6d7c', '#67aeb3', '#9fced8', '#d9efe6', '#f1b672'],
  dusk: ['#5f4b66', '#7b667f', '#b08ba4', '#d7bfce', '#f3d9b1'],
  quarry: ['#817267', '#a6907f', '#c7b6a3', '#e4d7c6', '#5c646a'],
} as const

export type PaletteName = keyof typeof palettes

export const getCollaboratorColor = (clientId: string): string => {
  const swatches = [...palettes.terracotta, ...palettes.lagoon, ...palettes.dusk, ...palettes.quarry]
  let hash = 0

  for (let i = 0; i < clientId.length; i += 1) {
    hash = ((hash << 5) - hash) + clientId.charCodeAt(i)
    hash |= 0
  }

  return swatches[Math.abs(hash) % swatches.length]
}
