import { and, eq, gt, isNull } from 'drizzle-orm';
import { designRevisions, projects, shareLinks } from '@mapmory/db';
import { DesignSchema, migrateDesign } from '@mapmory/design-schema';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { randomToken, sha256 } from '../lib/crypto';
import { notFound } from '../lib/problem';
import { ownedProject } from './ownership';

const SHARE_DAYS = 30;
const TOKEN_RE = /^[\w-]{32}$/;

/** Read-only, expiring preview links (plan §12 v1). Viewers see a watermarked live preview, never a print file. */
export const shareRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  const { db, config } = deps;
  const IdParams = z.object({ id: z.uuid() });

  app.post('/projects/:id/share', { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(ownedProject(req, req.params.id));
    if (!p) throw notFound();
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + SHARE_DAYS * 86400_000);
    await db.transaction(async (tx) => {
      await tx.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.projectId, p.id), isNull(shareLinks.revokedAt)));
      await tx.insert(shareLinks).values({ projectId: p.id, tokenHash: sha256(token), expiresAt });
    });
    reply.status(201).header('Cache-Control', 'no-store');
    return { url: `${config.WEB_ORIGIN}/s/${token}`, expiresAt: expiresAt.toISOString() };
  });

  app.get('/projects/:id/share', { schema: { params: IdParams } }, async (req) => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(ownedProject(req, req.params.id));
    if (!p) throw notFound();
    const [link] = await db
      .select({ createdAt: shareLinks.createdAt, expiresAt: shareLinks.expiresAt })
      .from(shareLinks)
      .where(and(eq(shareLinks.projectId, p.id), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, new Date())))
      .limit(1);
    return { active: link ? { createdAt: link.createdAt.toISOString(), expiresAt: link.expiresAt.toISOString() } : null };
  });

  app.delete('/projects/:id/share', { schema: { params: IdParams } }, async (req, reply) => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(ownedProject(req, req.params.id));
    if (!p) throw notFound();
    await db.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.projectId, p.id), isNull(shareLinks.revokedAt)));
    reply.status(204);
  });

  app.get(
    '/shared/:token',
    {
      schema: { params: z.object({ token: z.string() }), response: { 200: z.object({ title: z.string(), design: DesignSchema, expiresAt: z.string() }) } },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');
      if (!TOKEN_RE.test(req.params.token)) throw notFound();
      const [row] = await db
        .select({ project: projects, expiresAt: shareLinks.expiresAt })
        .from(shareLinks)
        .innerJoin(projects, eq(projects.id, shareLinks.projectId))
        .where(and(eq(shareLinks.tokenHash, sha256(req.params.token)), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, new Date())));
      if (!row) throw notFound();
      const [rev] = await db
        .select({ document: designRevisions.document })
        .from(designRevisions)
        .where(and(eq(designRevisions.projectId, row.project.id), eq(designRevisions.revision, row.project.currentRevision)));
      if (!rev) throw notFound();
      return { title: row.project.title, design: migrateDesign(rev.document), expiresAt: row.expiresAt.toISOString() };
    },
  );
};
