import { fromNodeHeaders } from 'better-auth/node';
import { and, eq, isNotNull } from 'drizzle-orm';
import { anonSessions, projects, type Database } from '@mapmory/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth';
import { isProd, type Config } from '../config';
import { audit } from '../lib/audit';
import { Problem } from '../lib/problem';

export interface RequestIdentity {
  user: { id: string; email: string; name: string; emailVerified: boolean } | null;
  anonId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: RequestIdentity;
  }
}

export const ANON_COOKIE = 'mm_anon';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Resolves the signed-in user (Better Auth) or the anonymous session (signed HttpOnly cookie) for /api/v1.
 * On the first authenticated request, anonymous projects are merged into the account (docs/api.md).
 */
export function registerSessionResolution(app: FastifyInstance, deps: { config: Config; db: Database; auth: Auth }) {
  const { config, db, auth } = deps;
  app.decorateRequest('identity', null as unknown as RequestIdentity);

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/v1/')) return;
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
    const user = session?.user
      ? { id: session.user.id, email: session.user.email, name: session.user.name, emailVerified: session.user.emailVerified }
      : null;

    let anonId: string | null = null;
    const raw = req.cookies[ANON_COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value && UUID_RE.test(unsigned.value)) anonId = unsigned.value;
      else reply.clearCookie(ANON_COOKIE, { path: '/api' });
    }

    if (user && anonId) {
      await db.transaction(async (tx) => {
        await tx
          .update(projects)
          .set({ ownerUserId: user.id, ownerAnonId: null, expiresAt: null })
          .where(and(eq(projects.ownerAnonId, anonId!), isNotNull(projects.ownerAnonId)));
        await tx.delete(anonSessions).where(eq(anonSessions.id, anonId!));
      });
      reply.clearCookie(ANON_COOKIE, { path: '/api' });
      await audit(db, config.APP_SECRET, { actor: user.id, action: 'auth.signed_in', ip: req.ip });
      anonId = null;
    }
    req.identity = { user, anonId };
  });
}

/** Ensures an anonymous session exists for an anonymous visitor (created on first project). */
export async function ensureAnonSession(req: FastifyRequest, reply: FastifyReply, deps: { config: Config; db: Database }): Promise<string> {
  if (req.identity.anonId) {
    const [row] = await deps.db.select({ id: anonSessions.id }).from(anonSessions).where(eq(anonSessions.id, req.identity.anonId));
    if (row) return row.id;
  }
  const expiresAt = new Date(Date.now() + deps.config.ANON_RETENTION_DAYS * 86400_000);
  const [row] = await deps.db.insert(anonSessions).values({ expiresAt }).returning({ id: anonSessions.id });
  reply.setCookie(ANON_COOKIE, row!.id, {
    signed: true,
    httpOnly: true,
    secure: isProd(deps.config),
    sameSite: 'lax',
    path: '/api',
    maxAge: deps.config.ANON_RETENTION_DAYS * 86400,
  });
  req.identity.anonId = row!.id;
  return row!.id;
}

export function requireUser(req: FastifyRequest, opts: { verified?: boolean } = {}) {
  const user = req.identity.user;
  if (!user) throw new Problem(401, 'auth_required', 'Please sign in to continue.');
  if (opts.verified && !user.emailVerified) throw new Problem(403, 'email_unverified', 'Please confirm your email address first.');
  return user;
}

/** A stable identity key for quotas: user id, anonymous session or IP. */
export const identityKey = (req: FastifyRequest) =>
  req.identity.user ? `u:${req.identity.user.id}` : req.identity.anonId ? `a:${req.identity.anonId}` : `ip:${req.ip}`;
