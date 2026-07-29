import { createServer, type Server } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose'

export const TEST_OIDC_AUDIENCE = 'api://zzyix-e2e'
export const TEST_OIDC_SCOPE = 'quilt.access'

type TestOidcEnvironment = Record<string, string | undefined>

type SigningKey = {
  kid: string
  privateKey: CryptoKey
  publicJwk: JWK
}

export type TestOidcTokenOptions = {
  subject: string
  expiresInSeconds?: number
  notBeforeSeconds?: number
  scope?: string
  name?: string
  email?: string
}

export type TestOidcIssuer = {
  issuer: string
  jwksUri: string
  start: () => Promise<void>
  stop: () => Promise<void>
  rotate: (retainPrevious?: boolean) => Promise<void>
  issueToken: (options: TestOidcTokenOptions) => Promise<string>
}

const assertTestMode = (environment: TestOidcEnvironment): void => {
  if (environment.NODE_ENV !== 'test' || environment.E2E_TEST_MODE !== 'true') {
    throw new Error('Local OIDC issuer requires NODE_ENV=test and E2E_TEST_MODE=true')
  }
}

const createSigningKey = async (): Promise<SigningKey> => {
  const kid = crypto.randomUUID()
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  return {
    kid,
    privateKey,
    publicJwk: { ...await exportJWK(publicKey), kid, alg: 'RS256', use: 'sig' },
  }
}

const listen = (server: Server, port: number, host: string): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))

export const createTestOidcIssuer = async (
  port = 3199,
  environment: TestOidcEnvironment = process.env,
): Promise<TestOidcIssuer> => {
  assertTestMode(environment)

  const host = '127.0.0.1'
  let issuer = `http://${host}:${port}/`
  let jwksUri = `${issuer}jwks`
  let activeKey = await createSigningKey()
  let publishedKeys = [activeKey.publicJwk]

  const issueToken = async ({
    subject,
    expiresInSeconds = 300,
    notBeforeSeconds = 0,
    scope = TEST_OIDC_SCOPE,
    name = 'E2E Canvas User',
    email,
  }: TestOidcTokenOptions): Promise<string> => {
    const now = Math.floor(Date.now() / 1_000)
    return new SignJWT({
      scp: scope,
      name,
      ...(email ? { email } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: activeKey.kid, typ: 'JWT' })
      .setIssuer(issuer)
      .setSubject(subject)
      .setAudience(TEST_OIDC_AUDIENCE)
      .setIssuedAt(now)
      .setNotBefore(now + notBeforeSeconds)
      .setExpirationTime(now + expiresInSeconds)
      .setJti(crypto.randomUUID())
      .sign(activeKey.privateKey)
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', issuer)
    response.setHeader('cache-control', 'no-store')
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('access-control-allow-headers', 'content-type')
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }

    if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        issuer,
        jwks_uri: jwksUri,
        token_endpoint: `${issuer}token`,
        id_token_signing_alg_values_supported: ['RS256'],
      }))
      return
    }

    if (request.method === 'GET' && url.pathname === '/jwks') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ keys: publishedKeys }))
      return
    }

    if (request.method === 'POST' && url.pathname === '/token') {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as TestOidcTokenOptions
      if (!body.subject) {
        response.writeHead(400).end()
        return
      }
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ access_token: await issueToken(body), token_type: 'Bearer' }))
      return
    }

    response.writeHead(404).end()
  })

  return {
    get issuer() { return issuer },
    get jwksUri() { return jwksUri },
    start: async () => {
      await listen(server, port, host)
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Local OIDC issuer failed to bind')
      issuer = `http://${host}:${address.port}/`
      jwksUri = `${issuer}jwks`
    },
    stop: () => close(server),
    rotate: async (retainPrevious = true) => {
      const previousKey = activeKey
      activeKey = await createSigningKey()
      publishedKeys = retainPrevious
        ? [previousKey.publicJwk, activeKey.publicJwk]
        : [activeKey.publicJwk]
    },
    issueToken,
  }
}

const run = async (): Promise<void> => {
  const port = Number(process.env.TEST_OIDC_PORT ?? 3199)
  const issuer = await createTestOidcIssuer(port)
  await issuer.start()
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  void run().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Local OIDC issuer failed')
    process.exit(1)
  })
}