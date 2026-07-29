import { validateDeploymentOrigins } from './deployment-origin.mjs'

validateDeploymentOrigins({
  apiOrigin: process.env.AUTH_API_ORIGIN,
  redirectUri: process.env.AUTH_REDIRECT_URI,
  corsOrigin: process.env.CONFIGURED_CORS_ORIGIN,
})