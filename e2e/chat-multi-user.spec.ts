import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import type {
  ChatJoinAck,
  ChatSendAck,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../apps/server/src/contracts'
import { SHARED_CHAT_CONVERSATION_ID, SCHEMA_VERSION, QUILT_PROTOCOL_VERSION } from '../apps/server/src/contracts'

const REPLICA_A = 'http://127.0.0.1:3201'
const REPLICA_B = 'http://127.0.0.1:3202'
const OIDC_ISSUER = 'http://127.0.0.1:3299/'
const RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const issueToken = async (subject: string): Promise<string> => {
  const response = await fetch(new URL('token', OIDC_ISSUER), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject }),
  })
  expect(response.ok).toBe(true)
  return (await response.json() as { access_token: string }).access_token
}

const discover = async (replica: string, token: string): Promise<{ quiltId: string; generation: number; entryAttemptId: string }> => {
  const response = await fetch(`${replica}/quilts/canonical`, { headers: { authorization: `Bearer ${token}` } })
  expect(response.ok).toBe(true)
  return await response.json() as { quiltId: string; generation: number; entryAttemptId: string }
}

const connect = async (replica: string, token: string): Promise<TestSocket> => {
  const descriptor = await discover(replica, token)
  const socket: TestSocket = io(replica, {
    auth: {
      token,
      quiltId: descriptor.quiltId,
      clientId: `chat-${crypto.randomUUID()}`,
      schemaVersion: SCHEMA_VERSION,
      protocolVersion: QUILT_PROTOCOL_VERSION,
      canonicalGeneration: descriptor.generation,
      entryAttemptId: descriptor.entryAttemptId,
    },
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
  })
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out connecting to chat replica')), 10_000)
    socket.once('connect', () => { clearTimeout(timeout); resolve() })
    socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error) })
    socket.connect()
  })
  return socket
}

const join = async (socket: TestSocket, cursor?: ChatJoinAck['cursor']): Promise<ChatJoinAck> => new Promise((resolve, reject) => {
  socket.emit('chat_join', { conversationId: SHARED_CHAT_CONVERSATION_ID, cursor }, (response) => {
    if ('messages' in response) resolve(response)
    else reject(new Error(response.message ?? response.code))
  })
})

const send = async (socket: TestSocket, clientMessageId: string, body: string): Promise<ChatSendAck> => new Promise((resolve) => {
  socket.emit('chat_send', {
    conversationId: SHARED_CHAT_CONVERSATION_ID,
    clientMessageId,
    body,
  }, resolve)
})

test('delivers one shared ordered conversation across replicas and replays from a cursor', async ({ request }) => {
  const setup = await request.post(`${REPLICA_A}/test/reset`, {
    headers: { 'x-zzyix-test-token': RESET_TOKEN, 'content-type': 'application/json' },
    data: { createCanonicalWorld: true, ownerExternalSubject: `e2e-chat-owner-${crypto.randomUUID()}` },
  })
  expect(setup.ok()).toBe(true)

  const tokenA = await issueToken(`e2e-chat-user-a-${crypto.randomUUID()}`)
  const tokenB = await issueToken(`e2e-chat-user-b-${crypto.randomUUID()}`)
  const socketA = await connect(REPLICA_A, tokenA)
  const socketB = await connect(REPLICA_B, tokenB)

  try {
    const initialA = await join(socketA)
    const initialB = await join(socketB)
    expect(initialA.messages).toEqual([])
    expect(initialB.messages).toEqual([])

    const receivedByB: string[] = []
    socketB.on('chat_message_accepted', (payload) => receivedByB.push(payload.message.id))
    const first = await send(socketA, 'shared-client-1', 'first')
    expect(first).toMatchObject({ status: 'accepted', idempotent: false })
    if (first.status !== 'accepted') throw new Error('first send should be accepted')
    await expect.poll(() => receivedByB).toHaveLength(1)

    const retry = await send(socketA, 'shared-client-1', 'first changed on retry')
    expect(retry).toMatchObject({ status: 'accepted', idempotent: true, message: { id: first.message.id, body: 'first' } })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(receivedByB).toEqual([first.message.id])

    const cursorPage = await join(socketA)
    expect(cursorPage.messages.map((message) => message.body)).toEqual(['first'])
    expect(cursorPage.cursor?.sequence).toBe(1)

    const second = await send(socketB, 'shared-client-2', 'second')
    expect(second).toMatchObject({ status: 'accepted', idempotent: false })
    if (second.status !== 'accepted') throw new Error('second send should be accepted')
    expect(second.message.sequence).toBeGreaterThan(first.message.sequence)

    socketA.disconnect()
    const replaySocket = await connect(REPLICA_B, tokenA)
    try {
      const replay = await join(replaySocket, cursorPage.cursor)
      expect(replay.messages.map((message) => message.body)).toEqual(['second'])
      expect(replay.messages[0]?.sequence).toBe(2)
    } finally {
      replaySocket.disconnect()
    }
  } finally {
    socketA.disconnect()
    socketB.disconnect()
  }
})

test('rejects an unauthenticated Socket.IO connection', async ({ request }) => {
  const setup = await request.post(`${REPLICA_A}/test/reset`, {
    headers: { 'x-zzyix-test-token': RESET_TOKEN, 'content-type': 'application/json' },
    data: { createCanonicalWorld: true },
  })
  expect(setup.ok()).toBe(true)
  const invalidToken = 'not-a-signed-token'
  const descriptor = await discover(REPLICA_A, await issueToken(`e2e-chat-auth-${crypto.randomUUID()}`))
  const socket = io(REPLICA_A, {
    auth: {
      token: invalidToken,
      quiltId: descriptor.quiltId,
      clientId: `chat-${crypto.randomUUID()}`,
      schemaVersion: SCHEMA_VERSION,
      protocolVersion: QUILT_PROTOCOL_VERSION,
      canonicalGeneration: descriptor.generation,
      entryAttemptId: descriptor.entryAttemptId,
    },
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
  })

  await expect(new Promise<'rejected'>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for unauthorized connection rejection')), 10_000)
    socket.once('connect', () => { clearTimeout(timeout); reject(new Error('unauthorized socket connected')) })
    socket.once('connect_error', () => { clearTimeout(timeout); resolve('rejected') })
    socket.connect()
  })).resolves.toBe('rejected')
  socket.disconnect()
})