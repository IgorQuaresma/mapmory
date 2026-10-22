import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Design } from '@mapmory/design-schema';
import type { ExportGeometry } from '@mapmory/poster-core';

/** A fixed, non-routable origin for the print page; every other request is refused (plan §8.1). */
export const PRINT_ORIGIN = 'https://print.mapmory.internal';
const MAP_IMAGE_PATH = '/__map.png';
export const PROXY_PREFIX = '/__proxy/';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

let browserPromise: Promise<Browser> | null = null;

/** One long-lived browser per worker; each job gets an isolated context. */
export function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium
    .launch({ headless: true, args: ['--disable-dev-shm-usage', '--font-render-hinting=none'] })
    .then((b) => {
      b.on('disconnected', () => (browserPromise = null));
      return b;
    });
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  const b = await browserPromise;
  browserPromise = null;
  await b?.close();
}

export interface ComposeInput {
  design: Design;
  geometry: ExportGeometry;
  cropMarks: boolean;
  distDir: string;
  /** print mode */
  mapPng?: Buffer;
  /**
   * live mode (parity tests): MapLibre GL JS draws the map in the page. Tile/glyph URLs in the style must
   * point at `${PRINT_ORIGIN}/__proxy/…`; those requests are proxied to `proxyTarget` only.
   */
  live?: { style: StyleSpecification; pixelRatio: number; proxyTarget: string };
  timeoutMs?: number;
}

async function openPrintPage(input: ComposeInput) {
  const browser = await getBrowser();
  const viewportScale = 96 / 25.4;
  const context = await browser.newContext({
    javaScriptEnabled: true,
    viewport: {
      width: Math.ceil(input.geometry.pageMm.w * viewportScale),
      height: Math.ceil(input.geometry.pageMm.h * viewportScale),
    },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const distRoot = path.resolve(input.distDir);

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === PRINT_ORIGIN) {
      if (input.live && url.pathname.startsWith(PROXY_PREFIX)) {
        const target = new URL(url.pathname.slice(PROXY_PREFIX.length) + url.search, `${input.live.proxyTarget}/`);
        const res = await fetch(target, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
        return route.fulfill({
          status: res.status,
          body: Buffer.from(await res.arrayBuffer()),
          contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        });
      }
      if (url.pathname === MAP_IMAGE_PATH && input.mapPng) {
        return route.fulfill({ status: 200, contentType: 'image/png', body: input.mapPng });
      }
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const file = path.resolve(distRoot, rel);
      if (!file.startsWith(distRoot + path.sep)) return route.abort('accessdenied');
      try {
        const body = await readFile(file);
        return route.fulfill({ status: 200, body, contentType: CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
    }
    return route.abort('blockedbyclient');
  });

  const payload = {
    mode: input.live ? 'live' : 'print',
    design: input.design,
    bleedDu: input.geometry.bleedDu,
    slugDu: input.geometry.slugDu,
    pageMm: input.geometry.pageMm,
    cropMarks: input.cropMarks,
    mapImageUrl: input.mapPng ? MAP_IMAGE_PATH : undefined,
    style: input.live?.style,
    pixelRatio: input.live?.pixelRatio,
  };
  // JSON is a valid JS expression; user text stays inside string literals.
  await page.addInitScript({ content: `window.__MAPMORY_PRINT__ = ${JSON.stringify(payload)};` });

  await page.goto(`${PRINT_ORIGIN}/`, { waitUntil: 'load', timeout: input.timeoutMs ?? 60_000 });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __MAPMORY_READY__?: boolean; __MAPMORY_ERROR__?: string };
      if (w.__MAPMORY_ERROR__) throw new Error(w.__MAPMORY_ERROR__);
      return w.__MAPMORY_READY__ === true;
    },
    undefined,
    { timeout: input.timeoutMs ?? 60_000, polling: 100 },
  );
  return { page, context };
}

/** Composes the vector PDF: map raster + vector text/frame/markers with embedded font subsets. */
export async function composePdf(input: ComposeInput): Promise<Buffer> {
  const { page, context } = await openPrintPage(input);
  try {
    const pdf = await page.pdf({
      width: `${input.geometry.pageMm.w}mm`,
      height: `${input.geometry.pageMm.h}mm`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      tagged: false,
      outline: false,
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Screenshot of the print page (used by the preview-vs-export parity test). */
export async function screenshotPrintPage(
  input: ComposeInput,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  const { page, context } = await openPrintPage(input);
  try {
    return Buffer.from(await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', clip }));
  } finally {
    await context.close();
  }
}
