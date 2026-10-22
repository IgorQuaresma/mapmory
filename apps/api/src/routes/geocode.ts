import { GeocodeResultSchema } from '@mapmory/design-schema';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { GeocoderUnavailableError } from '../geocoding';
import { Problem } from '../lib/problem';

const lang = z.string().regex(/^[a-z]{2}$/).default('en');

export const geocodeRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  const unavailable = (err: unknown): never => {
    if (err instanceof GeocoderUnavailableError) throw new Problem(503, 'feature_unavailable', 'Place search is temporarily unavailable.');
    throw err;
  };

  app.get(
    '/geocode',
    {
      schema: {
        querystring: z.object({
          q: z.string().trim().min(2).max(200),
          lang,
          limit: z.coerce.number().int().min(1).max(10).default(5),
          near: z
            .string()
            .regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/)
            .optional(),
        }),
        response: { 200: z.object({ results: z.array(GeocodeResultSchema) }) },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const near = req.query.near?.split(',').map(Number) as [number, number] | undefined;
      const results = await deps.geocoder.search(req.query.q, { lang: req.query.lang, limit: req.query.limit, near }).catch(unavailable);
      reply.header('Cache-Control', 'private, max-age=300');
      return { results };
    },
  );

  app.get(
    '/geocode/reverse',
    {
      schema: {
        querystring: z.object({ lat: z.coerce.number().min(-85).max(85), lng: z.coerce.number().min(-180).max(180), lang }),
        response: { 200: z.object({ result: GeocodeResultSchema.nullable() }) },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => ({ result: await deps.geocoder.reverse([req.query.lng, req.query.lat], req.query.lang).catch(unavailable) }),
  );
};
