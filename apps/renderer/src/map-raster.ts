import mbgl from '@maplibre/maplibre-gl-native';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Viewport } from '@mapmory/poster-core';

export interface RasterResult {
  /** Raw RGBA pixels. */
  data: Buffer;
  width: number;
  height: number;
}

export interface MapRasterOptions {
  style: StyleSpecification;
  viewport: Viewport;
  /** Output pixels per logical (design-unit) pixel — the only value that differs from the preview. */
  pixelRatio: number;
  /** Origins the renderer may fetch from (tile server, glyphs). Everything else is refused (SSRF control). */
  allowedOrigins: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Thrown for requests outside the allowlist; surfaces as a failed export, never as a fetch. */
export class BlockedRequestError extends Error {}

/**
 * Renders the map with MapLibre Native. The logical viewport (center/zoom/bearing/size) is identical to the
 * browser preview; only `pixelRatio` changes, so tiles and label placement match (plan §7.1).
 */
export async function renderMapRaster(opts: MapRasterOptions): Promise<RasterResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const doFetch = opts.fetchImpl ?? fetch;
  const width = Math.max(1, Math.round(opts.viewport.width));
  const height = Math.max(1, Math.round(opts.viewport.height));
  const blocked: string[] = [];

  const map = new mbgl.Map({
    ratio: opts.pixelRatio,
    request: (req, callback) => {
      let url: URL;
      try {
        url = new URL(req.url);
      } catch {
        blocked.push(req.url);
        callback(new BlockedRequestError('Invalid URL'));
        return;
      }
      if (!opts.allowedOrigins.includes(url.origin)) {
        blocked.push(url.origin);
        callback(new BlockedRequestError(`Blocked request to ${url.origin}`));
        return;
      }
      doFetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' })
        .then(async (res) => {
          if (res.status === 404 || res.status === 204) return callback();
          if (!res.ok) return callback(new Error(`HTTP ${res.status} for ${url.pathname}`));
          callback(undefined, { data: new Uint8Array(await res.arrayBuffer()) });
        })
        .catch((err: Error) => callback(err));
    },
  });

  try {
    map.load(opts.style as unknown as Parameters<typeof map.load>[0]);
    const data = await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Map render timed out')), timeoutMs);
      map.render(
        {
          zoom: opts.viewport.zoom,
          center: opts.viewport.center,
          bearing: opts.viewport.bearing,
          pitch: 0,
          width,
          height,
        },
        (err, buffer) => {
          clearTimeout(timer);
          if (err || !buffer) reject(err ?? new Error('Empty render result'));
          else resolve(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));
        },
      );
    });
    if (blocked.length > 0) throw new BlockedRequestError(`Blocked requests: ${[...new Set(blocked)].join(', ')}`);
    // MapLibre Native floors the framebuffer size (width * ratio).
    const pxW = Math.floor(width * opts.pixelRatio);
    const pxH = Math.floor(height * opts.pixelRatio);
    if (pxW * pxH * 4 !== data.length) throw new Error(`Unexpected raster size ${data.length} for ${pxW}x${pxH}`);
    return { data, width: pxW, height: pxH };
  } finally {
    map.release();
  }
}
