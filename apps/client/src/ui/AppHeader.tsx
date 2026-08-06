import type { ConnectionState } from '../network/useConnectionStatus'
import { ArrowLeft, LogOut, Users } from 'lucide-react'
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
          <ArrowLeft aria-hidden="true" />
          <span>Back to mosaics</span>
        </button>
      )}
      <div className="app-brand">
        <span className="app-brand-mark" aria-hidden="true">Z</span>
        <span className="app-header-title">zzyix</span>
        <span className="app-brand-subtitle">Living relic mosaic galaxy</span>
      </div>
      <div className="app-header-meta">
        <span className="observer-invite" title="Observers can pan and explore without editing">
          Observer lanes open
        </span>
        {collaboratorCount > 0 && (
          <span className="collaborator-summary" title={`${collaboratorCount} collaborators active`}>
            <Users aria-hidden="true" />
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
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
