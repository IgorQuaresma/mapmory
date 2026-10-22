import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { captureError } from '../lib/error-tracking';
import { Problem } from '../lib/problem';

/** Every error leaves as RFC 9457 problem+json with a stable `code` (docs/api.md). */
export function registerErrorHandling(app: FastifyInstance) {
  const send = (reply: import('fastify').FastifyReply, problem: Problem) =>
    reply.status(problem.status).type('application/problem+json').send(problem.toJSON());

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof Problem) return send(reply, err);
    if (hasZodFastifySchemaValidationErrors(err)) {
      return send(
        reply,
        new Problem(400, 'validation_failed', 'The request is invalid.', {
          issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        }),
      );
    }
    if (err instanceof ZodError) {
      return send(reply, new Problem(400, 'validation_failed', 'The request is invalid.', {
        issues: err.issues.map((i) => ({ path: `/${i.path.join('/')}`, message: i.message })),
      }));
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response serialization failed');
      return send(reply, new Problem(500, 'internal', 'Something went wrong.'));
    }
    if (err.statusCode === 429) return send(reply, new Problem(429, 'rate_limited', 'Too many requests. Please slow down.'));
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return send(reply, new Problem(413, 'payload_too_large', 'The request is too large.'));
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return send(reply, new Problem(err.statusCode, 'validation_failed', err.message));
    }
    req.log.error({ err }, 'unhandled error');
    captureError(err, { route: req.routeOptions.url ?? 'unknown' });
    return send(reply, new Problem(500, 'internal', 'Something went wrong.'));
  });

  app.setNotFoundHandler((_req, reply) => send(reply, new Problem(404, 'not_found', 'Not found')));
}
