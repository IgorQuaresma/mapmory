import {
  BLEED_OPTIONS_MM,
  CreateProjectRequestSchema,
  EXPORT_DPIS,
  EXPORT_FORMATS,
  ExportOptionsSchema,
  FRAME_STYLES,
  LABEL_LANGUAGES,
  MAP_SHAPES,
  MARKER_ICONS,
  MAX_MEMORY_TEXT,
  MAX_RENDER_PX,
  PAPER_SIZES,
  parseDesign,
  type Design,
  type ExportJob,
  type ExportOptions,
  type GeocodeResult,
  type InterpretResponse,
} from '@mapmory/design-schema';
import { FONT_CATALOG } from '@mapmory/fonts';
import { canonicalJson, exportGeometry, generateDraft } from '@mapmory/poster-core';
import { THEME_LIST } from '@mapmory/themes';
import { ApiError } from './errors';
import { FIXTURE_PLACES, normalize, toResult } from './fixtures';
import { heuristicInterpretation } from './heuristics';
import type {
  ApiClient,
  Catalog,
  CreateProjectRequest,
  InterpretRequest,
  ProjectSummary,
  ProjectWithDesign,
  Session,
  SessionUser,
  ShareLink,
  SharedPoster,
  ShareStatus,
} from './types';

interface MockProject {
  summary: ProjectSummary;
  revisions: Design[];
}
interface MockExport {
  job: Omit<ExportJob, 'status' | 'progress' | 'downloadUrl' | 'finishedAt'>;
  projectId: string;
  contentKey: string;
  startedAt: number;
  title: string;
}
interface MockDb {
  user: SessionUser | null;
  pendingEmail: string | null;
  pendingAt: number;
  projects: Record<string, MockProject>;
  exports: Record<string, MockExport>;
  shares?: Record<string, { projectId: string; createdAt: string; expiresAt: string; revoked: boolean }>;
}

const STORAGE_KEY = 'mapmory-mock-db';
const SIGN_IN_DELAY_MS = 800;
const exportMs = () => Number(import.meta.env.VITE_MOCK_EXPORT_MS ?? 4000);
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

function load(): MockDb {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    /* storage unavailable */
  }
  return { user: null, pendingEmail: null, pendingAt: 0, projects: {}, exports: {} };
}

/**
 * In-memory implementation of docs/api.md, enabled with VITE_API_MOCK=1. It enforces the same rules the
 * real API does (schema validation, If-Match revisions, verified email for exports) so the UI paths are real.
 */
export class MockApi implements ApiClient {
  private db: MockDb = load();
  private blobUrls = new Map<string, string>();

  private persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch {
      /* ignore */
    }
  }

  private currentUser(): SessionUser | null {
    if (!this.db.user && this.db.pendingEmail && Date.now() - this.db.pendingAt > SIGN_IN_DELAY_MS) {
      // Simulates the user clicking the magic link in another tab.
      this.db.user = { id: 'u-mock', email: this.db.pendingEmail, name: this.db.pendingEmail.split('@')[0]!, emailVerified: true };
      this.db.pendingEmail = null;
      this.persist();
    }
    return this.db.user;
  }

  async getSession(): Promise<Session> {
    await delay(40);
    return {
      user: this.currentUser(),
      csrfToken: 'mock-csrf',
      features: { llm: true, cmyk: true, altcha: false },
      limits: { maxMemoryText: MAX_MEMORY_TEXT },
    };
  }

  async interpret(req: InterpretRequest): Promise<InterpretResponse> {
    await delay(500);
    if (req.text.trim().length < 3) throw new ApiError({ status: 400, code: 'validation_failed', title: 'Too short' });
    const interpretation = heuristicInterpretation(req.text, req.locale);
    const places = interpretation.places.map((p) => ({
      query: p.query,
      role: p.role,
      candidates: searchFixtures(p.query, 3),
    }));
    return { interpretation, places, fallback: false };
  }

  async geocode(q: string, _lang: string, limit = 6): Promise<GeocodeResult[]> {
    await delay(150);
    return searchFixtures(q, limit);
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    await delay(150);
    let best: { place: GeocodeResult; d: number } | null = null;
    for (const p of FIXTURE_PLACES) {
      const d = Math.hypot((p.lngLat[0] - lng) * Math.cos((lat * Math.PI) / 180), p.lngLat[1] - lat) * 111_000;
      if (p.type !== 'city' && (!best || d < best.d)) best = { place: toResult(p), d };
    }
    if (best && best.d < 400) return best.place;
    return null;
  }

  async catalog(): Promise<Catalog> {
    return mockCatalog();
  }

  async createProject(req: CreateProjectRequest): Promise<ProjectWithDesign> {
    await delay(200);
    const parsed = CreateProjectRequestSchema.parse(req);
    const design = generateDraft(parsed.draft);
    const id = crypto.randomUUID();
    const title = design.texts.find((t) => t.role === 'title')?.content || parsed.draft.places[0]!.name;
    const summary: ProjectSummary = {
      id,
      title,
      currentRevision: 1,
      createdAt: now(),
      updatedAt: now(),
      expiresAt: this.db.user ? null : new Date(Date.now() + 30 * 86400_000).toISOString(),
    };
    this.db.projects[id] = { summary, revisions: [design] };
    this.persist();
    return { project: summary, design, revision: 1 };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    await delay(60);
    return Object.values(this.db.projects)
      .map((p) => p.summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private project(id: string): MockProject {
    const p = this.db.projects[id];
    if (!p) throw new ApiError({ status: 404, code: 'not_found', title: 'Not found' });
    return p;
  }

  async getProject(id: string): Promise<ProjectWithDesign> {
    await delay(80);
    const p = this.project(id);
    return { project: p.summary, design: p.revisions.at(-1)!, revision: p.summary.currentRevision };
  }

  async saveDesign(id: string, design: Design, revision: number): Promise<{ revision: number }> {
    await delay(120);
    const p = this.project(id);
    if (revision !== p.summary.currentRevision) {
      throw new ApiError({
        status: 409,
        code: 'revision_conflict',
        title: 'Revision conflict',
        revision: p.summary.currentRevision,
        design: p.revisions.at(-1),
      });
    }
    let valid: Design;
    try {
      valid = parseDesign(design);
    } catch {
      throw new ApiError({ status: 400, code: 'validation_failed', title: 'Invalid design' });
    }
    p.revisions = [...p.revisions.slice(-49), valid];
    p.summary = {
      ...p.summary,
      currentRevision: p.summary.currentRevision + 1,
      updatedAt: now(),
      title: valid.texts.find((t) => t.role === 'title')?.content || p.summary.title,
    };
    this.persist();
    return { revision: p.summary.currentRevision };
  }

  async resetDesign(id: string): Promise<{ design: Design; revision: number }> {
    await delay(100);
    const p = this.project(id);
    const first = p.revisions[0]!;
    p.revisions.push(first);
    p.summary = { ...p.summary, currentRevision: p.summary.currentRevision + 1, updatedAt: now() };
    this.persist();
    return { design: first, revision: p.summary.currentRevision };
  }

  async deleteProject(id: string): Promise<void> {
    await delay(80);
    this.project(id);
    delete this.db.projects[id];
    for (const [eid, e] of Object.entries(this.db.exports)) if (e.projectId === id) delete this.db.exports[eid];
    this.persist();
  }

  async createExport(projectId: string, options: ExportOptions): Promise<ExportJob> {
    await delay(150);
    const user = this.currentUser();
    if (!user) throw new ApiError({ status: 401, code: 'auth_required', title: 'Sign in required' });
    if (!user.emailVerified) throw new ApiError({ status: 403, code: 'email_unverified', title: 'Verify your email' });
    const opts = ExportOptionsSchema.parse(options);
    const p = this.project(projectId);
    const design = p.revisions.at(-1)!;
    if (exportGeometry(design, opts).exceedsLimit) {
      throw new ApiError({ status: 422, code: 'export_too_large', title: 'Too large' });
    }
    // De-duplicate identical finished exports (same design content + options), like the API does.
    const contentKey = canonicalJson(design);
    const optionsKey = canonicalJson(opts);
    const existing = Object.entries(this.db.exports).find(
      ([, e]) => e.contentKey === contentKey && canonicalJson(e.job.options) === optionsKey,
    );
    if (existing && this.statusOf(existing[1]).status === 'done') return this.toJob(existing[0]);
    const active = Object.values(this.db.exports).find((e) => !['done', 'failed'].includes(this.statusOf(e).status));
    if (active) throw new ApiError({ status: 409, code: 'export_in_progress', title: 'An export is already running' });
    const id = crypto.randomUUID();
    this.db.exports[id] = {
      projectId,
      contentKey,
      startedAt: Date.now(),
      title: p.summary.title,
      job: { id, options: opts, errorCode: null, bytes: null, createdAt: now(), expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() },
    };
    this.persist();
    return this.toJob(id);
  }

  private statusOf(e: MockExport): Pick<ExportJob, 'status' | 'progress'> {
    const t = (Date.now() - e.startedAt) / exportMs();
    if (t >= 1) return { status: 'done', progress: 100 };
    if (t < 0.15) return { status: 'queued', progress: 0 };
    if (t < 0.5) return { status: 'rendering', progress: Math.round(t * 100) };
    if (t < 0.85) return { status: 'composing', progress: Math.round(t * 100) };
    return { status: 'uploading', progress: Math.round(t * 100) };
  }

  private toJob(id: string): ExportJob {
    const e = this.db.exports[id];
    if (!e) throw new ApiError({ status: 404, code: 'not_found', title: 'Not found' });
    const { status, progress } = this.statusOf(e);
    let downloadUrl: string | null = null;
    if (status === 'done') {
      downloadUrl = this.blobUrls.get(id) ?? null;
      if (!downloadUrl) {
        const ext = { pdf: 'pdf', png: 'png', jpeg: 'jpg', tiff: 'tif' }[e.job.options.format];
        const blob = new Blob([`Mapmory mock export (${e.title}) — ${ext.toUpperCase()} ${e.job.options.dpi} DPI`], { type: 'text/plain' });
        downloadUrl = URL.createObjectURL(blob);
        this.blobUrls.set(id, downloadUrl);
      }
    }
    return {
      ...e.job,
      status,
      progress,
      bytes: status === 'done' ? 1_234_567 : null,
      downloadUrl,
      finishedAt: status === 'done' ? new Date(e.startedAt + exportMs()).toISOString() : null,
    };
  }

  async listExports(projectId: string): Promise<ExportJob[]> {
    await delay(60);
    return Object.entries(this.db.exports)
      .filter(([, e]) => e.projectId === projectId)
      .map(([id]) => this.toJob(id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getExport(id: string): Promise<ExportJob> {
    await delay(60);
    return this.toJob(id);
  }

  async downloadDataExport(): Promise<Blob> {
    await delay(100);
    if (!this.currentUser()) throw new ApiError({ status: 401, code: 'auth_required', title: 'Sign in required' });
    const data = {
      account: this.db.user,
      projects: Object.values(this.db.projects).map((p) => ({ ...p.summary, design: p.revisions.at(-1) })),
      exports: Object.keys(this.db.exports).map((id) => this.toJob(id)),
    };
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  }

  async deleteAccount(): Promise<void> {
    await delay(150);
    this.db = { user: null, pendingEmail: null, pendingAt: 0, projects: {}, exports: {} };
    this.persist();
  }

  async createShareLink(projectId: string): Promise<ShareLink> {
    await delay(100);
    this.project(projectId);
    const shares = (this.db.shares ??= {});
    for (const sh of Object.values(shares)) if (sh.projectId === projectId) sh.revoked = true;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    shares[token] = { projectId, createdAt: now(), expiresAt, revoked: false };
    this.persist();
    return { url: `${window.location.origin}/s/${token}`, expiresAt };
  }

  async getShareStatus(projectId: string): Promise<ShareStatus> {
    await delay(60);
    this.project(projectId);
    const active = Object.values(this.db.shares ?? {}).find((sh) => sh.projectId === projectId && !sh.revoked && sh.expiresAt > now());
    return { active: active ? { createdAt: active.createdAt, expiresAt: active.expiresAt } : null };
  }

  async revokeShareLink(projectId: string): Promise<void> {
    await delay(60);
    for (const sh of Object.values(this.db.shares ?? {})) if (sh.projectId === projectId) sh.revoked = true;
    this.persist();
  }

  async getShared(token: string): Promise<SharedPoster> {
    await delay(80);
    const sh = this.db.shares?.[token];
    const p = sh && !sh.revoked && sh.expiresAt > now() ? this.db.projects[sh.projectId] : undefined;
    if (!sh || !p) throw new ApiError({ status: 404, code: 'not_found', title: 'Not found' });
    return { title: p.summary.title, design: p.revisions.at(-1)!, expiresAt: sh.expiresAt };
  }

  async signInMagicLink(email: string): Promise<void> {
    await delay(200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError({ status: 400, code: 'validation_failed', title: 'Invalid email' });
    this.db.pendingEmail = email;
    this.db.pendingAt = Date.now();
    this.persist();
  }

  async signOut(): Promise<void> {
    await delay(80);
    this.db.user = null;
    this.persist();
  }
}

function searchFixtures(q: string, limit: number): GeocodeResult[] {
  const nq = normalize(q);
  if (!nq) return [];
  const tokens = nq.split(/[\s,]+/).filter(Boolean);
  return FIXTURE_PLACES.map((p) => {
    const hay = normalize([p.name, p.label, ...p.aliases].join(' '));
    const score = tokens.filter((t) => hay.includes(t)).length / tokens.length + (normalize(p.name).startsWith(nq) ? 1 : 0);
    return { p, score };
  })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score || (a.p.type === 'city' ? 1 : -1))
    .slice(0, limit)
    .map((x) => toResult(x.p));
}

export function mockCatalog(): Catalog {
  const tiles = import.meta.env.VITE_TILES_URL ?? 'http://localhost:3010';
  return {
    themes: THEME_LIST,
    fonts: Object.values(FONT_CATALOG).map(({ id, family, weights, category }) => ({ id, family, weights, category })),
    papers: Object.values(PAPER_SIZES),
    markerIcons: [...MARKER_ICONS],
    mapShapes: [...MAP_SHAPES],
    frameStyles: [...FRAME_STYLES],
    labelLanguages: [...LABEL_LANGUAGES],
    exportFormats: [...EXPORT_FORMATS],
    dpis: [...EXPORT_DPIS],
    bleeds: [...BLEED_OPTIONS_MM],
    tiles: { tilesUrl: `${tiles}/basemap/{z}/{x}/{y}`, glyphsUrl: `${tiles}/font/{fontstack}/{range}`, maxzoom: 15 },
    maxRenderPx: MAX_RENDER_PX,
  };
}
