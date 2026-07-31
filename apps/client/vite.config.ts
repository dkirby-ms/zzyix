import path from 'path'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const clientEnv = loadEnv(mode, __dirname, '')

  const configuredServerUrl = (clientEnv.VITE_SERVER_URL || rootEnv.VITE_SERVER_URL || '').trim()
  const isHttpUrl = /^https?:\/\//i.test(configuredServerUrl)
  const serverTarget = isHttpUrl ? configuredServerUrl : 'http://localhost:3001'
  const configuredTestIssuer = (clientEnv.VITE_TEST_OIDC_ISSUER || rootEnv.VITE_TEST_OIDC_ISSUER || '').trim()
  const testIssuerTarget = /^https?:\/\//i.test(configuredTestIssuer) ? configuredTestIssuer : undefined

  return {
    envDir: '../..',
    plugins: [react()],
    server: {
      proxy: {
        '/health': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/me': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/sessions': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/ownership': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/quilts': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/claims': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/ownership-transfers': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/account': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: serverTarget,
          changeOrigin: true,
          ws: true,
        },
        ...(testIssuerTarget ? {
          '/__test-oidc': {
            target: testIssuerTarget,
            changeOrigin: true,
            rewrite: (requestPath: string) => requestPath.replace(/^\/__test-oidc/, ''),
          },
        } : {}),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  }
})
