import type { ConnectionState } from '../network/useConnectionStatus'
import { StatusIndicator } from './StatusIndicator'

type AppHeaderProps = {
  onReturnToLobby?: () => void
  connectionState: ConnectionState
  collaboratorCount: number
  profileName?: string
  onLogout: () => void
}

export const AppHeader = ({
  onReturnToLobby,
  connectionState,
  collaboratorCount,
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
        {collaboratorCount > 0 && (
          <span className="collaborator-summary">
            {collaboratorCount} active
          </span>
        )}
        <div className="account-control" aria-label="Account controls">
          <StatusIndicator connectionState={connectionState} showLabel={false} />
          {profileName && <span className="profile-summary">{profileName}</span>}
          <button
            type="button"
            className="account-signout"
            aria-label="Sign out"
            title="Sign out"
            onClick={onLogout}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M10 4H5v16h5" />
              <path d="M14 8l5 4-5 4" />
              <path d="M9 12h10" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
