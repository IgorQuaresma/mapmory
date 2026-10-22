import { GeocoderUnavailableError } from './types';

/** Fetches JSON from a configured geocoder base URL only; the user supplies query parameters, never hosts. */
export async function fetchJson(base: string, path: string, params: Record<string, string>, userAgent: string): Promise<unknown> {
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
    });
  } catch (err) {
    throw new GeocoderUnavailableError(`Geocoder request failed: ${(err as Error).message}`);
  }
  if (!res.ok) throw new GeocoderUnavailableError(`Geocoder responded ${res.status}`);
  const text = await res.text();
  if (text.length > 2_000_000) throw new GeocoderUnavailableError('Geocoder response too large');
  return JSON.parse(text);
}
