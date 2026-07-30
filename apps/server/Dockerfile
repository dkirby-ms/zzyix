# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS deps
WORKDIR /app
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

COPY package*.json ./
COPY apps/server/package.json ./apps/server/
RUN npm ci --workspace=apps/server --include-workspace-root --omit=dev

COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/migrations ./migrations

RUN printf '%s\n' '#!/bin/sh' \
	'set -eu' \
	'report_path="${LEGACY_RETIREMENT_REPORT_PATH:-/tmp/canonical-retirement-report.json}"' \
	'if [ -z "${LEGACY_RETIREMENT_REPORT_BASE64:-}" ]; then echo "Missing immutable retirement report." >&2; exit 1; fi' \
	'printf "%s" "$LEGACY_RETIREMENT_REPORT_BASE64" | base64 -d > "$report_path"' \
	'unset LEGACY_RETIREMENT_REPORT_BASE64' \
	'exec node dist/index.js' > /app/start-server.sh \
	&& chmod 500 /app/start-server.sh

EXPOSE 3001
CMD ["/app/start-server.sh"]
