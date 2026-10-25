# syntax=docker/dockerfile:1.7
# Playwright's image ships Node 22 and Chromium with its system dependencies. Pinned to the playwright version.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @mapmory/renderer... --filter @mapmory/print-page...
RUN pnpm --filter @mapmory/print-page build \
 && pnpm --filter @mapmory/renderer build \
 && pnpm --filter @mapmory/renderer deploy --prod --legacy /out \
 && cp -r apps/renderer/dist /out/ && cp -r apps/print-page/dist /out/print-page

FROM mcr.microsoft.com/playwright:v1.64.1-noble AS runtime
# MapLibre Native (headless GL via Mesa under Xvfb), poppler for rasters, Ghostscript for CMYK.
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb xauth libgl1 libgl1-mesa-dri libegl1 libgles2 libopengl0 libglx-mesa0 libcurl4 libuv1 libjpeg-turbo8 libpng16-16 libicu74 \
      poppler-utils ghostscript tini \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/lib/node_modules/npm /usr/lib/node_modules/corepack /usr/lib/node_modules/yarn /usr/bin/npm /usr/bin/npx /usr/bin/corepack /usr/bin/yarn
# (No package managers at runtime: the worker runs on plain node, and npm/corepack/yarn carry their own CVEs.)
ENV NODE_ENV=production PRINT_PAGE_DIST=/app/print-page RENDER_TMP_DIR=/tmp/render PDFTOPPM_PATH=pdftoppm GHOSTSCRIPT_PATH=gs
WORKDIR /app
COPY --from=build --chown=pwuser:pwuser /out /app
USER pwuser
EXPOSE 9464
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:9464/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["xvfb-run", "-a", "-s", "-screen 0 1024x768x24", "node", "--enable-source-maps", "dist/worker.js"]
