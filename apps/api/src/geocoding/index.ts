import { GeocodeResultSchema, type GeocodeResult } from '@mapmory/design-schema';
import type { Redis } from 'ioredis';
import type { Config } from '../config';
import { sha256 } from '../lib/crypto';
import { createNominatimGeocoder } from './nominatim';
import { createPhotonGeocoder } from './photon';
import { createStubGeocoder } from './stub';
import { type Geocoder, GeocoderUnavailableError, type SearchOptions } from './types';

export * from './types';

const CACHE_TTL_S = 7 * 24 * 3600;

/**
 * Wraps a provider with a Redis cache, a global upstream throttle (OSM usage policies) and strict
 * validation of upstream results (plan §3, §8.1).
 */
export function createGeocoder(config: Config, redis: Redis): Geocoder {
  const inner =
    config.GEOCODER === 'stub'
      ? createStubGeocoder()
      : config.GEOCODER === 'nominatim'
        ? createNominatimGeocoder(config.GEOCODER_URL, config.GEOCODER_USER_AGENT)
        : createPhotonGeocoder(config.GEOCODER_URL, config.GEOCODER_USER_AGENT);

  const throttle = async () => {
    if (inner.name === 'stub') return;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const ok = await redis.set('geo:throttle', '1', 'PX', config.GEOCODER_MIN_INTERVAL_MS, 'NX');
      if (ok) return;
      await new Promise((r) => setTimeout(r, Math.min(100, config.GEOCODER_MIN_INTERVAL_MS)));
    }
    throw new GeocoderUnavailableError('Geocoder is busy');
  };

  const valid = (items: GeocodeResult[]) =>
    items.flatMap((r) => {
      const parsed = GeocodeResultSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });

  const cached = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
    await throttle();
    const value = await load();
    await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_S);
    return value;
  };

  return {
    name: inner.name,
    async search(query: string, options: SearchOptions) {
      const q = query.trim().replace(/\s+/g, ' ').toLowerCase();
      const key = `geo:v1:${inner.name}:s:${sha256(`${q}|${options.lang}|${options.limit}|${options.near?.join(',') ?? ''}`)}`;
      return cached(key, async () => valid(await inner.search(q, options)));
    },
    async reverse(lngLat, lang) {
      const rounded: [number, number] = [Number(lngLat[0].toFixed(5)), Number(lngLat[1].toFixed(5))];
      const key = `geo:v1:${inner.name}:r:${rounded.join(',')}:${lang}`;
      return cached(key, async () => {
        const r = await inner.reverse(rounded, lang);
        return r ? (valid([r])[0] ?? null) : null;
      });
    },
  };
}
