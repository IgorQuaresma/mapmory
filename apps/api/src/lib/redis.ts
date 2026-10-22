import { Redis } from 'ioredis';

export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true, lazyConnect: false });
}

/** Fixed-window counter. Returns the count after increment. */
export async function incrWindow(redis: Redis, key: string, windowSeconds: number): Promise<number> {
  const results = await redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
  return Number(results?.[0]?.[1] ?? 0);
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
