import type { FastifyInstance } from 'fastify';
import { Histogram, collectDefaultMetrics, register } from 'prom-client';
import { safeEqual } from '../lib/crypto';
import { Problem } from '../lib/problem';

collectDefaultMetrics({ prefix: 'mapmory_api_' });

const httpDuration = new Histogram({
  name: 'mapmory_http_request_duration_seconds',
  help: 'HTTP request duration by route',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** Prometheus metrics (plan §3). `/metrics` needs a bearer token when METRICS_TOKEN is set. */
export function registerMetrics(app: FastifyInstance, token?: string) {
  app.addHook('onResponse', async (req, reply) => {
    httpDuration.observe(
      { method: req.method, route: req.routeOptions.url ?? 'unknown', status: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    );
  });
  app.get('/metrics', async (req, reply) => {
    if (token) {
      const auth = req.headers.authorization ?? '';
      if (!safeEqual(auth, `Bearer ${token}`)) throw new Problem(401, 'auth_required');
    }
    reply.type(register.contentType);
    return register.metrics();
  });
}
