import { randomUUID } from 'node:crypto';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { photos, projects, shareLinks } from '@mapmory/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { audit } from '../lib/audit';
import { sha256 } from '../lib/crypto';
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_PROJECT, PHOTO_CONTENT_TYPES, processPhoto } from '../lib/photos';
import { Problem, notFound } from '../lib/problem';
import { ownedBy, ownedProject } from './ownership';

const TOKEN_RE = /^[\w-]{32}$/;

/** Upload, serve and delete project photos (docs/api.md). Images are served same-origin, so CSP stays `img-src 'self'`. */
export const photoRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  const { db, config, store } = deps;

  // Raw image bodies, only in this plugin's scope; everything else keeps the 100 KB JSON limit.
  app.addContentTypeParser([...PHOTO_CONTENT_TYPES], { parseAs: 'buffer', bodyLimit: MAX_PHOTO_BYTES }, (_req, body, done) => done(null, body));

  const sendImage = async (reply: FastifyReply, key: string, cache: string) => {
    const body = await store.getObject(key);
    if (!body) throw notFound();
    reply
      .type('image/jpeg')
      .header('Cache-Control', cache)
      .header('Content-Disposition', 'inline')
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    return reply.send(body);
  };

  app.post(
    '/projects/:id/photos',
    {
      schema: { params: z.object({ id: z.uuid() }) },
      bodyLimit: MAX_PHOTO_BYTES,
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    },
    async (req, reply) => {
      const contentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType) || !Buffer.isBuffer(req.body)) {
        throw new Problem(415, 'unsupported_image', 'Please upload a JPEG, PNG or WebP image.');
      }
      const [p] = await db.select({ id: projects.id }).from(projects).where(ownedProject(req, req.params.id));
      if (!p) throw notFound();
      const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(photos).where(eq(photos.projectId, p.id));
      if (n >= MAX_PHOTOS_PER_PROJECT) {
        throw new Problem(409, 'photo_limit', `A poster can keep up to ${MAX_PHOTOS_PER_PROJECT} photos. Delete one first.`);
      }
      const processed = await processPhoto(req.body);
      const id = randomUUID();
      const objectKey = `photos/${p.id}/${id}.jpg`;
      await store.putObject(objectKey, processed.data, 'image/jpeg');
      await db.insert(photos).values({ id, projectId: p.id, objectKey, width: processed.width, height: processed.height, bytes: processed.data.length });
      await audit(db, config.APP_SECRET, { actor: req.identity.user?.id ?? `anon:${req.identity.anonId}`, action: 'photo.uploaded', target: id, ip: req.ip });
      reply.status(201);
      return { photo: { id, width: processed.width, height: processed.height, bytes: processed.data.length } };
    },
  );

  const ownedPhoto = async (req: Parameters<typeof ownedBy>[0], id: string) => {
    const [row] = await db
      .select({ id: photos.id, objectKey: photos.objectKey })
      .from(photos)
      .innerJoin(projects, eq(projects.id, photos.projectId))
      .where(and(eq(photos.id, id), ownedBy(req)));
    return row;
  };

  app.get('/photos/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) => {
    const row = await ownedPhoto(req, req.params.id);
    if (!row) throw notFound();
    return sendImage(reply, row.objectKey, 'private, max-age=86400');
  });

  app.delete('/photos/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) => {
    const row = await ownedPhoto(req, req.params.id);
    if (!row) throw notFound();
    await db.delete(photos).where(eq(photos.id, row.id));
    await store.deleteObjects([row.objectKey]).catch((err) => req.log.warn({ err }, 'photo object cleanup failed'));
    reply.status(204);
  });

  app.get(
    '/shared/:token/photos/:photoId',
    { schema: { params: z.object({ token: z.string(), photoId: z.uuid() }) }, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      reply.header('X-Robots-Tag', 'noindex, nofollow');
      if (!TOKEN_RE.test(req.params.token)) throw notFound();
      const [row] = await db
        .select({ objectKey: photos.objectKey })
        .from(shareLinks)
        .innerJoin(photos, eq(photos.projectId, shareLinks.projectId))
        .where(
          and(
            eq(shareLinks.tokenHash, sha256(req.params.token)),
            isNull(shareLinks.revokedAt),
            gt(shareLinks.expiresAt, new Date()),
            eq(photos.id, req.params.photoId),
          ),
        );
      if (!row) throw notFound();
      return sendImage(reply, row.objectKey, 'private, max-age=300');
    },
  );
};
