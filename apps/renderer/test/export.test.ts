import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDesign, type Design, type ExportOptions, type MapShape, type ThemeId } from '@mapmory/design-schema';
import { applyTheme, changePaper, detectRace, exportGeometry, makeRacePoster } from '@mapmory/poster-core';
import { loadConfigForCli } from '../src/cli-config';
import { closeBrowser } from '../src/compose';
import { runExportPipeline } from '../src/pipeline';

const run = promisify(execFile);
const deps = loadConfigForCli();
const GOLDEN = path.resolve('test/golden');
const OUT = path.resolve('test/__output__/golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const MAX_MISMATCH = 0.01;

let base: Design;
let tilesUp = false;
beforeAll(async () => {
  base = migrateDesign(JSON.parse(await readFile('test/fixtures/paris-classic.json', 'utf8')));
  tilesUp = await fetch(`${deps.tilesUrl}/catalog`).then((r) => r.ok).catch(() => false);
  await mkdir(OUT, { recursive: true });
});
afterAll(() => closeBrowser());

const pdfOpts: ExportOptions = { format: 'pdf', dpi: 150, bleedMm: 3, cropMarks: true, colorProfile: 'srgb' };

async function tmpFile(name: string, data: Buffer) {
  const p = path.join(OUT, name);
  await writeFile(p, data);
  return p;
}

/** A poster with a dashed route along the Seine, a rotated polaroid photo and a rotated free text. */
async function featurePoster(): Promise<{ design: Design; photos: Map<string, Buffer> }> {
  const photoId = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const photo = await sharp({ create: { width: 1800, height: 1350, channels: 3, background: '#3a7bd5' } })
    .composite([{ input: Buffer.from('<svg width="1800" height="1350"><circle cx="900" cy="675" r="400" fill="#ffc93c"/></svg>') }])
    .jpeg()
    .toBuffer();
  const route = Array.from({ length: 60 }, (_, i) => [Number((2.322 + i * 0.0006).toFixed(5)), Number((48.861 - Math.sin(i / 9) * 0.002).toFixed(5))] as [number, number]);
  const design: Design = {
    ...base,
    routes: [{ id: 'r1', name: 'Our walk', points: route, color: '#C42B4B', widthDu: 5, style: 'dashed', endpoints: true }],
    photos: [{ id: 'p1', photoId, center: [760, 860], widthDu: 260, aspect: 0.75, pxWidth: 1800, rotationDeg: 6, frame: 'polaroid', frameColor: '#FFFFFF' }],
    texts: [
      ...base.texts,
      { ...base.texts[0]!, id: 'note', role: 'custom', content: 'First kiss', slot: 'free', freePosition: [260, 300], rotationDeg: -8, sizeDu: 34 },
    ],
  };
  return { design, photos: new Map([[photoId, photo]]) };
}

describe('race posters in exports', () => {
  it('renders one map per leg, with the leg route and the stats as vector text', async ({ skip }) => {
    if (!tilesUp) skip();
    const race = detectRace('Ironman Paris: swim 1:05:12, bike 5:40:12, run 4:40:03, finished in 11:42:07')!;
    const poster = makeRacePoster(base, race, 'en');
    const route = Array.from({ length: 80 }, (_, i) => [Number((2.35 + 0.04 * Math.cos(i / 12.7)).toFixed(5)), Number((48.86 + 0.025 * Math.sin(i / 12.7)).toFixed(5))] as [number, number]);
    const design: Design = {
      ...poster,
      routes: [{ id: 'bike', name: 'Bike', points: route, color: '#F0592A', widthDu: 5, style: 'solid', endpoints: true }],
      sport: { ...poster.sport!, legs: poster.sport!.legs.map((l) => (l.discipline === 'bike' ? { ...l, routeId: 'bike', center: [2.35, 48.86], zoom: 11 } : l)) },
    };
    const { body } = await runExportPipeline(design, { ...pdfOpts, cropMarks: false, bleedMm: 0 }, deps);
    const file = await tmpFile('race.pdf', body);
    const images = (await run('pdfimages', ['-list', file])).stdout.split('\n').slice(2).filter(Boolean);
    expect(images).toHaveLength(3);
    // A3 at 150 DPI: each of the three columns is roughly a third of the page wide.
    for (const line of images) expect(Number(line.trim().split(/\s+/)[3])).toBeLessThan(600);
    const text = (await run('pdftotext', ['-raw', file, '-'])).stdout;
    for (const s of ['SWIM', 'BIKE', 'RUN', '3.8 km · 1:05:12', '180 km · 5:40:12', '31.7 km/h']) expect(text).toContain(s);

    // The bike route's orange is drawn in the bike panel only.
    const png = PNG.sync.read((await runExportPipeline(design, { ...pdfOpts, format: 'png', cropMarks: false, bleedMm: 0 }, deps)).body);
    const orangeIn = (x0: number, x1: number) => {
      let n = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = Math.round(x0 * png.width); x < Math.round(x1 * png.width); x++) {
          const i = (y * png.width + x) * 4;
          if (Math.abs(png.data[i]! - 0xf0) < 24 && Math.abs(png.data[i + 1]! - 0x59) < 30 && Math.abs(png.data[i + 2]! - 0x2a) < 30) n++;
        }
      }
      return n;
    };
    expect(orangeIn(0.36, 0.64)).toBeGreaterThan(200);
    expect(orangeIn(0.06, 0.34)).toBeLessThan(20);
    expect(orangeIn(0.66, 0.94)).toBeLessThan(20);
  });
});

describe('routes, photos and free text in exports', () => {
  it('embeds the photo as a second image and draws the route into the map raster', async ({ skip }) => {
    if (!tilesUp) skip();
    const { design, photos } = await featurePoster();
    const { body } = await runExportPipeline(design, pdfOpts, deps, () => {}, photos);
    const file = await tmpFile('features.pdf', body);
    const images = (await run('pdfimages', ['-list', file])).stdout.split('\n').slice(2).filter(Boolean);
    // The map raster plus the photo, embedded as the original JPEG (Chromium may add a soft-mask image for the shadow).
    expect(images.some((l) => /\s1800\s+1350\s+icc\s+3\s+8\s+jpeg/.test(l))).toBe(true);
    expect((await run('pdftotext', ['-raw', file, '-'])).stdout).toContain('First kiss'); // -raw: rotated text in stream order

    // The route colour appears in the map, and not without the route.
    const png = (d: Design) => runExportPipeline(d, { ...pdfOpts, format: 'png', cropMarks: false, bleedMm: 0 }, deps, () => {}, photos).then((r) => r.body);
    const coral = async (buf: Buffer) => {
      const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      let n = 0;
      for (let i = 0; i < data.length; i += 3) if (Math.abs(data[i]! - 0xc4) < 18 && Math.abs(data[i + 1]! - 0x2b) < 18 && Math.abs(data[i + 2]! - 0x4b) < 18) n++;
      return n;
    };
    expect(await coral(await png(design))).toBeGreaterThan(2000);
    expect(await coral(await png({ ...design, routes: [] }))).toBeLessThan(200);
  });

  it('fails clearly when a photo file is missing', async () => {
    const { design } = await featurePoster();
    await expect(runExportPipeline(design, pdfOpts, deps)).rejects.toThrow(/Missing photo files/);
  });
});

describe('export correctness (plan §10)', () => {
  it('writes a PDF with trim/bleed boxes, embedded TrueType fonts, a full-resolution map and attribution', async ({ skip }) => {
    if (!tilesUp) skip();
    const { body } = await runExportPipeline(base, pdfOpts, deps);
    const file = await tmpFile('check.pdf', body);
    const info = (await run('pdfinfo', ['-box', file])).stdout;
    // A3 297×420 mm + 2×(3 mm bleed + 8 mm slug) = 319×442 mm
    expect(info).toMatch(/Page size:\s+904\.2\d? x 1252\.9\d? pts|Page size:\s+904\.\d+ x 125[23]\.\d+ pts/);
    expect(info).toMatch(/TrimBox:\s+31\.18\s+31\.18\s+872\.9\d?\s+1221\.\d+/);
    expect(info).toMatch(/BleedBox:\s+22\.68\s+22\.68\s+881\.4\d?\s+1230\.\d+/);
    const fonts = (await run('pdffonts', [file])).stdout;
    expect(fonts).toContain('CID TrueType');
    expect(fonts).not.toContain('Type 3');
    for (const line of fonts.split('\n').slice(2).filter(Boolean)) expect(line).toMatch(/\byes\s+yes\s+yes\b/);
    const images = (await run('pdfimages', ['-list', file])).stdout.split('\n').slice(2).filter(Boolean);
    expect(images).toHaveLength(1);
    const [, , , w, h, , , , , , , , xppi, yppi] = images[0]!.trim().split(/\s+/);
    expect(Number(xppi)).toBe(150);
    expect(Number(yppi)).toBe(150);
    expect(Number(w)).toBeGreaterThan(1000);
    expect(Number(h)).toBeGreaterThan(1000);
    const text = (await run('pdftotext', [file, '-'])).stdout;
    expect(text).toContain('© OpenStreetMap contributors');
    expect(text).toContain('Where it all began');
  });

  it('writes PNG/JPEG/TIFF at the requested DPI with an sRGB profile', async ({ skip }) => {
    if (!tilesUp) skip();
    for (const format of ['png', 'jpeg', 'tiff'] as const) {
      const { body } = await runExportPipeline(changePaper(base, 'A4', 'portrait'), { ...pdfOpts, format, cropMarks: false, bleedMm: 0 }, deps);
      const meta = await sharp(body).metadata();
      expect(meta.format).toBe(format === 'jpeg' ? 'jpeg' : format);
      // A4 at 150 DPI = 1240 × 1754 px
      expect([meta.width, meta.height]).toEqual([1240, 1754]);
      expect(Math.round(meta.density ?? 0)).toBe(150);
      expect(meta.icc).toBeDefined();
      expect(meta.space).toBe('srgb');
    }
  });

  it('keeps every valid design below the render cap', () => {
    // The largest custom page (1200 mm) with 5 mm bleed and crop marks at 300 DPI is 14480 px < 16384 px.
    const huge = { ...base, page: { ...base.page, paper: 'custom' as const, trimMm: { w: 1200, h: 1200 } } };
    const g = exportGeometry(huge, { dpi: 300, cropMarks: true, bleedMm: 5 });
    expect(g.exceedsLimit).toBe(false);
    expect(g.pagePx.w).toBe(14480);
  });
});

/** Ghostscript + a CMYK profile (CMYK_ICC_PROFILE, else Ghostscript's bundled default) — skipped when absent. */
async function cmykDeps() {
  const gs = process.env.GHOSTSCRIPT_PATH || 'gs';
  const version = await run(gs, ['--version']).then((r) => r.stdout.trim()).catch(() => null);
  if (!version) return null;
  let icc = process.env.CMYK_ICC_PROFILE;
  if (!icc) {
    const found = await run('find', ['-L', '/opt/homebrew/share/ghostscript', '/usr/share/ghostscript', '-name', 'default_cmyk.icc']).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? '' }));
    icc = found.stdout.split('\n').find(Boolean);
  }
  return icc ? { ...deps, ghostscript: gs, cmykIccProfile: icc } : null;
}

describe('CMYK print-shop PDF (plan §7.4)', () => {
  it('converts to DeviceCMYK with a PDF/X output intent and keeps the boxes', async ({ skip }) => {
    const cmyk = await cmykDeps();
    if (!tilesUp || !cmyk) skip();
    const { body } = await runExportPipeline(base, { ...pdfOpts, colorProfile: 'cmyk-fogra39' }, cmyk!);
    const file = await tmpFile('cmyk.pdf', body);
    const images = (await run('pdfimages', ['-list', file])).stdout;
    expect(images).toMatch(/\bcmyk\b/);
    expect(images).not.toMatch(/\brgb\b/);
    const info = (await run('pdfinfo', ['-box', file])).stdout;
    expect(info).toMatch(/TrimBox:\s+31\.18/);
    expect(body.includes(Buffer.from('GTS_PDFX'))).toBe(true);
    expect((await run('pdffonts', [file])).stdout).not.toContain('Type 3');
  });
});

const CASES: [ThemeId, MapShape, 'A3' | '50x70'][] = [
  ['classic-ink', 'rect', 'A3'],
  ['minimal', 'rounded', 'A3'],
  ['blush', 'circle', 'A3'],
  ['old-letter', 'arch', '50x70'],
  ['night-train', 'heart', '50x70'],
  ['lavender-field', 'rect', '50x70'],
  ['gold-ink', 'circle', 'A3'],
  ['riviera', 'rounded', '50x70'],
];

describe('visual regression (golden renders)', () => {
  it.for(CASES)('%s / %s / %s matches the golden image', async ([themeId, shape, paper], { skip }) => {
    if (!tilesUp) skip();
    const themed = applyTheme(changePaper(base, paper, 'portrait'), themeId);
    const design = { ...themed, map: { ...themed.map, shape } };
    const { body } = await runExportPipeline(design, { format: 'png', dpi: 150, bleedMm: 0, cropMarks: false, colorProfile: 'srgb' }, deps);
    const actual = await sharp(body).resize(400).png().toBuffer();
    const name = `${themeId}-${shape}-${paper}.png`;
    const goldenPath = path.join(GOLDEN, name);
    await writeFile(path.join(OUT, name), actual);
    if (UPDATE || !existsSync(goldenPath)) {
      await writeFile(goldenPath, actual);
      return;
    }
    const a = PNG.sync.read(actual);
    const b = PNG.sync.read(await readFile(goldenPath));
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    const diff = new PNG({ width: a.width, height: a.height });
    const mismatched = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    await writeFile(path.join(OUT, name.replace('.png', '-diff.png')), PNG.sync.write(diff));
    expect(mismatched / (a.width * a.height)).toBeLessThan(MAX_MISMATCH);
  });
});
