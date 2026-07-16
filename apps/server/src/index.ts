import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  ConnectionAuth,
  SCHEMA_VERSION,
} from './contracts'

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001
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

  // Join the session room
  socket.join(sessionId)

  console.log(
    `[Socket] Client joined: ${clientId} | Session: ${sessionId} | Room size: ${io.sockets.adapter.rooms.get(sessionId)?.size ?? 0}`,
  )

  // TODO: Fetch the session from the domain layer and emit session_snapshot
  // socket.emit('session_snapshot', { session: {...}, clients: [...] })

  // ── Event Handlers ────────────────────────────────────────────────────────

  socket.on('place_tile', (payload, ack) => {
    console.log(`[place_tile] ${clientId} attempting to place`, payload)

    // TODO: Validate placement using domain engine
    // TODO: Either accept (assign ID, add to state) or reject

    // Placeholder: always accept
    const tile = {
      id: `tile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      ...payload,
      createdAt: Date.now(),
    }

    ack({ placed: tile, rejected: false })

    // TODO: Broadcast tile_placed to all clients in session
    // io.to(sessionId).emit('tile_placed', { tile, placedBy: clientId })
  })

  socket.on('remove_tile', (payload, ack) => {
    console.log(`[remove_tile] ${clientId} attempting to remove`, payload.tileId)

    // TODO: Validate tile exists, remove from state
    // TODO: Respond with success or failure

    // Placeholder: always success
    ack({ removed: true })

    // TODO: Broadcast tile_removed to all clients in session
    // io.to(sessionId).emit('tile_removed', { tileId: payload.tileId, removedBy: clientId })
  })

  socket.on('pointer_move', (payload) => {
    console.log(`[pointer_move] ${clientId}:`, payload)

    // TODO: Update or store client presence with pointer position

    // Broadcast to peers only (not the sender)
    socket.to(sessionId).emit('pointer_update', {
      clientId,
      position: payload.position,
    })
  })

  // ── Disconnection ──────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${clientId} from session ${sessionId}`)

    // TODO: Remove client from session presence list
    // TODO: Broadcast client_left to remaining clients
    // io.to(sessionId).emit('client_left', { clientId })
  })
})

// ─── Error Handling ──────────────────────────────────────────────────────────

io.on('error', (error) => {
  console.error('[Socket.IO Error]', error)
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

httpServer.listen(PORT, HOST, () => {
  console.log(`[Server] Listening on ${HOST}:${PORT}`)
})
