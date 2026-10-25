import { expect, test } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** Polls Mailpit until the sign-in email for `email` arrives and returns the magic link in it. */
async function magicLinkFor(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const link = /(https?:\/\/\S+\/api\/auth\/magic-link\/verify\S+)/.exec(message.Text as string)?.[1];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in email for ${email}`);
}

test('real stack: memory → place → editor → magic-link sign-in → rendered PDF download', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // Step 1, with the real ALTCHA proof-of-work.
  await page.goto('/create');
  await page.getByTestId('memory-input').fill('The night we got engaged on the Pont des Arts in Paris, 14 June 2019');
  const altcha = page.locator('altcha-widget input[type=checkbox]');
  if (await altcha.count()) {
    await altcha.first().click({ force: true });
    await expect(altcha.first()).toBeChecked({ timeout: 30_000 });
  }
  await page.getByTestId('interpret-submit').click();

  // Step 2: geocoded candidates from the API.
  await expect(page).toHaveURL(/\/create\/place$/);
  await expect(page.getByTestId('chosen-places')).toContainText('Pont des Arts');
  await page.getByTestId('create-design').click();

  // Editor: change the theme and wait for the autosave to reach the server.
  await expect(page).toHaveURL(/\/design\/[0-9a-f-]+$/);
  await page.waitForSelector('.maplibregl-canvas');
  await page.getByTestId('theme-riviera').click();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 20_000 });

  // Export: sign in with the magic link from Mailpit.
  await page.getByTestId('go-export').click();
  await expect(page).toHaveURL(/\/export$/);
  const exportUrl = page.url();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send me a link' }).click();
  await expect(page.getByTestId('check-email')).toBeVisible();
  await page.goto(await magicLinkFor(email));
  if (page.url() !== exportUrl) await page.goto(exportUrl);

  // The real worker renders the PDF; the download comes from S3 through a signed URL.
  await page.getByRole('radio', { name: /PDF/ }).check();
  await page.getByTestId('start-export').click();
  await expect(page.getByTestId('export-status')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  const href = await page.getByTestId('download-link').getAttribute('href');
  expect(href).toMatch(/X-Amz-Signature=/);
  const file = await page.request.get(href!);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('application/pdf');
  const body = await file.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  expect(body.length).toBeGreaterThan(100_000);
});
