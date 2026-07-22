import React from 'react'
import type { ConnectionState } from '../network/useConnectionStatus'
import './StatusIndicator.css'

export interface StatusIndicatorProps {
  connectionState: ConnectionState
}

const getStatusDisplay = (status: ConnectionState): { text: string; className: string } => {
  switch (status.status) {
    case 'connected':
      return { text: 'Connected', className: 'status-connected' }
    case 'connecting':
      return { text: 'Connecting...', className: 'status-connecting' }
    case 'error':
      return { text: 'Connection Error', className: 'status-error' }
    case 'disconnected':
    case 'disconnecting':
      return { text: 'Offline', className: 'status-disconnected' }
    default:
      return { text: 'Unknown', className: 'status-unknown' }
  }
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ connectionState }) => {
  const display = getStatusDisplay(connectionState)

  return (
    <div className={`status-indicator ${display.className}`} title={connectionState.lastError}>
      <div className="status-dot" />
      <span className="status-text">{display.text}</span>
    </div>
  )
}
