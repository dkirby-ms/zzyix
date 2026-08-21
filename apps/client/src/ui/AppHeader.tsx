import type { ConnectionState } from '../network/useConnectionStatus'
import { ArrowLeft, LogOut, MessageCircle, Moon, Sun, Users } from 'lucide-react'
import { StatusIndicator } from './StatusIndicator'

export type ThemeMode = 'dark' | 'light'

type AppHeaderProps = {
  onReturnToLobby?: () => void
  connectionState: ConnectionState
  collaboratorCount: number
  profileName?: string
  onLogout: () => void
  theme: ThemeMode
  onToggleTheme: () => void
  chatOpen: boolean
  onToggleChat: () => void
}

export const AppHeader = ({
  onReturnToLobby,
  connectionState,
  collaboratorCount,
  profileName,
  onLogout,
  theme,
  onToggleTheme,
  chatOpen,
  onToggleChat,
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
        <span className="app-brand-subtitle">Shared mosaic atlas</span>
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
        <button
          type="button"
          className="chat-toggle"
          aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
          title={chatOpen ? 'Hide chat' : 'Show chat'}
          aria-pressed={chatOpen}
          onClick={onToggleChat}
        >
          <MessageCircle aria-hidden="true" />
        </button>
        <button
          type="button"
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
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
