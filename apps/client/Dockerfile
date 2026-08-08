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
COPY apps/server/src/domain/quiltTopology.ts ./apps/server/src/domain/quiltTopology.ts
RUN npm run build --workspace=apps/client

FROM nginx:1.27-alpine AS runtime

# Install envsubst for nginx and jq for JSON-safe runtime configuration.
RUN apk add --no-cache gettext jq

# Copy nginx config template
COPY apps/client/nginx.conf /etc/nginx/nginx.conf.template
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

# Create entrypoint script to substitute environment variables and start nginx
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'set -e' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Starting nginx entrypoint..."' >> /entrypoint.sh && \
    echo 'required_variables="BACKEND_SERVICE_HOSTNAME AUTH_AUTHORITY AUTH_CLIENT_ID AUTH_API_SCOPE AUTH_API_ORIGIN AUTH_REDIRECT_URI AUTH_POST_LOGOUT_REDIRECT_URI"' >> /entrypoint.sh && \
    echo 'for variable_name in $required_variables; do' >> /entrypoint.sh && \
    echo '  eval "variable_value=\${$variable_name:-}"' >> /entrypoint.sh && \
    echo '  if [ -z "$variable_value" ]; then' >> /entrypoint.sh && \
    echo '    echo "ERROR: Required runtime setting $variable_name is missing." >&2' >> /entrypoint.sh && \
    echo '    exit 1' >> /entrypoint.sh && \
    echo '  fi' >> /entrypoint.sh && \
    echo 'done' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] BACKEND_SERVICE_HOSTNAME=$BACKEND_SERVICE_HOSTNAME"' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Generating runtime configuration..."' >> /entrypoint.sh && \
    echo 'jq -n \' >> /entrypoint.sh && \
    echo '  --arg authority "$AUTH_AUTHORITY" \' >> /entrypoint.sh && \
    echo '  --arg clientId "$AUTH_CLIENT_ID" \' >> /entrypoint.sh && \
    echo '  --arg apiScope "$AUTH_API_SCOPE" \' >> /entrypoint.sh && \
    echo '  --arg apiOrigin "$AUTH_API_ORIGIN" \' >> /entrypoint.sh && \
    echo '  --arg redirectUri "$AUTH_REDIRECT_URI" \' >> /entrypoint.sh && \
    echo '  --arg postLogoutRedirectUri "$AUTH_POST_LOGOUT_REDIRECT_URI" \' >> /entrypoint.sh && \
    echo '  '\''{authority: $authority, clientId: $clientId, apiScope: $apiScope, apiOrigin: $apiOrigin, redirectUri: $redirectUri, postLogoutRedirectUri: $postLogoutRedirectUri}'\'' \' >> /entrypoint.sh && \
    echo '  > /usr/share/nginx/html/auth-config.json' >> /entrypoint.sh && \
    echo 'jq empty /usr/share/nginx/html/auth-config.json' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Generating telemetry configuration..."' >> /entrypoint.sh && \
    echo 'if [ -z "${APPLICATIONINSIGHTS_CONNECTION_STRING:-}" ]; then' >> /entrypoint.sh && \
    echo '  echo "null" > /usr/share/nginx/html/telemetry-config.json' >> /entrypoint.sh && \
    echo '  echo "[entrypoint] Application Insights not configured"' >> /entrypoint.sh && \
    echo 'else' >> /entrypoint.sh && \
    echo '  jq -n \' >> /entrypoint.sh && \
    echo '    --arg connectionString "$APPLICATIONINSIGHTS_CONNECTION_STRING" \' >> /entrypoint.sh && \
    echo '    '\''{connectionString: $connectionString}'\'' \' >> /entrypoint.sh && \
    echo '    > /usr/share/nginx/html/telemetry-config.json' >> /entrypoint.sh && \
    echo '  jq empty /usr/share/nginx/html/telemetry-config.json' >> /entrypoint.sh && \
    echo '  echo "[entrypoint] Application Insights configured"' >> /entrypoint.sh && \
    echo 'fi' >> /entrypoint.sh && \
    echo 'envsubst "\${BACKEND_SERVICE_HOSTNAME}" < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf' >> /entrypoint.sh && \
    echo 'nginx -t' >> /entrypoint.sh && \
    echo 'echo "[entrypoint] Starting nginx..."' >> /entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
