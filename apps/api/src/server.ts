import { createDb } from '@mapmory/db';
import { createAuth } from './auth';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createGeocoder } from './geocoding';
import { createInterpretationService } from './interpretation/service';
import { scheduleMaintenance } from './jobs/maintenance';
import { createExportQueues } from './jobs/queue';
import { createAltcha } from './lib/altcha';
import { createMailer } from './lib/mailer';
import { createRedis } from './lib/redis';
import { initErrorTracking } from './lib/error-tracking';
import { createObjectStore } from './lib/s3';

initErrorTracking('api');
const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL, { applicationName: 'mapmory-api' });
const redis = createRedis(config.REDIS_URL);
const store = createObjectStore(config);
const queues = createExportQueues(config.REDIS_URL);
const mailer = createMailer(config.SMTP_URL, config.MAIL_FROM);
const auth = createAuth(config, db, mailer);
const geocoder = createGeocoder(config, redis);
const altcha = config.ALTCHA_ENABLED ? createAltcha({ secret: config.APP_SECRET, cost: config.ALTCHA_COST, redis }) : null;

// The interpretation service logs through Fastify's logger, which exists once the app is built.
const log = { warn: (obj: object, msg?: string) => app.log.warn(obj, msg) };
const interpretation = createInterpretationService(config, { redis, geocoder, log });

const app = await buildApp({ config, db, redis, auth, geocoder, interpretation, store, queues, altcha });
if (config.S3_CREATE_BUCKET) await store.ensureBucket();
const stopMaintenance = config.ENABLE_MAINTENANCE ? await scheduleMaintenance({ db, store, config, log: app.log }) : null;

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await stopMaintenance?.();
  await queues.close();
  redis.disconnect();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
app.log.info({ llm: interpretation.llmEnabled, geocoder: geocoder.name }, 'Mapmory API ready');
