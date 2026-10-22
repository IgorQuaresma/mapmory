import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export function registerHealth(app: FastifyInstance, deps: AppDeps) {
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await deps.db.execute(sql`select 1`);
      await deps.redis.ping();
      return { status: 'ready' };
    } catch {
      reply.status(503);
      return { status: 'unavailable' };
    }
  });
}
