import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '@mapmory/db';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { buildApp } from '../../src/app';
import { createAuth } from '../../src/auth';
import { loadConfig } from '../../src/config';
import { createGeocoder } from '../../src/geocoding';
import { createInterpretationService } from '../../src/interpretation/service';
import { createAltcha } from '../../src/lib/altcha';
import type { ObjectStore } from '../../src/lib/s3';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_ORIGIN = 'http://localhost:5173';

export interface Harness {
  app: FastifyInstance;
  db: ReturnType<typeof createDb>['db'];
  redis: Redis;
  mails: { to: string; url: string }[];
  enqueued: string[];
  deletedObjects: string[];
  objects: Map<string, Buffer>;
  stop(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const [pg, rd]: [StartedPostgreSqlContainer, StartedRedisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: pg.getConnectionUri(),
    REDIS_URL: rd.getConnectionUrl(),
    APP_SECRET: 'test-app-secret-0123456789-0123456789-abcdef',
    BETTER_AUTH_SECRET: 'test-auth-secret-0123456789-0123456789-abcdef',
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    S3_ACCESS_KEY_ID: 'x',
    S3_SECRET_ACCESS_KEY: 'y',
    GEOCODER: 'stub',
    LLM_PROVIDER: 'heuristic',
    ALTCHA_ENABLED: 'true',
    ALTCHA_COST: '50',
    WEB_ORIGIN,
    API_PUBLIC_URL: WEB_ORIGIN,
    LOG_LEVEL: 'warn',
  });
  const { db, pool } = createDb(config.DATABASE_URL);
  await migrate(db, { migrationsFolder: path.resolve(here, '../../drizzle') });
  const redis = new Redis(config.REDIS_URL);
  const mails: Harness['mails'] = [];
  const enqueued: string[] = [];
  const deletedObjects: string[] = [];
  const objects = new Map<string, Buffer>();
  const store: ObjectStore = {
    signedDownloadUrl: async (key, filename) => `https://s3.test/${key}?filename=${encodeURIComponent(filename)}&sig=x`,
    putObject: async (key, body) => void objects.set(key, body),
    getObject: async (key) => (objects.has(key) ? Readable.from([objects.get(key)!]) : null),
    deleteObjects: async (keys) => {
      deletedObjects.push(...keys);
      for (const k of keys) objects.delete(k);
    },
    ensureBucket: async () => {},
  };
  const auth = createAuth(config, db, { sendMagicLink: async (to, url) => void mails.push({ to, url }), sendExportReady: async () => {} });
  const geocoder = createGeocoder(config, redis);
  const interpretation = createInterpretationService(config, { redis, geocoder, log: { warn: () => {} } });
  const altcha = createAltcha({ secret: config.APP_SECRET, cost: config.ALTCHA_COST, redis });
  const app = await buildApp({
    config, db, redis, auth, geocoder, interpretation, store, altcha,
    queues: { enqueue: async (_d, id) => void enqueued.push(id) },
  });
  await app.ready();
  return {
    app, db, redis, mails, enqueued, deletedObjects, objects,
    async stop() {
      await app.close();
      redis.disconnect();
      await pool.end();
      await Promise.all([pg.stop(), rd.stop()]);
    },
  };
}

/** A browser-like client: keeps cookies, sends Origin and the CSRF token. */
export class Client {
  private cookies = new Map<string, string>();
  csrf = '';
  constructor(private app: FastifyInstance, private origin = WEB_ORIGIN) {}

  private store(setCookie: string | string[] | undefined) {
    for (const c of ([] as string[]).concat(setCookie ?? [])) {
      const [pair, ...attrs] = c.split(';');
      const [name, ...rest] = pair!.split('=');
      const value = rest.join('=');
      const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value === '') this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value);
    }
  }

  cookie(name: string) {
    return this.cookies.get(name);
  }

  async request(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, raw?: Buffer) {
    const res = await this.app.inject({
      method: method as 'GET',
      url,
      headers: {
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(method !== 'GET' ? { origin: this.origin, 'x-csrf-token': this.csrf } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      payload: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    this.store(res.headers['set-cookie'] as string | string[] | undefined);
    return res;
  }

  async init() {
    const res = await this.request('GET', '/api/v1/session');
    this.csrf = res.json().csrfToken;
    return res.json();
  }
}
