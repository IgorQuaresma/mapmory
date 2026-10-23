# syntax=docker/dockerfile:1.7
# Builds the SPA and serves it from Caddy, which is also the TLS edge and reverse proxy (plan §2).
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @mapmory/web...
RUN pnpm --filter @mapmory/web build

# The official Caddy binary lags behind Go security releases; rebuild the same Caddy version with a patched Go
# toolchain and golang.org/x/net so the image scan stays clean (Trivy, CI "images" job).
FROM golang:1.27.3-alpine AS caddy
ARG CADDY_VERSION=v2.11.7
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest \
 && xcaddy build ${CADDY_VERSION} --replace golang.org/x/net=golang.org/x/net@v0.60.0 --output /usr/bin/caddy

FROM caddy:2-alpine AS runtime
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
