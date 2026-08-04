# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS deps
WORKDIR /app
ENV NPM_CONFIG_FETCH_RETRIES=5 \
	NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
	NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
	NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
COPY package*.json ./
COPY apps/server/package.json ./apps/server/
RUN npm ci --workspace=apps/server --include-workspace-root

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/server ./apps/server
RUN npm run build --workspace=apps/server

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_FETCH_RETRIES=5 \
	NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
	NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
	NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

COPY package*.json ./
COPY apps/server/package.json ./apps/server/
RUN npm ci --workspace=apps/server --include-workspace-root --omit=dev

COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/migrations ./migrations

EXPOSE 3001
CMD ["node", "--import", "./dist/telemetry.js", "dist/index.js"]
