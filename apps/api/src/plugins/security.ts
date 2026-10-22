import helmet from '@fastify/helmet';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isProd, type Config } from '../config';
import { randomToken, safeEqual } from '../lib/crypto';
import { Problem } from '../lib/problem';

export const csrfCookieName = (config: Config) => (isProd(config) ? '__Host-mm_csrf' : 'mm_csrf');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Security headers for API responses and CSRF protection for /api/v1 (plan §8.1, §8.2):
 * the request Origin must be the web origin, and `x-csrf-token` must match the HttpOnly CSRF cookie.
 */
export async function registerSecurity(app: FastifyInstance, config: Config) {
  await app.register(helmet, {
    // API responses are JSON; the web app's CSP is served by the reverse proxy with the static files.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProd(config) ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  });

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (!req.url.startsWith('/api/v1/') || SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (origin !== config.WEB_ORIGIN) throw new Problem(403, 'csrf_invalid', 'Cross-origin request rejected.');
    const header = req.headers['x-csrf-token'];
    const cookie = req.cookies[csrfCookieName(config)];
    if (typeof header !== 'string' || !cookie || !safeEqual(header, cookie)) {
      throw new Problem(403, 'csrf_invalid', 'Missing or invalid CSRF token. Reload the page and try again.');
    }
  });
}

/** Returns the CSRF token for this browser, issuing the cookie if needed. */
export function ensureCsrfToken(req: FastifyRequest, reply: import('fastify').FastifyReply, config: Config): string {
  const name = csrfCookieName(config);
  const existing = req.cookies[name];
  if (existing && /^[\w-]{43}$/.test(existing)) return existing;
  const token = randomToken(32);
  reply.setCookie(name, token, { httpOnly: true, secure: isProd(config), sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return token;
}
