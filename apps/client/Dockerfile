# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
COPY apps/client/package*.json ./apps/client/
RUN npm install --workspace=apps/client --include-workspace-root

COPY apps/client ./apps/client
COPY apps/server/src/contracts.ts ./apps/server/src/contracts.ts
RUN npm run build --workspace=apps/client

FROM nginx:1.27-alpine AS runtime

# Replace default nginx config to support SPA routing.
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
