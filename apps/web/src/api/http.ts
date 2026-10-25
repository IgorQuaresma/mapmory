import { migrateDesign, type Design, type ExportJob, type ExportOptions, type GeocodeResult, type InterpretResponse } from '@mapmory/design-schema';
import { ApiError, type ProblemDetails } from './errors';
import type {
  ApiClient,
  Catalog,
  CreateProjectRequest,
  InterpretRequest,
  ProjectSummary,
  ProjectWithDesign,
  Session,
  ShareLink,
  SharedPoster,
  ShareStatus,
  UploadedPhoto,
} from './types';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const MUTATING = new Set<Method>(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface HttpOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * HTTP implementation of the API contract. Mutating requests carry the CSRF token from `GET /session`
 * (refreshed once on `csrf_invalid`); cookies are same-origin only.
 */
export class HttpApi implements ApiClient {
  private csrfToken: string | null = null;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpOptions = {}) {
    this.base = opts.baseUrl ?? '';
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  private async request<T>(
    method: Method,
    path: string,
    {
      body,
      blob,
      headers = {},
      raw = false,
      retried = false,
    }: { body?: unknown; blob?: Blob; headers?: Record<string, string>; raw?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const h: Record<string, string> = { Accept: 'application/json', ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (blob) h['Content-Type'] = blob.type || 'application/octet-stream';
    if (MUTATING.has(method) && path.startsWith('/api/v1/')) {
      h['x-csrf-token'] = await this.ensureCsrf();
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: h,
        body: blob ?? (body === undefined ? undefined : JSON.stringify(body)),
        credentials: 'same-origin',
      });
    } catch {
      throw new ApiError({ status: 0, code: 'network_error', title: 'Network error' });
    }
    if (!res.ok) {
      const problem = await parseProblem(res);
      if (problem.code === 'csrf_invalid' && !retried) {
        this.csrfToken = null;
        return this.request<T>(method, path, { body, blob, headers, raw, retried: true });
      }
      throw new ApiError(problem);
    }
    if (raw) return (await res.blob()) as T;
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async ensureCsrf(): Promise<string> {
    if (!this.csrfToken) await this.getSession();
    return this.csrfToken!;
  }

  async getSession(): Promise<Session> {
    const s = await this.request<Session>('GET', '/api/v1/session');
    this.csrfToken = s.csrfToken;
    return s;
  }

  interpret(req: InterpretRequest) {
    return this.request<InterpretResponse>('POST', '/api/v1/interpretations', { body: req });
  }

  async geocode(q: string, lang: string, limit = 6) {
    const p = new URLSearchParams({ q, lang, limit: String(limit) });
    return (await this.request<{ results: GeocodeResult[] }>('GET', `/api/v1/geocode?${p}`)).results;
  }

  async reverseGeocode(lat: number, lng: number, lang: string) {
    const p = new URLSearchParams({ lat: String(lat), lng: String(lng), lang });
    return (await this.request<{ result: GeocodeResult | null }>('GET', `/api/v1/geocode/reverse?${p}`)).result;
  }

  catalog() {
    return this.request<Catalog>('GET', '/api/v1/catalog');
  }

  // Designs from the server are upgraded to this client's schema, so a rolling deploy (older API, newer web) keeps working.
  async createProject(req: CreateProjectRequest) {
    const r = await this.request<ProjectWithDesign>('POST', '/api/v1/projects', { body: req });
    return { ...r, design: migrateDesign(r.design) };
  }

  async listProjects() {
    return (await this.request<{ projects: ProjectSummary[] }>('GET', '/api/v1/projects')).projects;
  }

  async getProject(id: string) {
    const r = await this.request<ProjectWithDesign>('GET', `/api/v1/projects/${encodeURIComponent(id)}`);
    return { ...r, design: migrateDesign(r.design) };
  }

  saveDesign(id: string, design: Design, revision: number) {
    return this.request<{ revision: number }>('PUT', `/api/v1/projects/${encodeURIComponent(id)}/design`, {
      body: { design },
      headers: { 'If-Match': `"${revision}"` },
    });
  }

  async resetDesign(id: string) {
    const r = await this.request<{ design: Design; revision: number }>('POST', `/api/v1/projects/${encodeURIComponent(id)}/design/reset`);
    return { ...r, design: migrateDesign(r.design) };
  }

  deleteProject(id: string) {
    return this.request<void>('DELETE', `/api/v1/projects/${encodeURIComponent(id)}`);
  }

  async createExport(projectId: string, options: ExportOptions) {
    return (await this.request<{ export: ExportJob }>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/exports`, { body: options })).export;
  }

  async listExports(projectId: string) {
    return (await this.request<{ exports: ExportJob[] }>('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/exports`)).exports;
  }

  async getExport(id: string) {
    return (await this.request<{ export: ExportJob }>('GET', `/api/v1/exports/${encodeURIComponent(id)}`)).export;
  }

  downloadDataExport() {
    return this.request<Blob>('GET', '/api/v1/me/data-export', { raw: true });
  }

  deleteAccount() {
    return this.request<void>('DELETE', '/api/v1/me');
  }

  createShareLink(projectId: string) {
    return this.request<ShareLink>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/share`);
  }

  getShareStatus(projectId: string) {
    return this.request<ShareStatus>('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/share`);
  }

  revokeShareLink(projectId: string) {
    return this.request<void>('DELETE', `/api/v1/projects/${encodeURIComponent(projectId)}/share`);
  }

  async getShared(token: string) {
    const r = await this.request<SharedPoster>('GET', `/api/v1/shared/${encodeURIComponent(token)}`);
    return { ...r, design: migrateDesign(r.design) };
  }

  async uploadPhoto(projectId: string, file: File) {
    return (await this.request<{ photo: UploadedPhoto }>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/photos`, { blob: file })).photo;
  }

  deletePhoto(id: string) {
    return this.request<void>('DELETE', `/api/v1/photos/${encodeURIComponent(id)}`);
  }

  photoUrl(id: string) {
    return `${this.base}/api/v1/photos/${encodeURIComponent(id)}`;
  }

  sharedPhotoUrl(token: string, id: string) {
    return `${this.base}/api/v1/shared/${encodeURIComponent(token)}/photos/${encodeURIComponent(id)}`;
  }

  async signInMagicLink(email: string, callbackURL: string) {
    await this.request('POST', '/api/auth/sign-in/magic-link', { body: { email, callbackURL } });
  }

  async signOut() {
    await this.request('POST', '/api/auth/sign-out', { body: {} });
    this.csrfToken = null;
  }
}

async function parseProblem(res: Response): Promise<ProblemDetails> {
  try {
    const body = (await res.json()) as Partial<ProblemDetails>;
    return { ...body, status: res.status };
  } catch {
    return { status: res.status, title: res.statusText };
  }
}
