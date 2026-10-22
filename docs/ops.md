# Operations guide

How to run Mapmory in production (plan §11). The reference setup is a single EU region on a few VMs with
Docker Compose ([infra/docker-compose.prod.yml](../infra/docker-compose.prod.yml)). Every service is
stateless except Postgres, Redis, object storage and the tile/geocoder data.

## 1. Images

CI builds, scans (Trivy) and creates an SBOM for three images:

| Image | Contents |
|---|---|
| `mapmory-web` | Caddy: TLS, security headers/CSP, SPA, reverse proxy for `/api` and `/tiles` |
| `mapmory-api` | Fastify API and the migration entry point (`node dist/migrate.js`) |
| `mapmory-renderer` | MapLibre Native (Mesa/Xvfb), Chromium (Playwright base image), poppler, Ghostscript |

Base images are pinned by digest through Renovate. Containers run as non-root with a read-only root filesystem,
`no-new-privileges` and all capabilities dropped. Only `edge` publishes ports.

## 2. Secrets

Keep `.env.production` encrypted with SOPS (age keys per operator) and decrypt it only on the host at deploy time:

```bash
sops --decrypt infra/secrets/production.enc.env > .env.production
```

Required values: everything in [.env.example](../.env.example) (set `S3_PUBLIC_ENDPOINT` when the renderer and API reach storage through a private endpoint that browsers can't use), plus `POSTGRES_USER`/`POSTGRES_PASSWORD`
(owner role, used by `migrate` only), `REDIS_PASSWORD` (also embedded in `REDIS_URL`), `DOMAIN` and `ACME_EMAIL`.
Use **separate database roles**:

| Variable | Role | Rights |
|---|---|---|
| `MIGRATION_DATABASE_URL` | owner | DDL (migrations only) |
| `DATABASE_URL` | `mapmory_app` | DML on all tables |
| `RENDERER_DATABASE_URL` | `mapmory_renderer` | read designs, project titles and jobs; update job status columns |

Create the roles once with the statements in [infra/postgres/init.sql](../infra/postgres/init.sql), using strong passwords. The
grants are applied by migration `0001_roles.sql`.

Generate secrets with `openssl rand -base64 48` (`APP_SECRET`, `BETTER_AUTH_SECRET`) and
`openssl rand -base64 32` (`DATA_ENCRYPTION_KEY`). Rotating `DATA_ENCRYPTION_KEY` makes stored opt-in memory text
unreadable, so re-encrypt first.

## 3. Map tiles

1. Download the Protomaps planet build (about 139 GB as of 2026-10). Check the latest key at
   `https://build-metadata.protomaps.dev/builds.json`:
   `pmtiles extract https://build.protomaps.com/<build>.pmtiles planet.pmtiles` (or a plain download).
2. Put it in `TILES_DIR` and point `infra/martin/martin.yaml` at `/tiles/planet.pmtiles`.
3. Martin serves `/tiles/basemap/{z}/{x}/{y}` and `/tiles/font/{fontstack}/{range}` through Caddy with
   `Cache-Control: immutable`. Put a CDN in front of `/tiles/*` to absorb tile egress.
4. Set `TILES_PUBLIC_URL=https://<domain>/tiles` (browsers) and `TILES_INTERNAL_URL=http://martin:3000` (renderer).
5. Refresh monthly, or as often as you want new OSM edits, by swapping the file and restarting Martin.

## 4. Geocoding

The public Nominatim instance is forbidden in production by its usage policy, and the API refuses to start with it.
Options:
- **Self-hosted Photon** (recommended, `--profile photon`). Download the planet index described in the Photon
  documentation; it needs a large disk and lots of RAM, so size it with the current index. Then set
  `GEOCODER=photon` and `GEOCODER_URL=http://photon:2322`.
- **A hosted OSM-based geocoder** under contract (Photon- or Nominatim-compatible API). Set `GEOCODER_URL` and
  respect its rate limits with `GEOCODER_MIN_INTERVAL_MS`.

Results are cached in Redis for 7 days.

## 5. LLM

- `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`. Use an organisation with zero data retention and list Anthropic
  as a processor in the privacy notice.
- `LLM_PROVIDER=openai-compatible` for a self-hosted model (vLLM/Ollama) when memory text must stay on your own
  infrastructure.
- `LLM_DAILY_CALL_BUDGET` caps calls per UTC day. Past it, the heuristic fallback runs (`fallback: true` in the UI).
- Run the eval workflow (`.github/workflows/evals.yml`) after every prompt or model change (ADR 0003).

## 6. CMYK print-shop PDFs

1. Download **ISO Coated v2 (ECI)** (FOGRA39) from eci.org. Its license allows free use; it can't be fetched
   automatically.
2. Mount it into the renderer and set `CMYK_ICC_PROFILE=/profiles/ISOcoated_v2_eci.icc`
   (`GHOSTSCRIPT_PATH=gs` is preset in the image).
3. Set `RENDER_CMYK_ENABLED=true` on the API so the export page offers it.

Do test prints with your print partner before launch (plan §10).

## 7. Scaling and sizing

| Component | Start with | Scale on |
|---|---|---|
| api | 2 replicas, 1 vCPU / 768 MB | p95 latency, CPU |
| renderer-small (≤ A3) | 1 × 4 vCPU / 6 GB | queue depth `bull:export-small:wait` |
| renderer-large (A2+) | 1 × 8 vCPU / 16 GB | queue depth `bull:export-large:wait` |
| Postgres | managed or VM, daily encrypted backups + WAL archiving | — |
| Redis | 1 GB, AOF | — |

Each renderer process handles one job at a time (Chromium plus a full-page raster). On Linux, MapLibre Native renders
with Mesa (llvmpipe) on the CPU, so benchmark on the target hosts with `pnpm --filter @mapmory/renderer bench A0 300` and
size the job timeout (`RENDER_JOB_TIMEOUT_MS`, default 5 min). GPU hosts render much faster.

## 8. Retention and maintenance

The API runs an hourly maintenance job (one instance via BullMQ; `ENABLE_MAINTENANCE`). It:
- deletes export files past `EXPORT_RETENTION_DAYS` (default 30) and marks the jobs `expired`,
- deletes anonymous projects past `ANON_RETENTION_DAYS` (default 30),
- trims design history to the last `REVISIONS_KEPT` revisions (revision 1 is kept for "reset"),
- fails jobs stuck for more than an hour and prunes audit events older than a year.

Also set a lifecycle rule on the bucket as a second line of defence. Account deletion (`DELETE /api/v1/me`) is
immediate in the database. Backups age out within the backup rotation (keep it ≤ 30 days to match the privacy notice).

## 9. Observability

- `GET /metrics` on the API (protect it with `METRICS_TOKEN`) and on each renderer (port 9464). Key series:
  `mapmory_http_request_duration_seconds`, `mapmory_export_duration_seconds`, `mapmory_export_failures_total`,
  `mapmory_interpretations_total`.
- Structured JSON logs to stdout (Loki or similar). They contain no memory text, poster text, query strings,
  cookies or tokens.
- Alerts: export failure rate, queue wait > 2 min, LLM fallback ratio, 5xx rate, certificate expiry.

## 10. Release checklist

1. CI green, including renderer parity, e2e/axe, Trivy and gitleaks.
2. `docker compose -f infra/docker-compose.prod.yml run --rm migrate`
3. `docker compose -f infra/docker-compose.prod.yml up -d`
4. Smoke test: `/readyz`, create a poster, export an A4 PDF, download it.
5. Before public launch: external penetration test, test prints of each theme, and the DPA list in the privacy notice.
