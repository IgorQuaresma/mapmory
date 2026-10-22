import { and, eq, inArray } from 'drizzle-orm';
import { designRevisions, exportJobs, projects, user as users, verification } from '@mapmory/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppDeps } from '../app';
import { audit } from '../lib/audit';
import { decrypt, hmac } from '../lib/crypto';
import { requireUser } from '../plugins/session';

/** GDPR access and erasure (plan §8.4). */
export const meRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  const { db, config } = deps;

  app.get('/me/data-export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = requireUser(req);
    const [account] = await db.select().from(users).where(eq(users.id, me.id));
    const owned = await db.select().from(projects).where(eq(projects.ownerUserId, me.id));
    const ids = owned.map((p) => p.id);
    const revisions = ids.length
      ? await db.select().from(designRevisions).where(inArray(designRevisions.projectId, ids))
      : [];
    const jobs = await db.select().from(exportJobs).where(eq(exportJobs.requestedBy, me.id));
    const current = new Map(revisions.map((r) => [`${r.projectId}:${r.revision}`, r.document]));
    await audit(db, config.APP_SECRET, { actor: me.id, action: 'account.data_exported', ip: req.ip });
    reply
      .header('Content-Disposition', 'attachment; filename="mapmory-data-export.json"')
      .header('Cache-Control', 'no-store');
    return {
      exportedAt: new Date().toISOString(),
      account: { id: account!.id, email: account!.email, name: account!.name, emailVerified: account!.emailVerified, createdAt: account!.createdAt.toISOString() },
      projects: owned.map((p) => ({
        id: p.id,
        title: p.title,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        currentRevision: p.currentRevision,
        acceptedInterpretation: p.interpretation,
        memoryText: p.memoryTextEnc ? decrypt(p.memoryTextEnc, config.DATA_ENCRYPTION_KEY) : null,
        design: current.get(`${p.id}:${p.currentRevision}`) ?? null,
        revisionCount: revisions.filter((r) => r.projectId === p.id).length,
      })),
      exports: jobs.map((j) => ({ id: j.id, projectId: j.projectId, options: j.options, status: j.status, createdAt: j.createdAt.toISOString(), finishedAt: j.finishedAt?.toISOString() ?? null })),
    };
  });

  app.delete('/me', async (req, reply) => {
    const me = requireUser(req);
    const keys = (await db.select({ key: exportJobs.objectKey }).from(exportJobs).where(eq(exportJobs.requestedBy, me.id)))
      .map((k) => k.key)
      .filter((k): k is string => !!k);
    await db.transaction(async (tx) => {
      await tx.delete(verification).where(and(eq(verification.identifier, me.email)));
      // Sessions, accounts, projects, revisions and export jobs cascade from the user row.
      await tx.delete(users).where(eq(users.id, me.id));
    });
    if (keys.length) await deps.store.deleteObjects(keys).catch((err) => req.log.warn({ err }, 'export object cleanup failed'));
    await audit(db, config.APP_SECRET, { actor: `deleted:${hmac(config.APP_SECRET, me.id).slice(0, 16)}`, action: 'account.deleted', ip: req.ip });
    for (const name of Object.keys(req.cookies)) if (name.startsWith('mapmory') || name.startsWith('__Secure-mapmory')) reply.clearCookie(name, { path: '/' });
    reply.status(204);
  });
};
