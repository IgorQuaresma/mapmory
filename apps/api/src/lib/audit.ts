import { auditEvents, type Database } from '@mapmory/db';
import { hashIp } from './crypto';

export type AuditAction =
  | 'auth.sign_in_requested'
  | 'auth.signed_in'
  | 'project.created'
  | 'project.deleted'
  | 'photo.uploaded'
  | 'export.requested'
  | 'account.data_exported'
  | 'account.deleted';

/** Records security-relevant events without content (plan §4.2). Failures never break the request. */
export async function audit(
  db: Database,
  secret: string,
  event: { actor: string; action: AuditAction; target?: string; ip?: string },
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actor: event.actor,
      action: event.action,
      target: event.target ?? null,
      ipHash: event.ip ? hashIp(secret, event.ip) : null,
    });
  } catch {
    /* audit is best-effort */
  }
}
