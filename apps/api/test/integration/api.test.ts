import { eq } from 'drizzle-orm';
import { createChallenge, solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportJobs, projects } from '@mapmory/db';
import type { Design, DraftInput } from '@mapmory/design-schema';
import { notifyExportReady } from '../../src/jobs/export-notifier';
import { runMaintenance } from '../../src/jobs/maintenance';
import { Client, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.stop();
});

const draft: DraftInput = {
  places: [{ id: 'W1', name: 'Pont des Arts', label: 'Pont des Arts, Paris, France', lngLat: [2.33753, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France' }],
  title: 'Where it all began',
  subtitle: null,
  date: { iso: '2019-06-14', precision: 'day' },
  mood: 'romantic',
  locale: 'en',
};

async function solveAltcha(client: Client): Promise<string> {
  const challenge = (await client.request('GET', '/api/v1/altcha/challenge')).json();
  const solution = await solveChallenge({ challenge, deriveKey });
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
}

async function signIn(client: Client, email: string) {
  const res = await client.request('POST', '/api/auth/sign-in/magic-link', { email, callbackURL: 'http://localhost:5173/account' });
  expect(res.statusCode).toBe(200);
  const mail = h.mails.findLast((m) => m.to === email)!;
  const verify = new URL(mail.url);
  const v = await client.request('GET', `${verify.pathname}${verify.search}`);
  expect([200, 302]).toContain(v.statusCode);
  await client.init();
}

describe('session and CSRF', () => {
  it('issues a CSRF token and rejects mutations without it', async () => {
    const c = new Client(h.app);
    const s = await c.init();
    expect(s.user).toBeNull();
    expect(s.features).toEqual({ llm: false, cmyk: false, altcha: true });
    c.csrf = 'wrong';
    const res = await c.request('POST', '/api/v1/projects', { draft });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('csrf_invalid');
  });

  it('rejects other origins even with a valid token', async () => {
    const c = new Client(h.app, 'https://evil.example');
    await c.init();
    const res = await c.request('POST', '/api/v1/projects', { draft });
    expect(res.json().code).toBe('csrf_invalid');
  });

  it('sets security headers', async () => {
    const res = await new Client(h.app).request('GET', '/api/v1/session');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('interpretation', () => {
  it('requires ALTCHA for anonymous users and blocks replays', async () => {
    const c = new Client(h.app);
    await c.init();
    const text = 'The night we got engaged on the Pont des Arts in Paris, 14 June 2019';
    expect((await c.request('POST', '/api/v1/interpretations', { text, locale: 'en' })).json().code).toBe('altcha_required');
    const altcha = await solveAltcha(c);
    const ok = await c.request('POST', '/api/v1/interpretations', { text, locale: 'en', altcha });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.fallback).toBe(true);
    expect(body.interpretation.mood).toBe('romantic');
    expect(body.places[0].candidates[0].name).toBe('Pont des Arts');
    expect((await c.request('POST', '/api/v1/interpretations', { text, locale: 'en', altcha })).json().code).toBe('altcha_invalid');
  });

  it('rejects forged ALTCHA payloads', async () => {
    const c = new Client(h.app);
    await c.init();
    const challenge = await createChallenge({ algorithm: 'PBKDF2/SHA-256', cost: 50, deriveKey, hmacSignatureSecret: 'not-our-secret' });
    const solution = await solveChallenge({ challenge, deriveKey });
    const altcha = Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
    const res = await c.request('POST', '/api/v1/interpretations', { text: 'a memory in Paris', locale: 'en', altcha });
    expect(res.json().code).toBe('altcha_invalid');
  });

  it('validates input', async () => {
    const c = new Client(h.app);
    await c.init();
    const res = await c.request('POST', '/api/v1/interpretations', { text: 'x'.repeat(1001), locale: 'en' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation_failed');
  });
});

describe('geocode', () => {
  it('searches and reverse-geocodes', async () => {
    const c = new Client(h.app);
    const res = await c.request('GET', '/api/v1/geocode?q=Brooklyn%20Bridge&lang=en');
    expect(res.json().results[0].name).toBe('Brooklyn Bridge');
    const rev = await c.request('GET', '/api/v1/geocode/reverse?lat=48.8583&lng=2.2945&lang=en');
    expect(rev.json().result.lngLat).toEqual([2.2945, 48.8583]);
    expect((await c.request('GET', '/api/v1/geocode?q=a')).statusCode).toBe(400);
  });
});

describe('projects, designs and exports', () => {
  const owner = new Client({} as never);
  let projectId = '';
  let design: Design;

  it('creates an anonymous project from a draft', async () => {
    Object.assign(owner, new Client(h.app));
    await owner.init();
    const res = await owner.request('POST', '/api/v1/projects', { draft });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    projectId = body.project.id;
    design = body.design;
    expect(body.revision).toBe(1);
    expect(body.project.expiresAt).not.toBeNull();
    expect(owner.cookie('mm_anon')).toBeTruthy();
  });

  it('hides projects from other visitors (IDOR)', async () => {
    const other = new Client(h.app);
    await other.init();
    expect((await other.request('GET', `/api/v1/projects/${projectId}`)).statusCode).toBe(404);
    expect((await other.request('DELETE', `/api/v1/projects/${projectId}`)).statusCode).toBe(404);
    expect((await other.request('GET', '/api/v1/projects')).json().projects).toEqual([]);
  });

  it('saves with optimistic concurrency', async () => {
    const edited = { ...design, map: { ...design.map, palette: { ...design.map.palette, roads: '#FF0000' } } };
    const ok = await owner.request('PUT', `/api/v1/projects/${projectId}/design`, { design: edited }, { 'if-match': '"1"' });
    expect(ok.json()).toEqual({ revision: 2 });
    const same = await owner.request('PUT', `/api/v1/projects/${projectId}/design`, { design: edited }, { 'if-match': '"2"' });
    expect(same.json()).toEqual({ revision: 2 });
    const conflict = await owner.request('PUT', `/api/v1/projects/${projectId}/design`, { design }, { 'if-match': '"1"' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe('revision_conflict');
    expect(conflict.json().revision).toBe(2);
    expect(conflict.json().design.map.palette.roads).toBe('#FF0000');
  });

  it('rejects invalid designs', async () => {
    const bad = { ...design, map: { ...design.map, themeId: 'https://evil.example/style.json' } };
    const res = await owner.request('PUT', `/api/v1/projects/${projectId}/design`, { design: bad }, { 'if-match': '"2"' });
    expect(res.statusCode).toBe(400);
  });

  it('resets to the draft as a new revision', async () => {
    const res = await owner.request('POST', `/api/v1/projects/${projectId}/design/reset`);
    expect(res.json().revision).toBe(3);
    expect(res.json().design).toEqual(design);
  });

  it('shares a read-only preview link that can be revoked', async () => {
    const created = await owner.request('POST', `/api/v1/projects/${projectId}/share`);
    expect(created.statusCode).toBe(201);
    const { url } = created.json();
    const token = url.split('/s/')[1];
    const viewer = new Client(h.app);
    const shared = await viewer.request('GET', `/api/v1/shared/${token}`);
    expect(shared.statusCode).toBe(200);
    expect(shared.json().design.texts[0].content).toBe('Where it all began');
    expect(shared.headers['x-robots-tag']).toContain('noindex');
    expect((await owner.request('GET', `/api/v1/projects/${projectId}/share`)).json().active).not.toBeNull();
    // Strangers cannot manage the link, and a new link revokes the previous one.
    await viewer.init();
    expect((await viewer.request('DELETE', `/api/v1/projects/${projectId}/share`)).statusCode).toBe(404);
    const second = (await owner.request('POST', `/api/v1/projects/${projectId}/share`)).json().url.split('/s/')[1];
    expect((await viewer.request('GET', `/api/v1/shared/${token}`)).statusCode).toBe(404);
    expect((await owner.request('DELETE', `/api/v1/projects/${projectId}/share`)).statusCode).toBe(204);
    expect((await viewer.request('GET', `/api/v1/shared/${second}`)).statusCode).toBe(404);
    expect((await viewer.request('GET', '/api/v1/shared/not-a-token')).statusCode).toBe(404);
  });

  it('requires a signed-in user to export', async () => {
    const res = await owner.request('POST', `/api/v1/projects/${projectId}/exports`, { format: 'pdf', dpi: 300, bleedMm: 3, cropMarks: false, colorProfile: 'srgb' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth_required');
  });

  it('merges anonymous projects into the account on sign-in', async () => {
    await signIn(owner, 'alice@example.com');
    expect(owner.cookie('mm_anon')).toBeUndefined();
    const list = (await owner.request('GET', '/api/v1/projects')).json().projects;
    expect(list.map((p: { id: string }) => p.id)).toEqual([projectId]);
    expect(list[0].expiresAt).toBeNull();
  });

  it('queues exports, blocks parallel jobs and reuses identical results', async () => {
    const options = { format: 'pdf', dpi: 300, bleedMm: 3, cropMarks: true, colorProfile: 'srgb' };
    const first = await owner.request('POST', `/api/v1/projects/${projectId}/exports`, options);
    expect(first.statusCode).toBe(202);
    const job = first.json().export;
    expect(job.status).toBe('queued');
    expect(h.enqueued).toContain(job.id);

    const parallel = await owner.request('POST', `/api/v1/projects/${projectId}/exports`, { ...options, format: 'png' });
    expect(parallel.json().code).toBe('export_in_progress');

    await h.db.update(exportJobs).set({ status: 'done', progress: 100, objectKey: `exports/${job.id}/poster.pdf`, bytes: 1234, finishedAt: new Date(), expiresAt: new Date(Date.now() + 86400_000) }).where(eq(exportJobs.id, job.id));
    const again = await owner.request('POST', `/api/v1/projects/${projectId}/exports`, options);
    expect(again.json().export.id).toBe(job.id);
    expect(again.json().export.downloadUrl).toContain(`exports/${job.id}/poster.pdf`);
    expect(again.json().export.downloadUrl).toContain('mapmory-where-it-all-began.pdf');

    const status = await owner.request('GET', `/api/v1/exports/${job.id}`);
    expect(status.json().export.status).toBe('done');
    const stranger = new Client(h.app);
    await signIn(stranger, 'mallory@example.com');
    expect((await stranger.request('GET', `/api/v1/exports/${job.id}`)).statusCode).toBe(404);
    expect((await stranger.request('POST', `/api/v1/projects/${projectId}/exports`, options)).statusCode).toBe(404);
  });

  it('emails the owner once when a slow export finishes, not for quick ones', async () => {
    const [job] = await h.db.select().from(exportJobs).where(eq(exportJobs.projectId, projectId));
    const sent: { to: string; url: string }[] = [];
    const deps = { db: h.db, redis: h.redis, mailer: { sendExportReady: async (to: string, url: string) => void sent.push({ to, url }) }, config: { WEB_ORIGIN: 'http://localhost:5173' }, log: { warn: () => {} } };
    const started = new Date(Date.now() - 5000);
    await h.db.update(exportJobs).set({ startedAt: started, finishedAt: new Date() }).where(eq(exportJobs.id, job!.id));
    expect(await notifyExportReady(deps, job!.id, 'export-small')).toBe(false);
    await h.db.update(exportJobs).set({ startedAt: new Date(Date.now() - 90_000) }).where(eq(exportJobs.id, job!.id));
    expect(await notifyExportReady(deps, job!.id, 'export-small')).toBe(true);
    expect(await notifyExportReady(deps, job!.id, 'export-large')).toBe(false);
    expect(sent).toEqual([{ to: 'alice@example.com', url: `http://localhost:5173/design/${projectId}/export` }]);
  });

  it('refuses CMYK while the feature is disabled', async () => {
    const res = await owner.request('POST', `/api/v1/projects/${projectId}/exports`, { format: 'pdf', dpi: 300, bleedMm: 3, cropMarks: false, colorProfile: 'cmyk-fogra39' });
    expect(res.json().code).toBe('feature_unavailable');
  });

  it('exports and erases account data (GDPR)', async () => {
    const data = await owner.request('GET', '/api/v1/me/data-export');
    expect(data.headers['content-disposition']).toContain('attachment');
    expect(data.json().projects[0].id).toBe(projectId);
    expect(data.json().account.email).toBe('alice@example.com');

    const del = await owner.request('DELETE', '/api/v1/me');
    expect(del.statusCode).toBe(204);
    expect(h.deletedObjects.some((k) => k.includes('poster.pdf'))).toBe(true);
    const rows = await h.db.select().from(projects).where(eq(projects.id, projectId));
    expect(rows).toEqual([]);
    expect((await owner.init()).user).toBeNull();
  });
});

describe('maintenance', () => {
  it('deletes expired anonymous projects', async () => {
    const c = new Client(h.app);
    await c.init();
    const { project } = (await c.request('POST', '/api/v1/projects', { draft })).json();
    await h.db.update(projects).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(projects.id, project.id));
    const log = { info: () => {}, warn: () => {}, error: () => {} } as never;
    await runMaintenance({ db: h.db, store: { deleteObjects: async () => {}, signedDownloadUrl: async () => '', putObject: async () => {}, getObject: async () => null, ensureBucket: async () => {} }, config: { REVISIONS_KEPT: 50 } as never, log });
    expect(await h.db.select().from(projects).where(eq(projects.id, project.id))).toEqual([]);
  });
});
