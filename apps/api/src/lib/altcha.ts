import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { create, randomInt } from 'altcha-lib/frameworks/fastify';
import type { Redis } from 'ioredis';
import { hmac } from './crypto';

/**
 * Self-hosted proof-of-work bot protection (ALTCHA, MIT). Solutions are single-use: replay is blocked with an
 * atomic Redis SET NX (plan §3, §8.1).
 */
export function createAltcha(opts: { secret: string; cost: number; redis: Redis }) {
  const hmacSignatureSecret = hmac(opts.secret, 'altcha:signature');
  const hmacKeySignatureSecret = hmac(opts.secret, 'altcha:key');
  const store = {
    get: async (key: string) => (await opts.redis.get(`altcha:used:${key}`)) !== null,
    set: async (key: string) => void (await opts.redis.set(`altcha:used:${key}`, '1', 'EX', 3600)),
    setIfAbsent: async (key: string) => (await opts.redis.set(`altcha:used:${key}`, '1', 'EX', 3600, 'NX')) === 'OK',
  };
  const altcha = create({
    createChallengeParameters: () => ({
      algorithm: 'PBKDF2/SHA-256',
      cost: opts.cost,
      counter: randomInt(opts.cost, opts.cost * 2),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    }),
    deriveKey,
    hmacSignatureSecret,
    hmacKeySignatureSecret,
    store,
  });
  return {
    challengeHandler: altcha.challengeHandler,
    async verify(payload: string | undefined): Promise<boolean> {
      if (!payload) return false;
      const result = await altcha.verify(payload, deriveKey, hmacSignatureSecret, hmacKeySignatureSecret, store);
      return result.error === null && result.verification?.verified === true;
    },
  };
}
export type Altcha = ReturnType<typeof createAltcha>;
