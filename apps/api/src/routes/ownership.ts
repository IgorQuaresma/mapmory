import { and, eq, sql, type SQL } from 'drizzle-orm';
import { projects } from '@mapmory/db';
import type { FastifyRequest } from 'fastify';

/** Every project query is scoped to the caller; ids are not treated as secrets (plan §8.1, IDOR). */
export function ownedBy(req: FastifyRequest): SQL {
  const { user, anonId } = req.identity;
  if (user) return eq(projects.ownerUserId, user.id);
  if (anonId) return eq(projects.ownerAnonId, anonId);
  return sql`false`;
}

export const ownedProject = (req: FastifyRequest, id: string) => and(eq(projects.id, id), ownedBy(req))!;
