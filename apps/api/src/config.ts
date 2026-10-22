import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().default(4000),
  /** Public origin of the web app; used for CSRF origin checks, auth callbacks and links. */
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** Public base URL of the API as seen by browsers (usually the web origin behind the proxy). */
  API_PUBLIC_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: bool.default(false),

  DATABASE_URL: z.string().min(1),
  /** Owner role used only for migrations. */
  MIGRATION_DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6380'),

  /** ≥ 32 random bytes; signs cookies, CSRF tokens, ALTCHA challenges and IP hashes. */
  APP_SECRET: z.string().min(32),
  /** 32-byte key (base64) for AES-256-GCM encryption of opt-in memory text. */
  DATA_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'Must be 32 bytes, base64'),
  BETTER_AUTH_SECRET: z.string().min(32),

  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('Mapmory <no-reply@mapmory.local>'),

  S3_ENDPOINT: z.string().optional(),
  /** Endpoint browsers use for signed download URLs, when it differs from S3_ENDPOINT (private network). */
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('eu-central-1'),
  S3_BUCKET: z.string().default('mapmory-exports'),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_FORCE_PATH_STYLE: bool.default(false),
  S3_CREATE_BUCKET: bool.default(false),

  /** Public tile/glyph endpoints handed to browsers via /catalog. */
  TILES_PUBLIC_URL: z.url().default('http://localhost:3010'),

  GEOCODER: z.enum(['photon', 'nominatim', 'stub']).default('photon'),
  GEOCODER_URL: z.url().default('https://photon.komoot.io'),
  GEOCODER_USER_AGENT: z.string().default('Mapmory/0.1 (development; contact: dev@mapmory.local)'),
  /** Global minimum interval between upstream geocoder calls (public Nominatim requires 1 s). */
  GEOCODER_MIN_INTERVAL_MS: z.coerce.number().int().default(250),

  LLM_PROVIDER: z.enum(['anthropic', 'openai-compatible', 'heuristic']).default('heuristic'),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  /** Effort for the extraction call; the task is a short structured extraction. */
  ANTHROPIC_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  OPENAI_COMPAT_BASE_URL: z.string().default('http://localhost:11434/v1'),
  OPENAI_COMPAT_MODEL: z.string().default('qwen2:7b'),
  OPENAI_COMPAT_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().default(8000),
  /** Circuit breaker: maximum LLM calls per UTC day across all users (plan §8.1). */
  LLM_DAILY_CALL_BUDGET: z.coerce.number().int().default(2000),

  ALTCHA_ENABLED: bool.default(true),
  ALTCHA_COST: z.coerce.number().int().default(5000),

  RENDER_CMYK_ENABLED: bool.default(false),

  ANON_RETENTION_DAYS: z.coerce.number().int().default(30),
  EXPORT_RETENTION_DAYS: z.coerce.number().int().default(30),
  REVISIONS_KEPT: z.coerce.number().int().default(50),
  ENABLE_MAINTENANCE: bool.default(true),

  QUOTA_INTERPRET_PER_DAY: z.coerce.number().int().default(30),
  QUOTA_EXPORTS_PER_HOUR: z.coerce.number().int().default(5),
  QUOTA_EXPORTS_PER_DAY: z.coerce.number().int().default(20),

  METRICS_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === 'production') {
    if (config.WEB_ORIGIN.startsWith('http://')) throw new Error('WEB_ORIGIN must be https in production');
    if (config.GEOCODER === 'nominatim' && config.GEOCODER_URL.includes('nominatim.openstreetmap.org')) {
      throw new Error('The public Nominatim instance must not be used in production (usage policy)');
    }
  }
  return config;
}

export const isProd = (c: Config) => c.NODE_ENV === 'production';
