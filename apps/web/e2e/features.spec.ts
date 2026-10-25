import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPoster, expectAccessible } from './helpers';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** A small JPEG drawn in the browser, so no binary fixture is needed. */
async function jpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#f2b880');
    grad.addColorStop(1, '#3d6b8c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#fff8';
    g.beginPath();
    g.arc(440, 150, 70, 0, Math.PI * 2);
    g.fill();
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

test('routes, photos and free text: import GPX, upload a photo, drag a text, undo', async ({ page }) => {
  await createPoster(page);

  // Route from a GPX file (two segments are joined into one route).
  await page.getByRole('tab', { name: 'Routes' }).click();
  await page.getByTestId('route-file').setInputFiles(path.join(fixtures, 'walk.gpx'));
  const list = page.getByTestId('route-list');
  await expect(list.getByRole('textbox', { name: 'Name' })).toHaveValue('Evening walk');
  await page.getByTestId('route-fit').click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expectAccessible(page, 'routes panel');

  // Photo upload: the element appears on the poster.
  await page.getByRole('tab', { name: 'Photos' }).click();
  await page.getByTestId('photo-file').setInputFiles({ name: 'beach.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page) });
  const photo = page.locator('[data-testid^="photo-p"]').first();
  await expect(photo).toBeVisible();
  await expect(photo.locator('img')).toHaveJSProperty('complete', true);
  await page.getByRole('slider', { name: 'Rotation' }).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');

  // Deleting a photo can be undone: the uploaded file is kept, so the image loads again.
  await page.getByTestId('photo-delete').click();
  await page.getByTestId('photo-delete-confirm').click();
  await expect(photo).toHaveCount(0);
  await page.getByTestId('undo').click();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // Unsupported files are rejected before upload.
  await page.getByTestId('photo-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(page.getByRole('alert')).toContainText('not supported');

  await expectAccessible(page, 'editor with a route and a photo');

  // Free text: add, drag on the poster, undo restores the position.
  await page.getByRole('tab', { name: 'Text' }).click();
  await page.getByRole('button', { name: 'Add text' }).click();
  const card = page.locator('[data-testid^="text-card-"]').last();
  const id = (await card.getAttribute('data-testid'))!.replace('text-card-', '');
  const text = page.getByTestId(`text-${id}`);
  await expect(text).toBeVisible();
  const before = (await text.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 - 80, { steps: 8 });
  await page.mouse.up();
  const after = (await text.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(40);
  expect(before.y - after.y).toBeGreaterThan(50);

  await page.getByTestId('undo').click();
  await expect.poll(async () => Math.round((await text.boundingBox())!.x)).toBe(Math.round(before.x));
  expect(Math.round((await text.boundingBox())!.y)).toBe(Math.round(before.y));

  await expectAccessible(page, 'editor with a free text');
});
