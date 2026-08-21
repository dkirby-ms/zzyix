import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type {
  ClientJoinedPayload,
  ClientLeftPayload,
  ClientToServerEvents,
  ServerToClientEvents,
  QuiltPatchEventPayload,
  QuiltPatchResyncRequiredPayload,
  QuiltProtocolHandshake,
  QuiltScopedStatePayload,
  CanonicalWorldEntryDescriptor,
  CanonicalClientTelemetry,
  ChatCursor,
  ChatConversationId,
  ChatErrorPayload,
  ChatJoinAck,
  ChatMessageAcceptedPayload,
} from '../../../server/src/contracts'
import { SCHEMA_VERSION } from '../../../server/src/contracts'
import { isInteractionRequiredError, type AccessTokenProvider, type AuthLossReason } from './authenticatedFetch'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export const useSocketConnection = (
  serverUrl: string,
  canonicalWorld: CanonicalWorldEntryDescriptor | string | null,
  clientId: string,
  socketActionRef?: React.MutableRefObject<AppSocket | null>,
  onClientJoined?: (payload: ClientJoinedPayload) => void,
  onClientLeft?: (payload: ClientLeftPayload) => void,
  onQuiltProtocol?: (payload: QuiltProtocolHandshake) => void,
  onQuiltPatchState?: (payload: QuiltScopedStatePayload) => void,
  onQuiltPatchEvent?: (payload: QuiltPatchEventPayload) => void,
  onQuiltPatchResyncRequired?: (payload: QuiltPatchResyncRequiredPayload) => void,
  acquireAccessToken?: AccessTokenProvider,
  onAuthLoss?: (reason: AuthLossReason, error?: unknown) => void,
  expectedProtocolV2: boolean = false,
  onProtocolMismatch?: () => void,
  onConnectionEpoch?: (epoch: number) => void,
  suppliedEntryAttemptId?: string,
  onChatHistory?: (payload: ChatJoinAck) => void,
  onChatMessageAccepted?: (payload: ChatMessageAcceptedPayload) => void,
  onChatError?: (payload: ChatErrorPayload) => void,
  chatSubscription?: { conversationId: ChatConversationId; cursor?: ChatCursor },
): React.MutableRefObject<AppSocket | null> => {
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    if (!canonicalWorld || !acquireAccessToken) return
    const quiltId = typeof canonicalWorld === 'string' ? canonicalWorld : canonicalWorld.quiltId
    const canonicalGeneration = typeof canonicalWorld === 'string' ? 1 : canonicalWorld.generation
    const entryAttemptId = typeof canonicalWorld === 'string' ? suppliedEntryAttemptId : canonicalWorld.entryAttemptId
    if (!entryAttemptId) return

    let cancelled = false
    let renewalAttempted = false
    let renewal: Promise<void> | null = null
    let connectionEpoch = 0
    const entryStartedAt = performance.now()
    let entryReported = false
    let disconnectedAt: number | null = null
    let reconnectAttempts = 0
    let lineageAttemptId: string | undefined

    const socket: AppSocket = io(serverUrl, {
      autoConnect: false,
      auth: async (callback) => {
        try {
          const token = await acquireAccessToken()
          callback({
            token,
            quiltId,
            clientId,
            schemaVersion: SCHEMA_VERSION,
            protocolVersion: 2,
            canonicalGeneration,
            entryAttemptId,
            ...(lineageAttemptId ? { lineageAttemptId } : {}),
          })
        } catch (error) {
          onAuthLoss?.(isInteractionRequiredError(error) ? 'interaction_required' : 'authentication_failed', error)
          callback({})
        }
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.25,
    })

    const deliverTerminal = async (payload: CanonicalClientTelemetry): Promise<void> => {
      if (socket.connected) {
        socket.emit('canonical_telemetry', payload)
        return
      }
      try {
        const token = await acquireAccessToken()
        if (payload.name !== 'canonical_entry' && !lineageAttemptId) return
        await fetch(new URL('/quilts/canonical/telemetry', serverUrl || location.origin), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-canonical-attempt-id': entryAttemptId,
            ...(lineageAttemptId ? { 'x-canonical-lineage-id': lineageAttemptId } : {}),
          },
          body: JSON.stringify(payload),
          keepalive: true,
        })
      } catch {
        // The server also records every failure it can observe during authentication and initialization.
      }
    }

    const renewAndReconnect = (error?: unknown): void => {
      if (renewal) return
      if (renewalAttempted) {
        onAuthLoss?.('authentication_failed', error)
        return
      }

      renewalAttempted = true
      renewal = acquireAccessToken({ forceRefresh: true })
        .then(() => {
          if (!cancelled) socket.connect()
        })
        .catch((renewalError) => {
          if (!cancelled) {
            onAuthLoss?.(
              isInteractionRequiredError(renewalError) ? 'interaction_required' : 'authentication_failed',
              renewalError,
            )
          }
        })
        .finally(() => { renewal = null })
    }

    socket.on('connect', () => {
      renewalAttempted = false
      connectionEpoch += 1
      if (disconnectedAt !== null) {
        socket.emit('canonical_telemetry', {
          name: 'canonical_reconnect',
          outcome: 'recovered',
          durationMs: performance.now() - disconnectedAt,
          attempts: Math.max(1, reconnectAttempts),
        })
        disconnectedAt = null
        reconnectAttempts = 0
      }
      onConnectionEpoch?.(connectionEpoch)
      if (chatSubscription) {
        socket.emit('chat_join', chatSubscription, (response) => {
          if ('messages' in response) {
            onChatHistory?.(response)
          } else {
            onChatError?.(response)
          }
        })
      }
    })

    const handleCanonicalLineage = (payload: { lineageAttemptId: string }): void => {
      lineageAttemptId = payload.lineageAttemptId
    }
    socket.on('canonical_lineage', handleCanonicalLineage)

    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      const code = error.data?.code
      if (code === 'authentication_required' || code === 'invalid_token') {
        renewAndReconnect(error)
      } else if (code === 'principal_inactive' || code === 'insufficient_scope') {
        onAuthLoss?.('authentication_failed', error)
      } else if (!entryReported) {
        entryReported = true
        void deliverTerminal({
          name: 'canonical_entry',
          outcome: 'connection_failed',
          durationMs: performance.now() - entryStartedAt,
        })
      }
    })

    socket.on('disconnect', (reason: string) => {
      disconnectedAt = performance.now()
      reconnectAttempts = 0
      if (reason === 'io server disconnect') renewAndReconnect(new Error('Socket authentication expired'))
    })

    const handleReconnectAttempt = (): void => {
      reconnectAttempts += 1
    }
    const handleReconnectFailed = (): void => {
      if (disconnectedAt === null) return
      void deliverTerminal({
        name: 'canonical_reconnect',
        outcome: 'exhausted',
        durationMs: performance.now() - disconnectedAt,
        attempts: reconnectAttempts,
      })
      disconnectedAt = null
      reconnectAttempts = 0
    }
    socket.io.on('reconnect_attempt', handleReconnectAttempt)
    socket.io.on('reconnect_failed', handleReconnectFailed)

    const handleProtocol = (payload: QuiltProtocolHandshake): void => {
      if (expectedProtocolV2 && (payload.selectedProtocolVersion !== 2 || !payload.topology)) {
        if (!entryReported) {
          entryReported = true
          socket.emit('canonical_telemetry', {
            name: 'canonical_entry',
            outcome: 'protocol_rejected',
            durationMs: performance.now() - entryStartedAt,
            selectedProtocolVersion: payload.selectedProtocolVersion,
          })
        }
        socket.disconnect()
        onProtocolMismatch?.()
        return
      }
      if (!entryReported && payload.selectedProtocolVersion === 2 && payload.topology) {
        entryReported = true
        socket.emit('canonical_telemetry', {
          name: 'canonical_entry',
          outcome: 'ready',
          durationMs: performance.now() - entryStartedAt,
          selectedProtocolVersion: 2,
        })
      }
      onQuiltProtocol?.(payload)
    }
    socket.on('quilt_protocol', handleProtocol)
    if (onQuiltPatchState) socket.on('quilt_patch_state', onQuiltPatchState)
    if (onQuiltPatchEvent) socket.on('quilt_patch_event', onQuiltPatchEvent)
    if (onQuiltPatchResyncRequired) socket.on('quilt_patch_resync_required', onQuiltPatchResyncRequired)
    if (onClientJoined) {
      socket.on('client_joined', onClientJoined)
    }
    if (onClientLeft) {
      socket.on('client_left', onClientLeft)
    }
    if (onChatMessageAccepted) socket.on('chat_message_accepted', onChatMessageAccepted)
    if (onChatError) socket.on('chat_error', onChatError)

    socketRef.current = socket
    if (socketActionRef) {
      socketActionRef.current = socket
    }
    socket.connect()

    return () => {
      cancelled = true
      socket.off('quilt_protocol', handleProtocol)
      socket.off('canonical_lineage', handleCanonicalLineage)
      if (onQuiltPatchState) socket.off('quilt_patch_state', onQuiltPatchState)
      if (onQuiltPatchEvent) socket.off('quilt_patch_event', onQuiltPatchEvent)
      if (onQuiltPatchResyncRequired) socket.off('quilt_patch_resync_required', onQuiltPatchResyncRequired)
      if (onClientJoined) {
        socket.off('client_joined', onClientJoined)
      }
      if (onClientLeft) {
        socket.off('client_left', onClientLeft)
      }
      if (onChatMessageAccepted) socket.off('chat_message_accepted', onChatMessageAccepted)
      if (onChatError) socket.off('chat_error', onChatError)
      socket.io.off('reconnect_attempt', handleReconnectAttempt)
      socket.io.off('reconnect_failed', handleReconnectFailed)
      socket.disconnect()
      socketRef.current = null
      if (socketActionRef) {
        socketActionRef.current = null
      }
    }
  }, [
    serverUrl,
    canonicalWorld,
    clientId,
    socketActionRef,
    onClientJoined,
    onClientLeft,
    onQuiltProtocol,
    onQuiltPatchState,
    onQuiltPatchEvent,
    onQuiltPatchResyncRequired,
    acquireAccessToken,
    onAuthLoss,
    expectedProtocolV2,
    onProtocolMismatch,
    onConnectionEpoch,
    suppliedEntryAttemptId,
    onChatHistory,
    onChatMessageAccepted,
    onChatError,
    chatSubscription,
  ])

  return socketRef
}