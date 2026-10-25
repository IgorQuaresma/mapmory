import http from 'node:http';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Counter, Histogram, collectDefaultMetrics, register } from 'prom-client';
import { createDb, designRevisions, exportJobs, photos as photoTable, projects } from '@mapmory/db';
import { ExportOptionsSchema, migrateDesign, type ExportStatus } from '@mapmory/design-schema';
import { CmykUnavailableError } from './cmyk';
import { closeBrowser } from './compose';
import { loadConfig } from './config';
import { captureError, initErrorTracking } from './error-tracking';
import { BlockedRequestError } from './map-raster';
import { ExportTooLargeError, PhotoMissingError, runExportPipeline } from './pipeline';

initErrorTracking('renderer');
const config = loadConfig();
// Restricted role: reads frozen designs, updates job status only (apps/api/drizzle/0001_roles.sql).
const { db, pool } = createDb(config.databaseUrl, { max: 4, applicationName: 'mapmory-renderer' });
const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
});

collectDefaultMetrics({ prefix: 'mapmory_renderer_' });
const duration = new Histogram({
  name: 'mapmory_export_duration_seconds',
  help: 'End-to-end export duration',
  labelNames: ['queue', 'format', 'dpi'] as const,
  buckets: [1, 2, 5, 10, 20, 40, 60, 120, 300],
});
const failures = new Counter({
  name: 'mapmory_export_failures_total',
  help: 'Failed exports by error code',
  labelNames: ['code'] as const,
});

type Patch = Partial<
  Pick<
    typeof exportJobs.$inferInsert,
    | 'status'
    | 'progress'
    | 'errorCode'
    | 'objectKey'
    | 'bytes'
    | 'startedAt'
    | 'finishedAt'
    | 'expiresAt'
  >
>;
const update = (id: string, patch: Patch) =>
  db.update(exportJobs).set(patch).where(eq(exportJobs.id, id));

function errorCode(err: unknown): { code: string; retryable: boolean } {
  if (err instanceof ExportTooLargeError) return { code: 'too_large', retryable: false };
  if (err instanceof BlockedRequestError) return { code: 'blocked_request', retryable: false };
  if (err instanceof CmykUnavailableError) return { code: 'cmyk_unavailable', retryable: false };
  if ((err as Error)?.name === 'ZodError') return { code: 'invalid_design', retryable: false };
  if (err instanceof PhotoMissingError) return { code: 'photo_missing', retryable: false };
  if (/timed? ?out/i.test((err as Error)?.message ?? ''))
    return { code: 'render_timeout', retryable: true };
  return { code: 'render_failed', retryable: true };
}

/** Loads the design's photo files, only from the job's own project (a design cannot pull in other people's photos). */
async function loadPhotos(projectId: string, photoIds: string[]): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  if (photoIds.length === 0) return out;
  const rows = await db
    .select({ id: photoTable.id, objectKey: photoTable.objectKey })
    .from(photoTable)
    .where(and(eq(photoTable.projectId, projectId), inArray(photoTable.id, photoIds)));
  for (const r of rows) {
    const res = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: r.objectKey }));
    if (res.Body) out.set(r.id, Buffer.from(await res.Body.transformToByteArray()));
  }
  return out;
}

async function processJob(job: Job<{ exportId: string }>, queue: string) {
  const exportId = job.data.exportId;
  const [row] = await db
    .select({ job: exportJobs, document: designRevisions.document, title: projects.title })
    .from(exportJobs)
    .innerJoin(designRevisions, eq(designRevisions.id, exportJobs.revisionId))
    .innerJoin(projects, eq(projects.id, exportJobs.projectId))
    .where(eq(exportJobs.id, exportId));
  if (!row) throw new UnrecoverableError('Export job not found (deleted?)');
  if (row.job.status === 'done' || row.job.status === 'expired') return;

  let options: ReturnType<typeof ExportOptionsSchema.parse>;
  let design: ReturnType<typeof migrateDesign>;
  try {
    options = ExportOptionsSchema.parse(row.job.options);
    design = migrateDesign(row.document);
  } catch (err) {
    // A design this worker cannot read (e.g. a newer schema than its code) fails at once instead of sitting
    // "queued" until the stale-job sweep. Deploy workers with or before the API when the schema changes.
    failures.inc({ code: 'invalid_design' });
    await update(exportId, {
      status: 'failed',
      errorCode: 'invalid_design',
      finishedAt: new Date(),
    });
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'export failed',
        exportId,
        code: 'invalid_design',
        error: (err as Error).message,
      }),
    );
    throw new UnrecoverableError('invalid_design');
  }
  const end = duration.startTimer({ queue, format: options.format, dpi: String(options.dpi) });
  await update(exportId, {
    status: 'rendering',
    progress: 5,
    startedAt: new Date(),
    errorCode: null,
  });

  let lastStage: ExportStatus = 'rendering';
  // Photo loading is part of the watched promise, so a storage error fails the job like any render error.
  const run = loadPhotos(row.job.projectId, [...new Set(design.photos.map((p) => p.photoId))]).then(
    (photoFiles) =>
      runExportPipeline(
        design,
        options,
        {
          tilesUrl: config.tilesInternalUrl,
          printPageDist: config.printPageDist,
          tmpDir: config.tmpDir,
          pdftoppm: config.pdftoppm,
          ghostscript: config.ghostscript,
          cmykIccProfile: config.cmykIccProfile,
        },
        async (stage, progress) => {
          lastStage = stage;
          await update(exportId, { status: stage, progress });
          await job.updateProgress(progress);
        },
        photoFiles,
      ),
  );
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Export timed out during ${lastStage}`)),
      config.jobTimeoutMs,
    );
  });
  try {
    const result = await Promise.race([run, timeout]);
    const key = `exports/${exportId}/poster.${result.extension}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: result.body,
        ContentType: result.contentType,
        ...(process.env.S3_SSE ? { ServerSideEncryption: process.env.S3_SSE as 'AES256' } : {}),
      }),
    );
    await update(exportId, {
      status: 'done',
      progress: 100,
      objectKey: key,
      bytes: result.body.length,
      finishedAt: new Date(),
      expiresAt: new Date(Date.now() + config.exportRetentionDays * 86400_000),
    });
    end();
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'export done',
        exportId,
        queue,
        bytes: result.body.length,
        ...result.timings,
      }),
    );
  } catch (err) {
    const { code, retryable } = errorCode(err);
    failures.inc({ code });
    if (code === 'render_failed' || code === 'render_timeout') captureError(err, { code, queue });
    if (code === 'render_timeout') await closeBrowser().catch(() => {});
    const final = !retryable || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await update(
      exportId,
      final
        ? { status: 'failed', errorCode: code, finishedAt: new Date() }
        : { status: 'queued', progress: 0, errorCode: code },
    );
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'export failed',
        exportId,
        code,
        error: (err as Error).message,
      }),
    );
    throw retryable ? err : new UnrecoverableError(code);
  } finally {
    clearTimeout(timer);
  }
}

const workers = config.queues.map((queue) => {
  const w = new Worker<{ exportId: string }>(queue, (job) => processJob(job, queue), {
    connection,
    concurrency: 1,
    lockDuration: config.jobTimeoutMs + 60_000,
  });
  w.on('error', (err) =>
    console.error(
      JSON.stringify({ level: 'error', msg: 'worker error', queue, error: err.message }),
    ),
  );
  return w;
});

const metricsServer = http
  .createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } else if (req.url === '/healthz') {
      res.end('ok');
    } else {
      res.statusCode = 404;
      res.end();
    }
  })
  .listen(config.metricsPort, '0.0.0.0');

console.log(JSON.stringify({ level: 'info', msg: 'renderer ready', queues: config.queues }));

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await closeBrowser();
  metricsServer.close();
  connection.disconnect();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
