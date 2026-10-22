import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { account, session, user, verification, type Database } from '@mapmory/db';
import { isProd, type Config } from './config';
import type { Mailer } from './lib/mailer';

/** Passwordless email magic links + cookie sessions (plan §3, §8.1). */
export function createAuth(config: Config, db: Database, mailer: Mailer) {
  return betterAuth({
    appName: 'Mapmory',
    baseURL: config.API_PUBLIC_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60,
    },
    advanced: {
      cookiePrefix: 'mapmory',
      useSecureCookies: isProd(config),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: config.TRUST_PROXY ? ['x-forwarded-for'] : [] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: { '/sign-in/magic-link': { window: 600, max: 5 } },
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          await mailer.sendMagicLink(email, url);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
