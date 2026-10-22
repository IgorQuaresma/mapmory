import { describe, expect, it, vi } from 'vitest';
import { sampleDesign } from '../test/fixtures';
import { isApiError } from './errors';
import { HttpApi } from './http';

type Call = { url: string; init: RequestInit };

function server(handler: (url: string, init: RequestInit, calls: Call[]) => Response) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls);
  });
  return { api: new HttpApi({ fetchImpl: fetchImpl as unknown as typeof fetch }), calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const session = (token = 'tok-1') => json({ user: null, csrfToken: token, features: { llm: true, cmyk: false, altcha: false }, limits: { maxMemoryText: 1000 } });
const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);

describe('HttpApi', () => {
  it('fetches a CSRF token before the first mutating request and sends it', async () => {
    const { api, calls } = server((url) => (url.endsWith('/session') ? session() : json({ revision: 2 })));
    await api.saveDesign('p1', sampleDesign(), 1);
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/session', '/api/v1/projects/p1/design']);
    expect(header(calls[1]!, 'x-csrf-token')).toBe('tok-1');
    expect(header(calls[1]!, 'if-match')).toBe('"1"');
    expect(calls[1]!.init.method).toBe('PUT');
  });

  it('does not send CSRF tokens on GET requests', async () => {
    const { api, calls } = server(() => json({ projects: [] }));
    await api.listProjects();
    expect(header(calls[0]!, 'x-csrf-token')).toBeNull();
  });

  it('refreshes the CSRF token once on csrf_invalid', async () => {
    let n = 0;
    const { api, calls } = server((url) => {
      if (url.endsWith('/session')) return session(`tok-${++n}`);
      if (header(calls.at(-1)!, 'x-csrf-token') === 'tok-1') return json({ status: 403, code: 'csrf_invalid' }, 403);
      return new Response(null, { status: 204 });
    });
    await api.deleteProject('p1');
    const mutating = calls.filter((c) => c.init.method === 'DELETE');
    expect(mutating.map((c) => header(c, 'x-csrf-token'))).toEqual(['tok-1', 'tok-2']);
  });

  it('surfaces revision conflicts with the server revision and design', async () => {
    const design = sampleDesign();
    const { api } = server((url) =>
      url.endsWith('/session') ? session() : json({ type: 'about:blank', title: 'Conflict', status: 409, code: 'revision_conflict', revision: 5, design }, 409),
    );
    const err = await api.saveDesign('p1', design, 1).catch((e) => e);
    expect(isApiError(err, 'revision_conflict')).toBe(true);
    expect(err.body.revision).toBe(5);
    expect(err.body.design).toEqual(design);
  });

  it('maps problem+json codes and network failures to ApiError', async () => {
    const limited = server(() => json({ status: 429, code: 'rate_limited', title: 'Too Many Requests' }, 429));
    await expect(limited.api.geocode('paris', 'en')).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    const offline = new HttpApi({ fetchImpl: (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch });
    await expect(offline.catalog()).rejects.toMatchObject({ code: 'network_error' });
  });

  it('encodes ids and query parameters', async () => {
    const { api, calls } = server(() => json({ results: [] }));
    await api.geocode('Rue & Co', 'de', 3);
    expect(calls[0]!.url).toBe('/api/v1/geocode?q=Rue+%26+Co&lang=de&limit=3');
  });
});
