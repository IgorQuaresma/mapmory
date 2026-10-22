import { InterpretRequestSchema, InterpretResponseSchema } from '@mapmory/design-schema';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppDeps } from '../app';
import { Problem } from '../lib/problem';
import { enforceQuota } from '../lib/quota';
import { identityKey } from '../plugins/session';

export const interpretationRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  app.post(
    '/interpretations',
    {
      schema: { body: InterpretRequestSchema, response: { 200: InterpretResponseSchema } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      if (deps.altcha && !req.identity.user) {
        if (!req.body.altcha) throw new Problem(403, 'altcha_required', 'Please complete the verification.');
        if (!(await deps.altcha.verify(req.body.altcha))) throw new Problem(403, 'altcha_invalid', 'Verification failed. Please try again.');
      }
      await enforceQuota(deps.redis, 'interpret', identityKey(req), { perDay: deps.config.QUOTA_INTERPRET_PER_DAY });
      return deps.interpretation.interpret(req.body.text, req.body.locale);
    },
  );
};
