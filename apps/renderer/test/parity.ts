/**
 * Spike S1 / CI parity test (plan §10, §12): renders the same design with MapLibre GL JS (what the editor
 * preview uses, here inside headless Chromium) and MapLibre Native (the exporter) at pixel ratio 1, and
 * compares the map pixels. Exits non-zero if the mismatch exceeds the threshold.
 * Usage: pnpm parity [threshold=0.06] [--labels]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { THEME_IDS, migrateDesign } from '@mapmory/design-schema';
import { applyTheme, buildStyle, computeLayout, type ExportGeometry } from '@mapmory/poster-core';
import { loadConfigForCli } from '../src/cli-config';
import { PRINT_ORIGIN, PROXY_PREFIX, closeBrowser, screenshotPrintPage } from '../src/compose';
import { renderMapRaster } from '../src/map-raster';

const threshold = Number(process.argv.find((a) => /^\d/.test(a)) ?? 0.06);
const withLabels = process.argv.includes('--labels');
const deps = loadConfigForCli();
const outDir = path.resolve('test/__output__/parity');
await mkdir(outDir, { recursive: true });
const base = migrateDesign(JSON.parse(await readFile('test/fixtures/paris-classic.json', 'utf8')));

let failed = false;
try {
  for (const themeId of THEME_IDS) {
    // Markers are overlay elements, not map pixels — leave them out of the comparison.
    const design = applyTheme({ ...base, markers: [], map: { ...base.map, layers: { ...base.map.layers, labels: withLabels } } }, themeId);
    const layout = computeLayout(design);
    const style = buildStyle(design, { tilesUrl: `${deps.tilesUrl}/basemap/{z}/{x}/{y}`, glyphsUrl: `${deps.tilesUrl}/font/{fontstack}/{range}` });
    const { rect } = layout.map;
    const w = Math.round(rect.w);
    const h = Math.round(rect.h);

    const native = await renderMapRaster({ style, viewport: { ...layout.map.viewport, width: w, height: h }, pixelRatio: 1, allowedOrigins: [new URL(deps.tilesUrl).origin] });
    const nativePng = await sharp(native.data, { raw: { width: native.width, height: native.height, channels: 4 } }).png().toBuffer();

    // A page whose CSS width equals the poster width in design units → 1 du = 1 CSS px.
    const mmPerPx = 25.4 / 96;
    const geometry = { pageMm: { w: layout.outer.w * mmPerPx, h: layout.outer.h * mmPerPx }, bleedDu: 0, slugDu: 0 } as ExportGeometry;
    const live = await screenshotPrintPage(
      {
        design,
        geometry,
        cropMarks: false,
        distDir: deps.printPageDist,
        live: {
          style: buildStyle(design, {
            tilesUrl: `${PRINT_ORIGIN}${PROXY_PREFIX}basemap/{z}/{x}/{y}`,
            glyphsUrl: `${PRINT_ORIGIN}${PROXY_PREFIX}font/{fontstack}/{range}`,
          }),
          pixelRatio: 1,
          proxyTarget: deps.tilesUrl,
        },
      },
      { x: rect.x, y: rect.y, width: w, height: h },
    );

    const a = PNG.sync.read(nativePng);
    const b = PNG.sync.read(await sharp(live).resize(w, h).png().toBuffer());
    const diff = new PNG({ width: w, height: h });
    const mismatched = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.15, includeAA: false });
    const ratio = mismatched / (w * h);
    await writeFile(path.join(outDir, `${themeId}-native.png`), nativePng);
    await writeFile(path.join(outDir, `${themeId}-live.png`), PNG.sync.write(b));
    await writeFile(path.join(outDir, `${themeId}-diff.png`), PNG.sync.write(diff));
    const ok = ratio <= threshold;
    failed ||= !ok;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${themeId.padEnd(12)} mismatch ${(ratio * 100).toFixed(2)}%`);
  }
} finally {
  await closeBrowser();
}
process.exit(failed ? 1 : 0);
