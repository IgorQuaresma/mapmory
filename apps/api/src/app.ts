import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { Database } from '@mapmory/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Auth } from './auth';
import type { Config } from './config';
import type { Geocoder } from './geocoding';
import type { InterpretationService } from './interpretation/service';
import type { ExportQueues } from './jobs/queue';
import type { Altcha } from './lib/altcha';
import { Problem } from './lib/problem';
import type { ObjectStore } from './lib/s3';
import { registerErrorHandling } from './plugins/errors';
import { registerMetrics } from './plugins/metrics';
import { registerSecurity } from './plugins/security';
import { registerSessionResolution } from './plugins/session';
import { catalogRoutes } from './routes/catalog';
import { exportRoutes } from './routes/exports';
import { geocodeRoutes } from './routes/geocode';
import { registerHealth } from './routes/health';
import { interpretationRoutes } from './routes/interpretations';
import { meRoutes } from './routes/me';
import { projectRoutes } from './routes/projects';
import { sessionRoutes } from './routes/session';
import { photoRoutes } from './routes/photos';
import { shareRoutes } from './routes/share';

export interface AppDeps {
  config: Config;
  db: Database;
  redis: Redis;
  auth: Auth;
  geocoder: Geocoder;
  interpretation: InterpretationService;
  store: ObjectStore;
  queues: Pick<ExportQueues, 'enqueue'>;
  altcha: Altcha | null;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 100 * 1024,
    requestTimeout: 30_000,
    logger: {
      level: config.LOG_LEVEL,
      // Never log bodies, cookies, query strings (place searches) or tokens (plan §8.4).
      redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
      serializers: {
        req: (req) => ({ method: req.method, url: req.url.split('?')[0], reqId: req.id }),
      },
    },
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  await app.register(cookie, { secret: config.APP_SECRET, hook: 'onRequest' });
  await registerSecurity(app, config);
  await app.register(rateLimit, {
    global: false,
    redis: deps.redis,
    nameSpace: 'rl:',
    errorResponseBuilder: () => new Problem(429, 'rate_limited', 'Too many requests. Please slow down.'),
  });

  registerMetrics(app, config.METRICS_TOKEN);
  registerHealth(app, deps);

  // Better Auth handles /api/auth/* (magic links, sessions). Fastify's body is re-serialized for it.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
    async handler(req, reply) {
      const url = new URL(req.url, config.API_PUBLIC_URL);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.append(k, Array.isArray(v) ? v.join(', ') : String(v));
      const res = await deps.auth.handler(
        new Request(url, { method: req.method, headers, body: req.method === 'POST' && req.body ? JSON.stringify(req.body) : undefined }),
      );
      reply.status(res.status);
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(res.body ? Buffer.from(await res.arrayBuffer()) : null);
    },
  });

  registerSessionResolution(app, deps);
  await app.register(
    async (v1) => {
      await v1.register(sessionRoutes(deps));
      await v1.register(catalogRoutes(deps));
      await v1.register(interpretationRoutes(deps));
      await v1.register(geocodeRoutes(deps));
      await v1.register(projectRoutes(deps));
      await v1.register(exportRoutes(deps));
      await v1.register(meRoutes(deps));
      await v1.register(shareRoutes(deps));
      await v1.register(photoRoutes(deps));
    },
    { prefix: '/api/v1' },
  );
  return app;
}
