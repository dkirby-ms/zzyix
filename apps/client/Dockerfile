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

# Replace default nginx config to support SPA routing.
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
