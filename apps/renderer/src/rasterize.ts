import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { ExportFormat } from '@mapmory/design-schema';

const run = promisify(execFile);
sharp.cache(false);
sharp.concurrency(Math.max(1, Math.min(4, os.availableParallelism())));

/**
 * Raster formats are derived from the composed PDF so PDF and PNG can't drift apart (plan §7.2 step 6).
 * Output carries an embedded sRGB ICC profile and the DPI in its metadata.
 */
export async function rasterizePdf(
  pdf: Buffer,
  { format, dpi, tmpDir, pdftoppm }: { format: Exclude<ExportFormat, 'pdf'>; dpi: number; tmpDir: string; pdftoppm: string },
): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpDir, 'raster-'));
  try {
    const input = path.join(dir, 'in.pdf');
    await writeFile(input, pdf);
    const outBase = path.join(dir, 'out');
    // poppler's Splash backend; the cairo backend (pdftocairo) clips glyphs at print resolutions (ADR 0002).
    await run(pdftoppm, ['-png', '-r', String(dpi), '-singlefile', '-aa', 'yes', '-aaVector', 'yes', input, outBase], {
      timeout: 4 * 60_000,
      maxBuffer: 1024 * 1024,
    });
    const png = await readFile(`${outBase}.png`);
    const img = sharp(png, { limitInputPixels: 400_000_000 }).removeAlpha().withIccProfile('srgb').withMetadata({ density: dpi });
    switch (format) {
      case 'png':
        return img.png({ compressionLevel: 7, adaptiveFiltering: true }).toBuffer();
      case 'jpeg':
        return img.jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
      case 'tiff':
        return img.tiff({ compression: 'lzw', xres: dpi / 25.4, yres: dpi / 25.4, resolutionUnit: 'inch' }).toBuffer();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Encodes the raw map raster as PNG for the print page. */
export async function encodeMapPng(raster: { data: Buffer; width: number; height: number }): Promise<Buffer> {
  return sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: 4 }, limitInputPixels: 400_000_000 })
    .png({ compressionLevel: 1 })
    .toBuffer();
}
