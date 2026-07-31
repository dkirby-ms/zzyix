type AppHeaderProps = {
  onReturnToLobby?: () => void
  connectionState: string
  collaboratorCount: number
  canUndo: boolean
  onUndo: () => void
  profileName?: string
  onLogout: () => void
}

export const AppHeader = ({
  onReturnToLobby,
  connectionState,
  collaboratorCount,
  canUndo,
  onUndo,
  profileName,
  onLogout,
}: AppHeaderProps) => {
  return (
    <header className="app-header">
      {onReturnToLobby && (
        <button type="button" className="return-btn" onClick={onReturnToLobby}>
          ← Back
        </button>
      )}
      <span className="app-header-title">Mosaic Atelier</span>
      <div className="app-header-meta">
        <span className="collaborator-summary">
          {collaboratorCount} active
        </span>
        <span className="connection-badge" data-state={connectionState}>
          {connectionState}
        </span>
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        {profileName && <span className="profile-summary">{profileName}</span>}
        <button type="button" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  )
}
