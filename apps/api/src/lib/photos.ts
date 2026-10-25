import sharp from 'sharp';
import { Problem } from './problem';

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Stored photos per project (placed ones are capped at 4 by the schema; removed ones are kept 24 h for undo). */
export const MAX_PHOTOS_PER_PROJECT = 12;
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_INPUT_PIXELS = 60_000_000;
const MAX_EDGE_PX = 4000;

sharp.cache(false);

export interface ProcessedPhoto {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Decodes and re-encodes an uploaded image (plan §8.1, §8.4). Re-encoding neutralises malformed or hostile files
 * before any browser or the print renderer sees them, and sharp writes no metadata by default, so EXIF (including
 * GPS position), XMP and camera details are removed. Orientation is applied to the pixels first.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new Problem(422, 'invalid_image', 'This file could not be read as an image.');
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
    throw new Problem(415, 'unsupported_image', 'Please upload a JPEG, PNG or WebP image.');
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColorspace('srgb')
      .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new Problem(422, 'invalid_image', 'This image is damaged or too large to process.');
  }
}
