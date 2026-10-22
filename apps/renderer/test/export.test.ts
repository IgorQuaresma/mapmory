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
import { applyTheme, changePaper, exportGeometry } from '@mapmory/poster-core';
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
  ['sepia', 'arch', '50x70'],
  ['midnight', 'heart', '50x70'],
  ['forest', 'rect', '50x70'],
  ['gold-ink', 'circle', 'A3'],
  ['ocean', 'rounded', '50x70'],
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
