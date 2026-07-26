type AppHeaderProps = {
  onReturnToLobby: () => void
  connectionState: string
  collaboratorCount: number
  canUndo: boolean
  onUndo: () => void
}

export const AppHeader = ({
  onReturnToLobby,
  connectionState,
  collaboratorCount,
  canUndo,
  onUndo,
}: AppHeaderProps) => {
  return (
    <header className="app-header">
      <button type="button" className="return-btn" onClick={onReturnToLobby}>
        ← Back
      </button>
      <span className="app-title">Mosaic Atelier</span>
      <span className="collaborator-summary">
        {collaboratorCount} active
      </span>
      <span className="connection-badge" data-state={connectionState}>
        {connectionState}
      </span>
      <button type="button" disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
    </header>
  )
}
