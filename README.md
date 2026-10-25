# Mapmory

Turn a written memory into a print-ready map poster. Describe the moment, confirm the place, design the poster
without writing anything else, and download a file a print shop can use (PDF with bleed and crop marks,
or 300 DPI PNG/JPEG/TIFF, optionally CMYK). Posters can also show GPX/GeoJSON routes, your own photos and
freely placed, rotated text (ADR [0006](docs/adr/0006-routes-and-photos.md)).
Race posters give each leg of a triathlon (or duathlon, marathon, gran fondo…) its own map with the athlete's
route and splits (ADR [0007](docs/adr/0007-race-posters.md)).

Everything is built on OpenStreetMap data and open-source software. The design is in
[docs/architecture-plan.md](docs/architecture-plan.md), the API contract in [docs/api.md](docs/api.md), the
decisions and spike results in [docs/adr/](docs/adr/README.md), and running it in production in [docs/ops.md](docs/ops.md).

## How it fits together

```
apps/web         React SPA: wizard (memory → place → editor → export), live MapLibre preview
apps/api         Fastify API: auth (magic links), projects/designs, interpretation, geocoding, exports
apps/renderer    BullMQ worker: MapLibre Native map raster → Chromium PDF → poppler rasters → S3
apps/print-page  Static page Chromium loads to compose the PDF (same React components as the preview)
packages/
  design-schema  zod schemas for the design document and API (the single source of truth)
  poster-core    style builder, layout, projection, draft generator, preflight, units
  poster-react   poster overlay components used by the preview and the print page
  themes, fonts  theme palettes/typography; OFL fonts as static TrueType instances
  db             Drizzle schema shared by the API and renderer
infra/           docker-compose (dev + prod), Caddy edge, Martin tiles, Postgres roles, load tests
```

The preview and the export use the same style, layout and logical viewport; only the pixel ratio changes. The
measured parity between MapLibre GL JS and MapLibre Native is 0.00 % mismatched pixels without labels
([ADR 0001](docs/adr/0001-preview-export-parity.md)).

## Quick start (development)

Requirements: **Node 22** (the MapLibre Native binaries don't support Node 23), pnpm 10, Docker, poppler
(`pdftoppm`, `pdfinfo`), and optionally Ghostscript for CMYK.

```bash
pnpm install
cp .env.example .env            # then replace the three secrets (see the comments in the file)
pnpm setup                      # starts Postgres/Redis/S3/Martin/Mailpit, extracts dev tiles (~80 MB), migrates, installs Chromium
pnpm dev                        # web :5173, API :4000, render worker
```

Open http://localhost:5173. Sign-in emails land in Mailpit at http://localhost:8025.

The dev tiles cover **Paris, Münster, Lisbon and Manhattan** by default (`infra/scripts/dev-regions.geojson`, ~80 MB).
`DEV_REGION=portugal FORCE=1 pnpm setup:tiles` adds all of mainland Portugal (~690 MB, about 3 minutes). With
`GEOCODER=stub` the place search only knows a few places in the four cities; set `GEOCODER=photon` to search
anywhere with the public Photon instance (fair use, development only).

Interpretation runs without an LLM by default (`LLM_PROVIDER=heuristic`). To use one:
- Claude: `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=…`
- a local model: `LLM_PROVIDER=openai-compatible` with Ollama on `http://localhost:11434/v1`

Without the backend, `VITE_API_MOCK=1 pnpm --filter @mapmory/web dev` runs the whole UI against an in-memory mock.

| Service | URL |
|---|---|
| Web (Vite, proxies `/api`) | http://localhost:5173 |
| API | http://localhost:4000 (`/healthz`, `/readyz`, `/metrics`) |
| Martin (tiles, glyphs) | http://localhost:3010 |
| Mailpit | http://localhost:8025 |
| Postgres / Redis / S3 | localhost:5434 / 6380 / 8333 |

## Tests

| Command | What |
|---|---|
| `pnpm lint` · `pnpm typecheck` | ESLint (incl. a `dangerouslySetInnerHTML` ban) and TypeScript in every package |
| `pnpm --filter "./packages/*" test` | schema bounds (property-based), projection, layout, style validity, draft generation, preflight |
| `pnpm --filter @mapmory/api test` | interpretation normalization, heuristic, prompt-injection handling |
| `pnpm test:integration` | API against real Postgres + Redis (Testcontainers): CSRF, ALTCHA, IDOR, concurrency, magic-link sign-in, exports, GDPR |
| `pnpm --filter @mapmory/renderer test` | export correctness (boxes, fonts, DPI, ICC, attribution), CMYK, golden-image visual regression |
| `pnpm --filter @mapmory/renderer parity [threshold] [--labels]` | preview (GL JS) vs export (Native) pixel parity across all themes |
| `pnpm --filter @mapmory/renderer bench A0 300` | render time and peak memory for a paper size and DPI |
| `pnpm test:e2e` | Playwright: full flow, keyboard-only, mobile, sharing, axe-core WCAG 2.2 AA checks (mock API) |
| `pnpm --filter @mapmory/web e2e:real` | Playwright against the running stack: ALTCHA, geocoding, magic link via Mailpit, real render, S3 download |
| `pnpm --filter @mapmory/api evals <provider>` | LLM interpretation evals (50 cases; see ADR 0003) |
| `k6 run infra/load/api.js` | API load test |

**Renderer tests** need Martin with the dev tiles, Chromium and poppler. The golden images
(`apps/renderer/test/golden`) hold across GL backends: a Linux/Mesa render differs from the macOS/Metal goldens by
0.4 %, under the 1 % threshold. After an intentional visual change, regenerate them with `UPDATE_GOLDEN=1` and review the
diff images in `test/__output__/golden`.

## Security and privacy

See plan §8. In short:
- Strict CSP and security headers; a CSRF token and Origin check on every mutation.
- Magic-link sessions in HttpOnly cookies; ALTCHA proof-of-work for anonymous interpretation.
- Rate limits and quotas in Redis, plus an LLM budget breaker.
- The design document contains catalog enums only, never URLs.
- Route files are parsed in the browser and only simplified points are stored. Photos are re-encoded on upload (removing location and camera data), stored privately and referenced by id; unused ones are deleted after 24 hours.
- The renderer only reaches the tile server, and Chromium only its own bundle. The renderer uses a database role that can't read accounts or memory text.
- Memory text is discarded after interpretation unless the user opts in (then it is AES-256-GCM encrypted).
- Retention jobs, data export and account deletion are built in.
- Logs never contain memory text, poster text or query strings.

## Licenses

Map data © OpenStreetMap contributors (ODbL); every poster prints the attribution. Tiles: Protomaps basemap
build. Fonts: SIL OFL 1.1 (`packages/fonts/licenses`). Marker icons adapted from Material Icons (Apache 2.0).
