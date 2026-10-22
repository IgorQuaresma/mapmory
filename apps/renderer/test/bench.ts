/**
 * Spike S2 (plan §12): maximum render size, time and memory for MapLibre Native on this machine.
 * Usage: pnpm bench [paper] [dpi]
 */
import sharp from 'sharp';
import { buildStyle, changePaper, computeLayout, exportGeometry, generateDraft } from '@mapmory/poster-core';
import { renderMapRaster } from '../src/map-raster';

const [paper = 'A0', dpi = '300'] = process.argv.slice(2);
const TILES = process.env.TILES_PUBLIC_URL ?? 'http://localhost:3010';
const draft = generateDraft({
  places: [{ id: 'x', name: 'Pont des Arts', label: 'Pont des Arts, Paris', lngLat: [2.33753, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France' }],
  title: 'Spike', subtitle: null, date: { iso: '2019-06-14', precision: 'day' }, mood: 'neutral', locale: 'en',
});
const design = changePaper({ ...draft, map: { ...draft.map, zoom: 14, layers: { ...draft.map.layers, labels: true } } }, paper as 'A0', 'portrait');
const geometry = exportGeometry(design, { dpi: Number(dpi) as 300, bleedMm: 3, cropMarks: false });
const layout = computeLayout(design, { bleedDu: geometry.bleedDu });
const style = buildStyle(design, { tilesUrl: `${TILES}/basemap/{z}/{x}/{y}`, glyphsUrl: `${TILES}/font/{fontstack}/{range}` });

const t0 = performance.now();
let peak = 0;
const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 100);
const raster = await renderMapRaster({ style, viewport: layout.map.viewport, pixelRatio: geometry.pxPerDu, allowedOrigins: [new URL(TILES).origin] });
const t1 = performance.now();
await sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: 4 } }).png({ compressionLevel: 6 }).toFile(`.tmp-spike-${paper}-${dpi}.png`);
clearInterval(timer);
console.log(JSON.stringify({ paper, dpi, raster: `${raster.width}x${raster.height}`, megapixels: ((raster.width * raster.height) / 1e6).toFixed(1), renderSeconds: ((t1 - t0) / 1000).toFixed(1), totalSeconds: ((performance.now() - t0) / 1000).toFixed(1), peakRssMb: Math.round(peak / 1e6) }));
