import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { designRevisions, exportJobs, projects } from '@mapmory/db';
import { ExportJobSchema, ExportOptionsSchema, migrateDesign, type ExportJob } from '@mapmory/design-schema';
import { canonicalJson, exportGeometry } from '@mapmory/poster-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { audit } from '../lib/audit';
import { sha256 } from '../lib/crypto';
import { Problem, notFound } from '../lib/problem';
import { enforceQuota } from '../lib/quota';
import { requireUser } from '../plugins/session';

const ACTIVE = ['queued', 'rendering', 'composing', 'uploading'] as const;
const CONTENT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', tiff: 'image/tiff' } as const;
const EXTENSIONS = { pdf: 'pdf', png: 'png', jpeg: 'jpg', tiff: 'tif' } as const;

type JobRow = typeof exportJobs.$inferSelect;

const slug = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'poster';

export const exportRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  const { db, config } = deps;

  const present = async (job: JobRow, title: string): Promise<ExportJob> => {
    const expired = job.status === 'expired' || (job.status === 'done' && job.expiresAt !== null && job.expiresAt < new Date());
    const status = expired ? 'expired' : job.status;
    const downloadUrl =
      status === 'done' && job.objectKey
        ? await deps.store.signedDownloadUrl(job.objectKey, `mapmory-${slug(title)}.${EXTENSIONS[job.options.format]}`, CONTENT_TYPES[job.options.format])
        : null;
    return {
      id: job.id,
      status,
      progress: job.progress,
      options: job.options,
      errorCode: job.errorCode,
      bytes: job.bytes,
      downloadUrl,
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
      expiresAt: job.expiresAt?.toISOString() ?? null,
    };
  };

  app.post(
    '/projects/:id/exports',
    { schema: { params: z.object({ id: z.uuid() }), body: ExportOptionsSchema, response: { 202: z.object({ export: ExportJobSchema }) } } },
    async (req, reply) => {
      const user = requireUser(req, { verified: true });
      const options = req.body;
      if (options.colorProfile !== 'srgb' && !config.RENDER_CMYK_ENABLED) {
        throw new Problem(422, 'feature_unavailable', 'CMYK output is not available yet.');
      }
      const [p] = await db.select().from(projects).where(and(eq(projects.id, req.params.id), eq(projects.ownerUserId, user.id)));
      if (!p) throw notFound();
      const [rev] = await db
        .select()
        .from(designRevisions)
        .where(and(eq(designRevisions.projectId, p.id), eq(designRevisions.revision, p.currentRevision)));
      if (!rev) throw notFound();
      const design = migrateDesign(rev.document);
      if (exportGeometry(design, options).exceedsLimit) {
        throw new Problem(422, 'export_too_large', 'This size and resolution is too large. Choose a lower DPI.');
      }
      const optionsHash = sha256(canonicalJson(options));

      // Identical finished export → reuse it without spending quota (plan §11).
      const [existing] = await db
        .select()
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.requestedBy, user.id),
            eq(exportJobs.contentHash, rev.contentHash),
            eq(exportJobs.optionsHash, optionsHash),
            eq(exportJobs.status, 'done'),
            gt(exportJobs.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (existing) {
        reply.status(202);
        return { export: await present(existing, p.title) };
      }

      const [active] = await db
        .select({ id: exportJobs.id })
        .from(exportJobs)
        .where(and(eq(exportJobs.requestedBy, user.id), inArray(exportJobs.status, [...ACTIVE]), gt(exportJobs.createdAt, new Date(Date.now() - 15 * 60_000))))
        .limit(1);
      if (active) throw new Problem(409, 'export_in_progress', 'Another export is still running. Please wait for it to finish.', { exportId: active.id });

      await enforceQuota(deps.redis, 'export', user.id, { perHour: config.QUOTA_EXPORTS_PER_HOUR, perDay: config.QUOTA_EXPORTS_PER_DAY });

      const [job] = await db
        .insert(exportJobs)
        .values({ projectId: p.id, revisionId: rev.id, requestedBy: user.id, options, optionsHash, contentHash: rev.contentHash })
        .returning();
      await deps.queues.enqueue(design, job!.id);
      await audit(db, config.APP_SECRET, { actor: user.id, action: 'export.requested', target: job!.id, ip: req.ip });
      reply.status(202);
      return { export: await present(job!, p.title) };
    },
  );

  app.get('/exports/:id', { schema: { params: z.object({ id: z.uuid() }), response: { 200: z.object({ export: ExportJobSchema }) } } }, async (req, reply) => {
    const user = requireUser(req);
    const [row] = await db
      .select({ job: exportJobs, title: projects.title })
      .from(exportJobs)
      .innerJoin(projects, eq(projects.id, exportJobs.projectId))
      .where(and(eq(exportJobs.id, req.params.id), eq(exportJobs.requestedBy, user.id)));
    if (!row) throw notFound();
    reply.header('Cache-Control', 'no-store');
    return { export: await present(row.job, row.title) };
  });

  app.get('/projects/:id/exports', { schema: { params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const [p] = await db.select().from(projects).where(and(eq(projects.id, req.params.id), eq(projects.ownerUserId, user.id)));
    if (!p) throw notFound();
    const jobs = await db
      .select()
      .from(exportJobs)
      .where(and(eq(exportJobs.projectId, p.id), eq(exportJobs.requestedBy, user.id)))
      .orderBy(desc(exportJobs.createdAt))
      .limit(50);
    return { exports: await Promise.all(jobs.map((j) => present(j, p.title))) };
  });
};
