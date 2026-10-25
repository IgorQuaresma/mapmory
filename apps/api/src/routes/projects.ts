import { and, desc, eq, inArray } from 'drizzle-orm';
import { designRevisions, exportJobs, photos, projects } from '@mapmory/db';
import { CreateProjectRequestSchema, DesignSchema, migrateDesign, parseDesign, type Design } from '@mapmory/design-schema';
import { canonicalJson, generateDraft } from '@mapmory/poster-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { audit } from '../lib/audit';
import { encrypt, sha256 } from '../lib/crypto';
import { Problem, notFound } from '../lib/problem';
import { ensureAnonSession } from '../plugins/session';
import { ownedBy, ownedProject } from './ownership';

const IdParams = z.object({ id: z.uuid() });

export const contentHash = (design: Design) => sha256(canonicalJson(design));
const titleOf = (design: Design) =>
  (design.texts.find((t) => t.role === 'title')?.content.trim() || 'Untitled poster').slice(0, 120);

type ProjectRow = typeof projects.$inferSelect;
export const projectSummary = (p: ProjectRow) => ({
  id: p.id,
  title: p.title,
  currentRevision: p.currentRevision,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
  expiresAt: p.expiresAt?.toISOString() ?? null,
});

export const projectRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  const { db, config } = deps;

  app.post(
    '/projects',
    { schema: { body: CreateProjectRequestSchema }, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const design = generateDraft(req.body.draft);
      const user = req.identity.user;
      const anonId = user ? null : await ensureAnonSession(req, reply, { config, db });
      const memoryTextEnc =
        req.body.keepMemoryText && req.body.memoryText ? encrypt(req.body.memoryText, config.DATA_ENCRYPTION_KEY) : null;

      const project = await db.transaction(async (tx) => {
        const [p] = await tx
          .insert(projects)
          .values({
            ownerUserId: user?.id ?? null,
            ownerAnonId: anonId,
            title: titleOf(design),
            memoryTextEnc,
            interpretation: req.body.draft,
            currentRevision: 1,
            expiresAt: user ? null : new Date(Date.now() + config.ANON_RETENTION_DAYS * 86400_000),
          })
          .returning();
        await tx.insert(designRevisions).values({
          projectId: p!.id,
          revision: 1,
          schemaVersion: design.schemaVersion,
          document: design,
          contentHash: contentHash(design),
        });
        return p!;
      });
      await audit(db, config.APP_SECRET, { actor: user?.id ?? `anon:${anonId}`, action: 'project.created', target: project.id, ip: req.ip });
      reply.status(201).header('ETag', '"1"');
      return { project: projectSummary(project), design, revision: 1 };
    },
  );

  app.get('/projects', async (req) => {
    const rows = await db.select().from(projects).where(ownedBy(req)).orderBy(desc(projects.updatedAt)).limit(100);
    return { projects: rows.map(projectSummary) };
  });

  app.get('/projects/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const [p] = await db.select().from(projects).where(ownedProject(req, req.params.id));
    if (!p) throw notFound();
    const [rev] = await db
      .select()
      .from(designRevisions)
      .where(and(eq(designRevisions.projectId, p.id), eq(designRevisions.revision, p.currentRevision)));
    if (!rev) throw notFound();
    reply.header('ETag', `"${p.currentRevision}"`).header('Cache-Control', 'no-store');
    return { project: projectSummary(p), design: migrateDesign(rev.document), revision: p.currentRevision };
  });

  app.put(
    '/projects/:id/design',
    {
      schema: { params: IdParams, body: z.object({ design: DesignSchema }), headers: z.object({ 'if-match': z.string().regex(/^"?\d+"?$/) }) },
      // Designs with routes can reach 192 KB (MAX_DESIGN_BYTES); JSON overhead needs a little more.
      bodyLimit: 256 * 1024,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const expected = Number(req.headers['if-match'].replace(/"/g, ''));
      const design = parseDesign(req.body.design);
      const hash = contentHash(design);
      const result = await db.transaction(async (tx) => {
        const [p] = await tx.select().from(projects).where(ownedProject(req, req.params.id)).for('update');
        if (!p) throw notFound();
        if (p.currentRevision !== expected) {
          const [cur] = await tx
            .select()
            .from(designRevisions)
            .where(and(eq(designRevisions.projectId, p.id), eq(designRevisions.revision, p.currentRevision)));
          throw new Problem(409, 'revision_conflict', 'This design was changed elsewhere.', {
            revision: p.currentRevision,
            design: cur ? migrateDesign(cur.document) : null,
          });
        }
        const [cur] = await tx
          .select({ contentHash: designRevisions.contentHash })
          .from(designRevisions)
          .where(and(eq(designRevisions.projectId, p.id), eq(designRevisions.revision, p.currentRevision)));
        if (cur?.contentHash === hash) return p.currentRevision;
        const next = p.currentRevision + 1;
        await tx.insert(designRevisions).values({ projectId: p.id, revision: next, schemaVersion: design.schemaVersion, document: design, contentHash: hash });
        await tx.update(projects).set({ currentRevision: next, title: titleOf(design), updatedAt: new Date() }).where(eq(projects.id, p.id));
        return next;
      });
      reply.header('ETag', `"${result}"`);
      return { revision: result };
    },
  );

  app.post('/projects/:id/design/reset', { schema: { params: IdParams } }, async (req) => {
    return db.transaction(async (tx) => {
      const [p] = await tx.select().from(projects).where(ownedProject(req, req.params.id)).for('update');
      if (!p) throw notFound();
      const [first] = await tx
        .select()
        .from(designRevisions)
        .where(and(eq(designRevisions.projectId, p.id), eq(designRevisions.revision, 1)));
      if (!first) throw notFound();
      const design = migrateDesign(first.document);
      const next = p.currentRevision + 1;
      await tx.insert(designRevisions).values({ projectId: p.id, revision: next, schemaVersion: design.schemaVersion, document: design, contentHash: contentHash(design) });
      await tx.update(projects).set({ currentRevision: next, title: titleOf(design), updatedAt: new Date() }).where(eq(projects.id, p.id));
      return { design, revision: next };
    });
  });

  app.delete('/projects/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(ownedProject(req, req.params.id));
    if (!p) throw notFound();
    const keys = [
      ...(await db.select({ key: exportJobs.objectKey }).from(exportJobs).where(and(eq(exportJobs.projectId, p.id)))),
      ...(await db.select({ key: photos.objectKey }).from(photos).where(eq(photos.projectId, p.id))),
    ];
    await db.delete(projects).where(inArray(projects.id, [p.id]));
    const objectKeys = keys.map((k) => k.key).filter((k): k is string => !!k);
    if (objectKeys.length) await deps.store.deleteObjects(objectKeys).catch((err) => req.log.warn({ err }, 'object cleanup failed'));
    await audit(db, config.APP_SECRET, { actor: req.identity.user?.id ?? `anon:${req.identity.anonId}`, action: 'project.deleted', target: p.id, ip: req.ip });
    reply.status(204);
  });
};
