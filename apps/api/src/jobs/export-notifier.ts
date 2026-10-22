import { QueueEvents } from 'bullmq';
import { eq } from 'drizzle-orm';
import { exportJobs, user, type Database } from '@mapmory/db';
import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';
import type { Config } from '../config';
import type { Mailer } from '../lib/mailer';
import { EXPORT_QUEUES } from './queue';

/** Exports that take at least this long get an email, whatever their size. */
export const NOTIFY_AFTER_MS = 60_000;

export interface NotifierDeps {
  db: Database;
  redis: Redis;
  mailer: Pick<Mailer, 'sendExportReady'>;
  config: Pick<Config, 'WEB_ORIGIN'>;
  log: Pick<FastifyBaseLogger, 'warn'>;
}

/**
 * Emails the owner when a large-format (A2+) or slow export is done, so they don't have to keep the page open.
 * Runs in every API instance; a Redis lock per export makes sure only one email is sent. Returns whether it sent.
 */
export async function notifyExportReady(deps: NotifierDeps, exportId: string, queue: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ job: exportJobs, email: user.email })
    .from(exportJobs)
    .innerJoin(user, eq(user.id, exportJobs.requestedBy))
    .where(eq(exportJobs.id, exportId));
  if (!row || row.job.status !== 'done') return false;
  const took = row.job.startedAt && row.job.finishedAt ? row.job.finishedAt.getTime() - row.job.startedAt.getTime() : 0;
  if (queue !== EXPORT_QUEUES.large && took < NOTIFY_AFTER_MS) return false;
  const first = await deps.redis.set(`notify:export:${exportId}`, '1', 'EX', 86400, 'NX');
  if (first !== 'OK') return false;
  await deps.mailer.sendExportReady(row.email, `${deps.config.WEB_ORIGIN}/design/${row.job.projectId}/export`);
  return true;
}

export function startExportNotifier(deps: NotifierDeps & { redisUrl: string }) {
  const listeners = Object.values(EXPORT_QUEUES).map((queue) => {
    const events = new QueueEvents(queue, { connection: new Redis(deps.redisUrl, { maxRetriesPerRequest: null }) });
    events.on('completed', ({ jobId }) => {
      notifyExportReady(deps, jobId, queue).catch((err: Error) =>
        deps.log.warn({ err: { message: err.message } }, 'export-ready email failed'),
      );
    });
    return events;
  });
  return async () => {
    await Promise.all(listeners.map((l) => l.close()));
  };
}
