import type { SessionSummary } from '../network/session'

type LobbyScreenProps = {
  sessions: SessionSummary[]
  loading: boolean
  error: string | null
  previousSessionId: string | null
  creating: boolean
  joiningSessionId: string | null
  onRefresh: () => void
  onCreate: () => void
  onJoin: (sessionId: string) => void
}

const formatCanvasSize = (width: number, height: number): string => {
  if (width <= 0 || height <= 0) {
    return 'Unknown size'
  }

  return `${width} x ${height}`
}

export function LobbyScreen({
  sessions,
  loading,
  error,
  previousSessionId,
  creating,
  joiningSessionId,
  onRefresh,
  onCreate,
  onJoin,
}: LobbyScreenProps) {
  return (
    <section className="lobby-panel" aria-live="polite">
      <header className="lobby-header">
        <div>
          <h1>Choose a Canvas</h1>
          <p>Join an existing canvas or create a fresh one to start placing tiles.</p>
        </div>
        <div className="lobby-actions">
          <button type="button" onClick={onRefresh} disabled={loading || creating}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="active" onClick={onCreate} disabled={creating || loading}>
            {creating ? 'Creating...' : 'Create Canvas'}
          </button>
        </div>
      </header>

      {error && <p className="lobby-error">{error}</p>}

      {loading && sessions.length === 0 ? (
        <p className="lobby-empty">Loading canvases...</p>
      ) : sessions.length === 0 ? (
        <p className="lobby-empty">No canvases are available yet. Create one to get started.</p>
      ) : (
        <ul className="lobby-list">
          {sessions.map((session) => {
            const isJoining = joiningSessionId === session.id
            const isPrevious = previousSessionId === session.id

            return (
              <li key={session.id} className="lobby-row">
                <div className="lobby-meta">
                  <h2>{session.displayName}</h2>
                  <p>
                    {session.connectedUserCount} connected · {formatCanvasSize(session.canvasSize.width, session.canvasSize.height)}
                  </p>
                  {isPrevious && <span className="lobby-chip">Last used</span>}
                </div>

                <button
                  type="button"
                  onClick={() => onJoin(session.id)}
                  disabled={creating || loading || isJoining}
                >
                  {isJoining ? 'Joining...' : 'Join'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
