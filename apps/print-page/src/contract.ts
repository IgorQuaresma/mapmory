import type { Design } from '@mapmory/design-schema';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

/** Data the renderer injects before the page loads (Playwright `addInitScript`). */
export interface PrintPayload {
  mode: 'print' | 'live';
  design: Design;
  bleedDu: number;
  slugDu: number;
  pageMm: { w: number; h: number };
  cropMarks: boolean;
  /**
   * print mode: URLs of the pre-rendered map rasters, one per map panel (served by the renderer's request
   * interception).
   */
  mapImageUrls?: string[];
  /** live mode (parity tests): style + pixel ratio for MapLibre GL JS. */
  style?: StyleSpecification;
  pixelRatio?: number;
}

declare global {
  interface Window {
    __MAPMORY_PRINT__?: PrintPayload;
    __MAPMORY_READY__?: boolean;
    __MAPMORY_ERROR__?: string;
  }
}
