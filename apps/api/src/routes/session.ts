import { MAX_MEMORY_TEXT } from '@mapmory/design-schema';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ensureCsrfToken } from '../plugins/security';
import type { AppDeps } from '../app';

export const sessionRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  app.get('/session', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return {
      user: req.identity.user,
      csrfToken: ensureCsrfToken(req, reply, deps.config),
      features: {
        llm: deps.interpretation.llmEnabled,
        cmyk: deps.config.RENDER_CMYK_ENABLED,
        altcha: deps.config.ALTCHA_ENABLED,
      },
      limits: { maxMemoryText: MAX_MEMORY_TEXT },
    };
  });

  if (deps.altcha) {
    const altcha = deps.altcha;
    app.get('/altcha/challenge', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      return altcha.challengeHandler(req, reply);
    });
  }
};
