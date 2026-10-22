# Mapmory API v1 contract

Base path `/api/v1`. JSON everywhere. Request and response types come from `@mapmory/design-schema`
(`packages/design-schema/src/api.ts`). Errors use RFC 9457 `application/problem+json`:

```json
{ "type": "about:blank", "title": "Too Many Requests", "status": 429, "code": "rate_limited", "detail": "…" }
```

`code` is stable and meant for the UI: `validation_failed`, `rate_limited`, `quota_exceeded`, `altcha_required`,
`altcha_invalid`, `auth_required`, `email_unverified`, `not_found`, `revision_conflict`, `export_in_progress`,
`export_too_large`, `feature_unavailable`, `csrf_invalid`, `interpretation_unavailable`, `internal`.

## Session, cookies, CSRF

- Auth sessions are HttpOnly, Secure (prod) and SameSite=Lax cookies set by Better Auth under `/api/auth/*`.
- Anonymous work is tied to the HttpOnly `mm_anon` cookie (created when the first project is created). On the first
  authenticated request, anonymous projects are merged into the user and the cookie is cleared.
- **CSRF:** `GET /api/v1/session` sets an HttpOnly CSRF cookie and returns `csrfToken` in the body. Every
  `POST/PUT/PATCH/DELETE` under `/api/v1` must send `x-csrf-token: <csrfToken>`, and its `Origin` must equal the web origin.

## Endpoints

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/session` | — | `{ user: {id,email,name,emailVerified} \| null, csrfToken, features: { llm, cmyk, altcha }, limits: { maxMemoryText } }` |
| GET | `/altcha/challenge` | — | ALTCHA challenge JSON (for the `<altcha-widget challengeurl>`) |
| POST | `/interpretations` | `InterpretRequest` `{ text, locale, altcha? }` | `InterpretResponse` |
| GET | `/geocode?q=&lang=&limit=` | — | `{ results: GeocodeResult[] }` |
| GET | `/geocode/reverse?lat=&lng=&lang=` | — | `{ result: GeocodeResult \| null }` |
| GET | `/catalog` | — | `Catalog` (below) |
| POST | `/projects` | `CreateProjectRequest` `{ draft: DraftInput, keepMemoryText?, memoryText? }` | `201 { project: ProjectSummary, design: Design, revision: number }` |
| GET | `/projects` | — | `{ projects: ProjectSummary[] }` |
| GET | `/projects/:id` | — | `{ project, design, revision }` + `ETag: "<revision>"` |
| PUT | `/projects/:id/design` | `{ design }` + header `If-Match: "<revision>"` | `200 { revision }` · `409` problem with `code: "revision_conflict"` plus `revision` (current number) and `design` (current document), so the client can rebase |
| POST | `/projects/:id/design/reset` | — | `{ design, revision }` (draft revision 1 re-saved as a new revision) |
| DELETE | `/projects/:id` | — | `204` |
| POST | `/projects/:id/exports` | `ExportOptions` | `202 { export: ExportJob }` (reuses an identical finished export) |
| GET | `/projects/:id/exports` | — | `{ exports: ExportJob[] }` |
| GET | `/exports/:id` | — | `{ export: ExportJob }`; `downloadUrl` is set when `status = done` (signed, 15 min) |
| POST | `/projects/:id/share` | — | `201 { url, expiresAt }`: a new read-only preview link (30 days); revokes the previous one. The token is shown only once. |
| GET | `/projects/:id/share` | — | `{ active: { createdAt, expiresAt } \| null }` |
| DELETE | `/projects/:id/share` | — | `204`; the link stops working |
| GET | `/shared/:token` | — | Public: `{ title, design, expiresAt }` for the preview page (`noindex`, `no-store`) · `404` when expired or revoked |
| GET | `/me/data-export` | — | JSON attachment with the account, projects (current design) and export metadata |
| DELETE | `/me` | — | `204`; deletes the account and all data |

`ProjectSummary = { id, title, currentRevision, createdAt, updatedAt, expiresAt }`.

`Catalog`:

```ts
{
  themes: Theme[];               // @mapmory/themes (palette, typography, shape…)
  fonts: { id, family, weights: {min,max}, category }[];
  papers: PaperSize[];           // PAPER_SIZES values
  markerIcons, mapShapes, frameStyles, labelLanguages, exportFormats, dpis, bleeds: string[] | number[];
  tiles: { tilesUrl: string; glyphsUrl: string; maxzoom: number };   // public tile endpoints for the preview
  maxRenderPx: number;
}
```

## Auth (Better Auth, `/api/auth`)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/sign-in/magic-link` | `{ email, callbackURL }` | Sends a single-use link valid for 15 minutes. `callbackURL` must be a web-origin path. |
| GET | `/api/auth/magic-link/verify?token=&callbackURL=` | — | Opened from the email; sets the session cookie and redirects to `callbackURL`. An expired, used or invalid token redirects to `callbackURL?error=INVALID_TOKEN` (Better Auth's error code), which the web app shows as "this link has expired". |
| POST | `/api/auth/sign-out` | — | |
| GET | `/api/auth/get-session` | — | |

## Rate limits and quotas (defaults, see `apps/api/src/config.ts`)

| Scope | Limit |
|---|---|
| `POST /interpretations` | 10/min per IP; 30/day per anonymous session or user |
| `GET /geocode*` | 30/min per IP |
| `POST /projects` | 20/hour per IP |
| `PUT /design` | 120/min per session (autosave) |
| `POST /exports` | 5/hour and 20/day per user; one active export per user |
| `/api/auth/sign-in/*` | 5 per 10 min per IP |
| Global LLM budget | `LLM_DAILY_CALL_BUDGET` calls/day; past that, the heuristic fallback runs (`fallback: true`) |
