import type { Redis } from 'ioredis';
import { Problem } from './problem';
import { incrWindow, utcDay } from './redis';

/** Daily and hourly quotas per identity, enforced in Redis (plan §8.1). */
export async function enforceQuota(
  redis: Redis,
  scope: string,
  identity: string,
  limits: { perHour?: number; perDay?: number },
): Promise<void> {
  if (limits.perHour !== undefined) {
    const hour = new Date().toISOString().slice(0, 13);
    const n = await incrWindow(redis, `quota:${scope}:h:${hour}:${identity}`, 3600);
    if (n > limits.perHour) throw new Problem(429, 'quota_exceeded', 'Hourly limit reached. Please try again later.');
  }
  if (limits.perDay !== undefined) {
    const n = await incrWindow(redis, `quota:${scope}:d:${utcDay()}:${identity}`, 86400);
    if (n > limits.perDay) throw new Problem(429, 'quota_exceeded', 'Daily limit reached. Please try again tomorrow.');
  }
}
