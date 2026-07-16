import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { randomUUID } from 'node:crypto'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  ConnectionAuth,
  Session,
  ClientPresence,
  PlaceTilePayload,
  PlaceTileAck,
  PlaceTileRejectReason,
  RemoveTilePayload,
  RemoveTileAck,
  TilePlacedPayload,
  TileRemovedPayload,
} from './contracts'
import { defaultBounds, validatePlacement } from './domain/placementSolver'

type AuthoritativeSessionState = {
  session: Session
  clients: Map<string, ClientPresence>
  lastOpSeq: number
}

const sessions = new Map<string, AuthoritativeSessionState>()

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isValidTileId = (tileId: string): boolean => UUID_PATTERN.test(tileId)

export const toRejectReason = (reason: string): PlaceTileRejectReason => {
  if (reason.startsWith('out-of-bounds')) {
    return 'OUT_OF_BOUNDS'
  }
  if (reason.startsWith('overlap')) {
    return 'OVERLAP'
  }
  if (reason.startsWith('gap too large')) {
    return 'GAP_TOO_LARGE'
  }
  return 'PLACEMENT_REJECTED'
}

export const createAuthoritativeSessionState = (
  sessionId: string,
  now: number = Date.now(),
): AuthoritativeSessionState => ({
  session: {
    id: sessionId,
    tiles: [],
    createdAt: now,
    updatedAt: now,
  },
  clients: new Map(),
  lastOpSeq: 0,
})

export const getSessionState = (sessionId: string): AuthoritativeSessionState => {
  const existing = sessions.get(sessionId)
  if (existing) {
    return existing
  }

  const created = createAuthoritativeSessionState(sessionId)
  sessions.set(sessionId, created)
  return created
}

const nextOpSeq = (state: AuthoritativeSessionState): number => {
  state.lastOpSeq += 1
  return state.lastOpSeq
}

export const applyPlaceTile = (
  state: AuthoritativeSessionState,
  payload: PlaceTilePayload,
  placedBy: string,
): {
  opSeq: number
  ack: PlaceTileAck
  event?: TilePlacedPayload
} => {
  const opSeq = nextOpSeq(state)
  const validation = validatePlacement(payload.shape, payload.transform, state.session.tiles, defaultBounds)

  if (!validation.valid) {
    return {
      opSeq,
      ack: {
        placed: null,
        rejected: true,
        reason: toRejectReason(validation.reason),
      },
    }
  }

  const tile = {
    id: randomUUID(),
    ...payload,
    createdAt: Date.now(),
  }

  state.session.tiles.push(tile)
  state.session.updatedAt = Date.now()

  return {
    opSeq,
    ack: {
      placed: tile,
      rejected: false,
    },
    event: {
      tile,
      placedBy,
    },
  }
}

export const applyRemoveTile = (
  state: AuthoritativeSessionState,
  payload: RemoveTilePayload,
  removedBy: string,
): {
  opSeq: number
  ack: RemoveTileAck
  event?: TileRemovedPayload
} => {
  const opSeq = nextOpSeq(state)

  if (!isValidTileId(payload.tileId)) {
    return {
      opSeq,
      ack: { removed: false },
    }
  }

  const index = state.session.tiles.findIndex((tile) => tile.id === payload.tileId)
  if (index === -1) {
    return {
      opSeq,
      ack: { removed: false },
    }
  }

  state.session.tiles.splice(index, 1)
  state.session.updatedAt = Date.now()

  return {
    opSeq,
    ack: { removed: true },
    event: {
      tileId: payload.tileId,
      removedBy,
    },
  }
}

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

// ─── Initialize Express ──────────────────────────────────────────────────────

const app = express()
const httpServer = createServer(app)

app.use(express.json())

// Health check endpoint for container orchestration (ACA, K8s, etc.)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: '0.0.0' })
})

// ─── Initialize Socket.IO ────────────────────────────────────────────────────

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: process.env.CORS_ORIGIN ?? '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  },
)

// ─── Connection Middleware ───────────────────────────────────────────────────

io.use((socket, next) => {
  const auth = socket.handshake.auth as unknown as Partial<ConnectionAuth>

  if (!auth.sessionId || !auth.clientId) {
    return next(new Error('Missing sessionId or clientId in auth'))
  }

  // Store per-socket metadata
  socket.data.sessionId = auth.sessionId
  socket.data.clientId = auth.clientId

  console.log(`[Socket] Client connecting: ${auth.clientId} to session ${auth.sessionId}`)

  next()
})

// ─── Connection Handlers ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const { sessionId, clientId } = socket.data
  const state = getSessionState(sessionId)
  const joinedAt = Date.now()

  // Join the session room
  socket.join(sessionId)
  state.clients.set(clientId, {
    clientId,
    joinedAt,
  })

  console.log(
    `[Socket] Client joined: ${clientId} | Session: ${sessionId} | Room size: ${io.sockets.adapter.rooms.get(sessionId)?.size ?? 0}`,
  )

  socket.emit('session_snapshot', {
    session: state.session,
    clients: [...state.clients.values()],
  })

  socket.to(sessionId).emit('client_joined', {
    client: {
      clientId,
      joinedAt,
    },
  })

  // ── Event Handlers ────────────────────────────────────────────────────────

  socket.on('place_tile', (payload, ack) => {
    console.log(`[place_tile] ${clientId} attempting to place`, payload)
    const result = applyPlaceTile(state, payload, clientId)
    ack(result.ack)

    // Broadcast only after successful authoritative mutation.
    if (result.event) {
      io.to(sessionId).emit('tile_placed', result.event)
    }
  })

  socket.on('remove_tile', (payload, ack) => {
    console.log(`[remove_tile] ${clientId} attempting to remove`, payload.tileId)
    const result = applyRemoveTile(state, payload, clientId)
    ack(result.ack)

    // Broadcast only on successful authoritative removal.
    if (result.event) {
      io.to(sessionId).emit('tile_removed', result.event)
    }
  })

  socket.on('pointer_move', (payload) => {
    console.log(`[pointer_move] ${clientId}:`, payload)
    const existing = state.clients.get(clientId)
    if (existing) {
      existing.pointer = payload.position
    }

    // Broadcast to peers only (not the sender)
    socket.to(sessionId).emit('pointer_update', {
      clientId,
      position: payload.position,
    })
  })

  // ── Disconnection ──────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${clientId} from session ${sessionId}`)
    state.clients.delete(clientId)
    io.to(sessionId).emit('client_left', { clientId })
  })
})

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

// ─── Start Server ────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, HOST, () => {
    console.log(`[Server] Listening on ${HOST}:${PORT}`)
  })
}
