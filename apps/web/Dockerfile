# syntax=docker/dockerfile:1.7
# Builds the SPA and serves it from Caddy, which is also the TLS edge and reverse proxy (plan §2).
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @mapmory/web...
RUN pnpm --filter @mapmory/web build

FROM caddy:2-alpine AS runtime
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
