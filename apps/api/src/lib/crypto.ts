import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** AES-256-GCM: [12-byte IV | 16-byte tag | ciphertext]. Used for opt-in memory text (plan §8.4). */
export function encrypt(plaintext: string, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decrypt(blob: Buffer, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}

export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** IPs in audit events are stored as keyed hashes, never in clear (plan §8.4). */
export const hashIp = (secret: string, ip: string) => hmac(secret, `ip:${ip}`).slice(0, 32);
