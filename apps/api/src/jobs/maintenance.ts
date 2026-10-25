import { Queue, Worker } from 'bullmq';
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { anonSessions, auditEvents, designRevisions, exportJobs, photos, projects, type Database } from '@mapmory/db';
import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';
import type { Config } from '../config';
import type { ObjectStore } from '../lib/s3';

/**
 * Retention (plan §8.4): expire export files, delete expired anonymous projects, trim revision history,
 * fail stale jobs, prune old audit events.
 */
export async function runMaintenance(deps: { db: Database; store: ObjectStore; config: Config; log: FastifyBaseLogger }) {
  const { db, store, config, log } = deps;
  const now = new Date();

  const expired = await db
    .select({ id: exportJobs.id, key: exportJobs.objectKey })
    .from(exportJobs)
    .where(and(eq(exportJobs.status, 'done'), lt(exportJobs.expiresAt, now)))
    .limit(1000);
  const keys = expired.map((e) => e.key).filter((k): k is string => !!k);
  if (keys.length) await store.deleteObjects(keys);
  if (expired.length) {
    await db.update(exportJobs).set({ status: 'expired', objectKey: null }).where(inArray(exportJobs.id, expired.map((e) => e.id)));
  }

  // Photos of expiring anonymous projects: delete the files before the rows cascade away.
  const anonPhotoKeys = (
    await db
      .select({ key: photos.objectKey })
      .from(photos)
      .innerJoin(projects, eq(projects.id, photos.projectId))
      .where(and(isNotNull(projects.ownerAnonId), lt(projects.expiresAt, now)))
  ).map((r) => r.key);
  if (anonPhotoKeys.length) await store.deleteObjects(anonPhotoKeys);
  const anonDeleted = await db
    .delete(projects)
    .where(and(isNotNull(projects.ownerAnonId), lt(projects.expiresAt, now)))
    .returning({ id: projects.id });
  await db.delete(anonSessions).where(lt(anonSessions.expiresAt, now));

  // Photos no longer used by the poster (removed in the editor) are deleted after a 24 h grace period, so undo can
  // still bring them back. Photos referenced by the current design or by an active export are kept.
  const unused = await db.execute<{ id: string; object_key: string }>(sql`
    SELECT ph.id, ph.object_key FROM ${photos} ph
    JOIN ${projects} p ON p.id = ph.project_id
    WHERE ph.created_at < ${new Date(now.getTime() - 86400_000)}
      AND NOT EXISTS (
        SELECT 1 FROM ${designRevisions} r
        WHERE r.project_id = ph.project_id AND r.revision = p.current_revision
          AND r.document->'photos' @> jsonb_build_array(jsonb_build_object('photoId', ph.id::text)))
      AND NOT EXISTS (
        SELECT 1 FROM ${exportJobs} e JOIN ${designRevisions} r ON r.id = e.revision_id
        WHERE e.status IN ('queued','rendering','composing','uploading')
          AND r.document->'photos' @> jsonb_build_array(jsonb_build_object('photoId', ph.id::text)))
    LIMIT 1000`);
  if (unused.rows.length) {
    await store.deleteObjects(unused.rows.map((r) => r.object_key));
    await db.delete(photos).where(inArray(photos.id, unused.rows.map((r) => r.id)));
  }

  // Keep revision 1 (the draft, used by "reset"), the last N revisions, and anything an export still references.
  const trimmed = await db.execute(sql`
    DELETE FROM ${designRevisions} r USING ${projects} p
    WHERE r.project_id = p.id
      AND r.revision <> 1
      AND r.revision <= p.current_revision - ${config.REVISIONS_KEPT}
      AND NOT EXISTS (SELECT 1 FROM ${exportJobs} e WHERE e.revision_id = r.id AND e.status <> 'expired')`);

  const stale = await db
    .update(exportJobs)
    .set({ status: 'failed', errorCode: 'stale', finishedAt: now })
    .where(and(inArray(exportJobs.status, ['queued', 'rendering', 'composing', 'uploading']), lt(exportJobs.createdAt, new Date(now.getTime() - 3600_000))))
    .returning({ id: exportJobs.id });

  await db.delete(auditEvents).where(lt(auditEvents.createdAt, new Date(now.getTime() - 365 * 86400_000)));

  log.info(
    { expiredExports: expired.length, unusedPhotosDeleted: unused.rows.length, anonProjectsDeleted: anonDeleted.length, revisionsTrimmed: trimmed.rowCount ?? 0, staleJobs: stale.length },
    'maintenance finished',
  );
}

/** Hourly repeatable job; BullMQ guarantees a single run across API instances. */
export async function scheduleMaintenance(deps: { db: Database; store: ObjectStore; config: Config; log: FastifyBaseLogger }) {
  const connection = new Redis(deps.config.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('maintenance', { connection });
  await queue.upsertJobScheduler('hourly', { every: 3600_000 }, { name: 'maintenance', opts: { removeOnComplete: 50, removeOnFail: 50 } });
  const worker = new Worker('maintenance', () => runMaintenance(deps), { connection, concurrency: 1 });
  worker.on('failed', (_job, err) => deps.log.error({ err }, 'maintenance failed'));
  return async () => {
    await worker.close();
    await queue.close();
    connection.disconnect();
  };
}
