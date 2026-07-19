# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG TARGETARCH

COPY package*.json ./
COPY apps/client/package*.json ./apps/client/
RUN npm ci --workspace=apps/client --include-workspace-root
RUN if [ "$TARGETARCH" = "arm64" ]; then \
		node -e "require.resolve('@rolldown/binding-linux-arm64-gnu'); require.resolve('lightningcss-linux-arm64-gnu')" \
		|| npm install --workspace=apps/client --no-save @rolldown/binding-linux-arm64-gnu lightningcss-linux-arm64-gnu; \
	elif [ "$TARGETARCH" = "amd64" ]; then \
		node -e "require.resolve('@rolldown/binding-linux-x64-gnu'); require.resolve('lightningcss-linux-x64-gnu')" \
		|| npm install --workspace=apps/client --no-save @rolldown/binding-linux-x64-gnu lightningcss-linux-x64-gnu; \
	fi

COPY apps/client ./apps/client
COPY apps/server/src/contracts.ts ./apps/server/src/contracts.ts
RUN npm run build --workspace=apps/client

FROM nginx:1.27-alpine AS runtime

# Install envsubst (gettext) for environment variable substitution in nginx config
RUN apk add --no-cache gettext

# Copy nginx config template
COPY apps/client/nginx.conf /etc/nginx/nginx.conf.template
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

# Create entrypoint script to substitute environment variables and start nginx
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'set -e' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Starting nginx entrypoint..."' >> /entrypoint.sh && \
    echo 'BACKEND_SERVICE_HOSTNAME=${BACKEND_SERVICE_HOSTNAME:-localhost}' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] BACKEND_SERVICE_HOSTNAME=$BACKEND_SERVICE_HOSTNAME"' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Substituting nginx config template..."' >> /entrypoint.sh && \
    echo 'envsubst "\${BACKEND_SERVICE_HOSTNAME}" < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Generated nginx config:"' >> /entrypoint.sh && \
    echo 'cat /etc/nginx/conf.d/default.conf' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Starting nginx..."' >> /entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
