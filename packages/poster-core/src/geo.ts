import type { PlaceType } from '@mapmory/design-schema';

/** MapLibre's world size is 512 px at zoom 0. */
export const TILE_SIZE = 512;
const MAX_LAT = 85.05112878;

export const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom;

/** Web-Mercator projection to world pixels at the given zoom. */
export function project([lng, lat]: [number, number], zoom: number): [number, number] {
  const ws = worldSize(zoom);
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const phi = (clamped * Math.PI) / 180;
  const x = ((lng + 180) / 360) * ws;
  const y = ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * ws;
  return [x, y];
}

export function unproject([x, y]: [number, number], zoom: number): [number, number] {
  const ws = worldSize(zoom);
  const lng = (x / ws) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / ws;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lng, lat];
}

function rotate([x, y]: [number, number], degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [x * cos - y * sin, x * sin + y * cos];
}

export interface Viewport {
  center: [number, number];
  zoom: number;
  /** Degrees; the compass direction the top of the map faces (MapLibre convention). */
  bearing: number;
  width: number;
  height: number;
}

/** Position of a coordinate inside the viewport, in the viewport's units (design units). */
export function toScreen(lngLat: [number, number], vp: Viewport): [number, number] {
  const c = project(vp.center, vp.zoom);
  const p = project(lngLat, vp.zoom);
  const [rx, ry] = rotate([p[0] - c[0], p[1] - c[1]], -vp.bearing);
  return [vp.width / 2 + rx, vp.height / 2 + ry];
}

export function fromScreen(point: [number, number], vp: Viewport): [number, number] {
  const [dx, dy] = rotate([point[0] - vp.width / 2, point[1] - vp.height / 2], vp.bearing);
  const c = project(vp.center, vp.zoom);
  const [lng, lat] = unproject([c[0] + dx, c[1] + dy], vp.zoom);
  return [wrapLng(lng), lat];
}

/** Moves the center by a screen-space offset (design units), respecting bearing. */
export function offsetCenter(
  center: [number, number],
  zoom: number,
  bearing: number,
  [dx, dy]: [number, number],
): [number, number] {
  const [wx, wy] = rotate([dx, dy], bearing);
  const c = project(center, zoom);
  const [lng, lat] = unproject([c[0] + wx, c[1] + wy], zoom);
  return [wrapLng(lng), lat];
}

export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Fits a [w, s, e, n] box into a viewport of the given size (bearing 0). */
export function fitBounds(
  bbox: [number, number, number, number],
  width: number,
  height: number,
  options: { padding?: number; maxZoom?: number; minZoom?: number } = {},
): { center: [number, number]; zoom: number } {
  const padding = options.padding ?? 0;
  const maxZoom = options.maxZoom ?? 16;
  const minZoom = options.minZoom ?? 1;
  const [w, s, e, n] = bbox;
  const nw = project([w, n], 0);
  const se = project([e, s], 0);
  const spanX = Math.max(se[0] - nw[0], 1e-9);
  const spanY = Math.max(se[1] - nw[1], 1e-9);
  const availW = Math.max(width - 2 * padding, 1);
  const availH = Math.max(height - 2 * padding, 1);
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.log2(Math.min(availW / spanX, availH / spanY))));
  const center = unproject([(nw[0] + se[0]) / 2, (nw[1] + se[1]) / 2], 0);
  return { center, zoom };
}

export function boundsOf(points: [number, number][]): [number, number, number, number] {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** Default zoom for a geocoder result type (plan §9). */
export function zoomForPlaceType(type: PlaceType): number {
  switch (type) {
    case 'poi':
    case 'house':
      return 15.5;
    case 'street':
      return 15;
    case 'district':
      return 14;
    case 'city':
      return 12;
    case 'county':
      return 10;
    case 'state':
      return 8;
    case 'country':
      return 5;
    default:
      return 13;
  }
}
