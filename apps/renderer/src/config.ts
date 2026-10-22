import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export interface RendererConfig {
  databaseUrl: string;
  redisUrl: string;
  /** Tile + glyph server as reachable from the renderer (private network). */
  tilesInternalUrl: string;
  s3: { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean };
  queues: string[];
  jobTimeoutMs: number;
  printPageDist: string;
  tmpDir: string;
  metricsPort: number;
  pdftoppm: string;
  ghostscript: string | null;
  cmykIccProfile: string | null;
  exportRetentionDays: number;
}

export function loadConfig(): RendererConfig {
  return {
    databaseUrl: required('RENDERER_DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    tilesInternalUrl: process.env.TILES_INTERNAL_URL ?? 'http://localhost:3010',
    s3: {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION ?? 'eu-central-1',
      bucket: required('S3_BUCKET'),
      accessKeyId: required('S3_ACCESS_KEY_ID'),
      secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
    queues: (process.env.RENDER_QUEUES ?? 'export-small,export-large').split(',').map((s) => s.trim()).filter(Boolean),
    jobTimeoutMs: Number(process.env.RENDER_JOB_TIMEOUT_MS ?? 5 * 60_000),
    printPageDist: process.env.PRINT_PAGE_DIST ?? path.resolve(here, '../../print-page/dist'),
    tmpDir: process.env.RENDER_TMP_DIR ?? path.resolve(here, '../.tmp'),
    metricsPort: Number(process.env.RENDERER_METRICS_PORT ?? 9464),
    pdftoppm: process.env.PDFTOPPM_PATH ?? 'pdftoppm',
    ghostscript: process.env.GHOSTSCRIPT_PATH || null,
    cmykIccProfile: process.env.CMYK_ICC_PROFILE || null,
    exportRetentionDays: Number(process.env.EXPORT_RETENTION_DAYS ?? 30),
  };
}
