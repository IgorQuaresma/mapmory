import type {
  CreateProjectRequestSchema,
  Design,
  ExportJob,
  ExportOptions,
  GeocodeResult,
  InterpretResponse,
  PaperSize,
} from '@mapmory/design-schema';
import type { Theme } from '@mapmory/themes';
import type { z } from 'zod';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface Session {
  user: SessionUser | null;
  csrfToken: string;
  features: { llm: boolean; cmyk: boolean; altcha: boolean };
  limits: { maxMemoryText: number };
}

export interface ProjectSummary {
  id: string;
  title: string;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface ProjectWithDesign {
  project: ProjectSummary;
  design: Design;
  revision: number;
}

export interface Catalog {
  themes: Theme[];
  fonts: { id: string; family: string; weights: { min: number; max: number }; category: string }[];
  papers: PaperSize[];
  markerIcons: string[];
  mapShapes: string[];
  frameStyles: string[];
  labelLanguages: string[];
  exportFormats: string[];
  dpis: number[];
  bleeds: number[];
  tiles: { tilesUrl: string; glyphsUrl: string; maxzoom: number };
  maxRenderPx: number;
}

export type CreateProjectRequest = z.input<typeof CreateProjectRequestSchema>;

/** An uploaded, server-re-encoded photo (docs/api.md). */
export interface UploadedPhoto {
  id: string;
  width: number;
  height: number;
  bytes: number;
}

/** Image types the API accepts; anything else is rejected with `unsupported_image`. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS_PER_PROJECT = 12;

export interface ShareLink {
  url: string;
  expiresAt: string;
}

export interface ShareStatus {
  active: { createdAt: string; expiresAt: string } | null;
}

export interface SharedPoster {
  title: string;
  design: Design;
  expiresAt: string;
}

export interface InterpretRequest {
  text: string;
  locale: string;
  altcha?: string;
}

/** The whole backend surface the web app uses (docs/api.md). Implemented by HTTP and by the mock. */
export interface ApiClient {
  getSession(): Promise<Session>;
  interpret(req: InterpretRequest): Promise<InterpretResponse>;
  geocode(q: string, lang: string, limit?: number): Promise<GeocodeResult[]>;
  reverseGeocode(lat: number, lng: number, lang: string): Promise<GeocodeResult | null>;
  catalog(): Promise<Catalog>;
  createProject(req: CreateProjectRequest): Promise<ProjectWithDesign>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ProjectWithDesign>;
  /** Throws `ApiError` with code `revision_conflict` (and `body.revision` / `body.design`) on 409. */
  saveDesign(id: string, design: Design, revision: number): Promise<{ revision: number }>;
  resetDesign(id: string): Promise<{ design: Design; revision: number }>;
  deleteProject(id: string): Promise<void>;
  createExport(projectId: string, options: ExportOptions): Promise<ExportJob>;
  listExports(projectId: string): Promise<ExportJob[]>;
  getExport(id: string): Promise<ExportJob>;
  downloadDataExport(): Promise<Blob>;
  deleteAccount(): Promise<void>;
  /** Creates a read-only preview link (revokes the previous one). The URL is only returned once. */
  createShareLink(projectId: string): Promise<ShareLink>;
  getShareStatus(projectId: string): Promise<ShareStatus>;
  revokeShareLink(projectId: string): Promise<void>;
  /** Public: the design behind a preview link; `not_found` when expired or revoked. */
  getShared(token: string): Promise<SharedPoster>;
  /** Uploads an image as the raw request body; the server strips metadata and re-encodes it. */
  uploadPhoto(projectId: string, file: File): Promise<UploadedPhoto>;
  deletePhoto(id: string): Promise<void>;
  /** `<img src>` for a photo of the signed-in owner's project. */
  photoUrl(id: string): string;
  /** `<img src>` for a photo behind a share link. */
  sharedPhotoUrl(token: string, id: string): string;
  signInMagicLink(email: string, callbackURL: string): Promise<void>;
  signOut(): Promise<void>;
}
