import { mkdir } from 'node:fs/promises';
import { parseDesign, type Design, type ExportOptions } from '@mapmory/design-schema';
import { buildStyle, computeLayout, exportGeometry } from '@mapmory/poster-core';
import { composePdf } from './compose';
import { convertPdfToCmyk } from './cmyk';
import { renderMapRaster } from './map-raster';
import { finalizePdf } from './pdf-boxes';
import { encodeMapPng, rasterizePdf } from './rasterize';

export interface PipelineDeps {
  tilesUrl: string;
  printPageDist: string;
  tmpDir: string;
  pdftoppm: string;
  ghostscript: string | null;
  cmykIccProfile: string | null;
}

export type PipelineStage = 'rendering' | 'composing' | 'uploading';

export interface PipelineResult {
  body: Buffer;
  contentType: string;
  extension: string;
  timings: Record<string, number>;
}

export class ExportTooLargeError extends Error {}
export class PhotoMissingError extends Error {}

const CONTENT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', tiff: 'image/tiff' } as const;
const EXTENSIONS = { pdf: 'pdf', png: 'png', jpeg: 'jpg', tiff: 'tif' } as const;

/** The full export pipeline (plan §7.2). Pure function of (design, options) plus infrastructure deps. */
export async function runExportPipeline(
  rawDesign: Design,
  options: ExportOptions,
  deps: PipelineDeps,
  onProgress: (stage: PipelineStage, progress: number) => void | Promise<void> = () => {},
  /** Photo files for the design's photo elements, by photo id. */
  photos: Map<string, Buffer> = new Map(),
): Promise<PipelineResult> {
  const timings: Record<string, number> = {};
  const mark = (name: string, t0: number) => (timings[name] = Math.round(performance.now() - t0));
  await mkdir(deps.tmpDir, { recursive: true });

  // 1. Validate again — the renderer never trusts stored documents blindly.
  const design = parseDesign(rawDesign);

  // 2. Geometry.
  const missing = design.photos.filter((p) => !photos.has(p.photoId));
  if (missing.length) throw new PhotoMissingError(`Missing photo files: ${missing.map((p) => p.photoId).join(', ')}`);
  const geometry = exportGeometry(design, options);
  if (geometry.exceedsLimit) throw new ExportTooLargeError('Requested output exceeds the maximum render size');
  const layout = computeLayout(design, { bleedDu: geometry.bleedDu, slugDu: geometry.slugDu });

  // 3. Map raster with MapLibre Native; endpoints come only from server config.
  await onProgress('rendering', 10);
  let t0 = performance.now();
  const style = buildStyle(design, {
    tilesUrl: `${deps.tilesUrl}/basemap/{z}/{x}/{y}`,
    glyphsUrl: `${deps.tilesUrl}/font/{fontstack}/{range}`,
  });
  const raster = await renderMapRaster({
    style,
    viewport: layout.map.viewport,
    pixelRatio: geometry.pxPerDu,
    allowedOrigins: [new URL(deps.tilesUrl).origin],
  });
  const mapPng = await encodeMapPng(raster);
  mark('mapRaster', t0);

  // 4–5. Compose the PDF in Chromium; the shape is a vector clip path applied by the print page.
  await onProgress('composing', 45);
  t0 = performance.now();
  const title = design.texts.find((t) => t.role === 'title')?.content ?? '';
  let pdf = await finalizePdf(
    await composePdf({ design, geometry, cropMarks: options.cropMarks, distDir: deps.printPageDist, mapPng, photos }),
    geometry,
    title,
  );
  mark('composePdf', t0);

  if (options.format === 'pdf' && options.colorProfile === 'cmyk-fogra39') {
    t0 = performance.now();
    pdf = await convertPdfToCmyk(pdf, { ghostscript: deps.ghostscript, iccProfile: deps.cmykIccProfile, tmpDir: deps.tmpDir });
    pdf = await finalizePdf(pdf, geometry, title, { objectStreams: false });
    mark('cmyk', t0);
  }

  // 6. Derive raster formats from that PDF.
  let body = pdf;
  if (options.format !== 'pdf') {
    await onProgress('composing', 70);
    t0 = performance.now();
    body = await rasterizePdf(pdf, { format: options.format, dpi: options.dpi, tmpDir: deps.tmpDir, pdftoppm: deps.pdftoppm });
    mark('rasterize', t0);
  }
  await onProgress('uploading', 90);
  return { body, contentType: CONTENT_TYPES[options.format], extension: EXTENSIONS[options.format], timings };
}
