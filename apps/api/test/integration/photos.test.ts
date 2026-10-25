import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DraftInput } from '@mapmory/design-schema';
import { photos as photosTable } from '@mapmory/db';
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

/** A 1600×1200 JPEG with camera details and a GPS position in its EXIF, like a phone photo. */
async function phonePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#7aa7c7' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'PhoneCo', Model: 'Phone 15', Artist: 'Ana Example' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '2/1 20/1 15/1' },
    })
    .toBuffer();
}

async function ownerWithProject() {
  const c = new Client(h.app);
  await c.init();
  const { project } = (await c.request('POST', '/api/v1/projects', { draft })).json();
  return { c, projectId: project.id as string };
}

const upload = (c: Client, projectId: string, body: Buffer, type = 'image/jpeg') =>
  c.request('POST', `/api/v1/projects/${projectId}/photos`, undefined, { 'content-type': type }, body);

describe('photo uploads', () => {
  it('re-encodes the image and strips EXIF, including the GPS position', async () => {
    const original = await phonePhoto();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const { c, projectId } = await ownerWithProject();
    const res = await upload(c, projectId, original);
    expect(res.statusCode).toBe(201);
    const { photo } = res.json();
    expect([photo.width, photo.height]).toEqual([1600, 1200]);

    const served = await c.request('GET', `/api/v1/photos/${photo.id}`);
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(served.rawPayload).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(served.rawPayload.includes(Buffer.from('PhoneCo'))).toBe(false);
    expect(served.rawPayload.includes(Buffer.from('Ana Example'))).toBe(false);
  });

  it('applies the camera orientation and caps the size at 4000 px', async () => {
    const tall = await sharp({ create: { width: 6000, height: 3000, channels: 3, background: '#cc8844' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const { c, projectId } = await ownerWithProject();
    const { photo } = (await upload(c, projectId, tall)).json();
    expect([photo.width, photo.height]).toEqual([2000, 4000]);
  });

  it('rejects files that are not images, unsupported types and oversized bodies', async () => {
    const { c, projectId } = await ownerWithProject();
    const fake = await upload(c, projectId, Buffer.from('<svg onload=alert(1)>not really a jpeg</svg>'));
    expect(fake.statusCode).toBe(422);
    expect(fake.json().code).toBe('invalid_image');
    const gif = await upload(c, projectId, Buffer.from('GIF89a'), 'image/gif');
    expect(gif.statusCode).toBe(415);
    expect(gif.json().code).toBe('unsupported_image');
    const huge = await upload(c, projectId, Buffer.alloc(16 * 1024 * 1024, 1));
    expect(huge.statusCode).toBe(413);
  });

  it('limits photos per project', async () => {
    const { c, projectId } = await ownerWithProject();
    const small = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } }).png().toBuffer();
    for (let i = 0; i < 12; i++) expect((await upload(c, projectId, small, 'image/png')).statusCode).toBe(201);
    const thirteenth = await upload(c, projectId, small, 'image/png');
    expect(thirteenth.statusCode).toBe(409);
    expect(thirteenth.json().code).toBe('photo_limit');
  });

  it('serves photos only to the owner or through a valid share link (IDOR)', async () => {
    const { c, projectId } = await ownerWithProject();
    const { photo } = (await upload(c, projectId, await phonePhoto())).json();
    const stranger = new Client(h.app);
    await stranger.init();
    expect((await stranger.request('GET', `/api/v1/photos/${photo.id}`)).statusCode).toBe(404);
    expect((await stranger.request('POST', `/api/v1/projects/${projectId}/photos`, undefined, { 'content-type': 'image/jpeg' }, await phonePhoto())).statusCode).toBe(404);
    expect((await stranger.request('DELETE', `/api/v1/photos/${photo.id}`)).statusCode).toBe(404);

    const token = (await c.request('POST', `/api/v1/projects/${projectId}/share`)).json().url.split('/s/')[1];
    const shared = await stranger.request('GET', `/api/v1/shared/${token}/photos/${photo.id}`);
    expect(shared.statusCode).toBe(200);
    expect(shared.headers['content-type']).toBe('image/jpeg');
    const other = await ownerWithProject();
    const otherPhoto = (await upload(other.c, other.projectId, await phonePhoto())).json().photo;
    // A share link never exposes photos of another project.
    expect((await stranger.request('GET', `/api/v1/shared/${token}/photos/${otherPhoto.id}`)).statusCode).toBe(404);
  });

  it('deletes the file with the photo and with the project', async () => {
    const { c, projectId } = await ownerWithProject();
    const a = (await upload(c, projectId, await phonePhoto())).json().photo;
    const b = (await upload(c, projectId, await phonePhoto())).json().photo;
    expect((await c.request('DELETE', `/api/v1/photos/${a.id}`)).statusCode).toBe(204);
    expect([...h.objects.keys()].some((k) => k.includes(a.id))).toBe(false);
    expect((await c.request('DELETE', `/api/v1/projects/${projectId}`)).statusCode).toBe(204);
    expect([...h.objects.keys()].some((k) => k.includes(b.id))).toBe(false);
  });

  it('deletes photos the poster no longer uses after 24 h, and keeps used ones', async () => {
    const { c, projectId } = await ownerWithProject();
    const used = (await upload(c, projectId, await phonePhoto())).json().photo;
    const unused = (await upload(c, projectId, await phonePhoto())).json().photo;
    const { design } = (await c.request('GET', `/api/v1/projects/${projectId}`)).json();
    const element = { id: 'p1', photoId: used.id, center: [500, 700], widthDu: 300, aspect: 0.75, pxWidth: used.width, rotationDeg: 0, frame: 'none', frameColor: '#FFFFFF' };
    expect((await c.request('PUT', `/api/v1/projects/${projectId}/design`, { design: { ...design, photos: [element] } }, { 'if-match': '"1"' })).statusCode).toBe(200);
    await h.db.update(photosTable).set({ createdAt: new Date(Date.now() - 2 * 86400_000) });
    const store = { deleteObjects: async (keys: string[]) => void keys.forEach((k) => h.objects.delete(k)), signedDownloadUrl: async () => '', putObject: async () => {}, getObject: async () => null, ensureBucket: async () => {} };
    await runMaintenance({ db: h.db, store, config: { REVISIONS_KEPT: 50 } as never, log: { info: () => {}, warn: () => {}, error: () => {} } as never });
    expect((await c.request('GET', `/api/v1/photos/${used.id}`)).statusCode).toBe(200);
    expect((await c.request('GET', `/api/v1/photos/${unused.id}`)).statusCode).toBe(404);
  });

  it('accepts designs with routes and photo elements (larger bodies)', async () => {
    const { c, projectId } = await ownerWithProject();
    const { photo } = (await upload(c, projectId, await phonePhoto())).json();
    const { design } = (await c.request('GET', `/api/v1/projects/${projectId}`)).json();
    const points = Array.from({ length: 1000 }, (_, i) => [Number((2.3 + i * 0.0001).toFixed(5)), Number((48.85 + Math.sin(i / 30) * 0.003).toFixed(5))]);
    const routes = Array.from({ length: 4 }, (_, i) => ({ id: `r${i + 1}`, name: `Day ${i + 1}`, points, color: '#C42B4B', widthDu: 4, style: 'dashed', endpoints: true }));
    const photos = [{ id: 'p1', photoId: photo.id, center: [500, 700], widthDu: 300, aspect: 0.75, pxWidth: photo.width, rotationDeg: -4, frame: 'polaroid', frameColor: '#FFFFFF' }];
    const res = await c.request('PUT', `/api/v1/projects/${projectId}/design`, { design: { ...design, routes, photos } }, { 'if-match': '"1"' });
    expect(res.statusCode).toBe(200);
  });
});
