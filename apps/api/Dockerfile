# syntax=docker/dockerfile:1.7
# Base images are pinned by tag here; Renovate pins and updates them by digest (plan §8.1).
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @mapmory/api...
# tsup bundles every dependency into dist/ (see tsup.config.ts), so the runtime image needs no node_modules.
RUN pnpm --filter @mapmory/api build && mkdir -p /out && cp -r apps/api/dist apps/api/drizzle /out/ \
 && printf '{"type":"module"}\n' > /out/package.json

FROM node:22-alpine AS runtime
# No package managers at runtime: the bundle runs on plain node, and npm/corepack/yarn carry their own CVEs.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
