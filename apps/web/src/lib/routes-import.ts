import { simplifyRoute } from '@mapmory/poster-core';

export interface ImportedRoute {
  name: string;
  points: [number, number][];
}

export const MAX_ROUTE_FILE_BYTES = 15 * 1024 * 1024;

export type RouteImportErrorCode = 'too_large' | 'unreadable' | 'no_lines';
export class RouteImportError extends Error {
  constructor(public readonly code: RouteImportErrorCode) {
    super(code);
  }
}

type Pt = [number, number];
const valid = (p: Pt) =>
  Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').slice(0, 60) || 'Route';
const cleanName = (s: string | null | undefined, fallback: string) =>
  (s ?? '')
    .replace(/[\p{Cc}\p{Cs}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || fallback;

/** Direct child element by local name (GPX files come with or without namespaces). */
const child = (el: Element, name: string) => [...el.children].find((c) => c.localName === name);
const all = (el: Element | Document, name: string) => [...el.getElementsByTagNameNS('*', name)];
const pointOf = (el: Element): Pt => [
  Number.parseFloat(el.getAttribute('lon') ?? ''),
  Number.parseFloat(el.getAttribute('lat') ?? ''),
];

/**
 * GPX → one route per track (its segments joined) and one per route. Parsed by the browser's DOMParser, which never
 * resolves external entities; the server only ever receives the resulting coordinates.
 */
export function parseGpx(text: string, fallbackName: string): ImportedRoute[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || doc.documentElement.localName !== 'gpx')
    throw new RouteImportError('unreadable');
  const out: ImportedRoute[] = [];
  const add = (el: Element, pointTag: string, n: number) => {
    const points = all(el, pointTag).map(pointOf).filter(valid);
    out.push({
      name: cleanName(
        child(el, 'name')?.textContent,
        n === 0 ? fallbackName : `${fallbackName} ${n + 1}`,
      ),
      points,
    });
  };
  all(doc, 'trk').forEach((trk, i) => add(trk, 'trkpt', i));
  all(doc, 'rte').forEach((rte, i) => add(rte, 'rtept', out.length + i));
  return out;
}

/** GeoJSON → one route per LineString/MultiLineString feature (parts of a MultiLineString joined). */
export function parseGeoJson(text: string, fallbackName: string): ImportedRoute[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RouteImportError('unreadable');
  }
  const out: ImportedRoute[] = [];
  const geometryLines = (g: unknown): Pt[] | null => {
    if (!g || typeof g !== 'object') return null;
    const { type, coordinates, geometries } = g as {
      type?: string;
      coordinates?: unknown;
      geometries?: unknown[];
    };
    const pts = (c: unknown): Pt[] =>
      Array.isArray(c)
        ? c
            .filter((p) => Array.isArray(p))
            .map((p) => [Number(p[0]), Number(p[1])] as Pt)
            .filter(valid)
        : [];
    if (type === 'LineString') return pts(coordinates);
    if (type === 'MultiLineString' && Array.isArray(coordinates)) return coordinates.flatMap(pts);
    if (type === 'GeometryCollection' && Array.isArray(geometries))
      return geometries.flatMap((x) => geometryLines(x) ?? []);
    return null;
  };
  const visit = (node: unknown, n: number) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as {
      type?: string;
      features?: unknown[];
      geometry?: unknown;
      properties?: { name?: unknown } | null;
    };
    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      obj.features.forEach((f, i) => visit(f, i));
    } else if (obj.type === 'Feature') {
      const points = geometryLines(obj.geometry);
      if (points) {
        const name = typeof obj.properties?.name === 'string' ? obj.properties.name : null;
        out.push({
          name: cleanName(name, n === 0 ? fallbackName : `${fallbackName} ${n + 1}`),
          points,
        });
      }
    } else {
      const points = geometryLines(obj);
      if (points) out.push({ name: fallbackName, points });
    }
  };
  visit(json, 0);
  return out;
}

/**
 * Reads a GPX or GeoJSON file, keeps lines with at least two points and simplifies each to the design's limit.
 * Throws `RouteImportError` with a code the UI can explain.
 */
export async function importRouteFile(file: File): Promise<ImportedRoute[]> {
  if (file.size > MAX_ROUTE_FILE_BYTES) throw new RouteImportError('too_large');
  const text = await file.text();
  const fallback = baseName(file.name);
  const looksXml = /^\s*(<\?xml|<gpx)/i.test(text) || /\.gpx$/i.test(file.name);
  const routes = looksXml ? parseGpx(text, fallback) : parseGeoJson(text, fallback);
  const usable = routes
    .map((r) => ({ ...r, points: simplifyRoute(r.points) }))
    .filter((r) => r.points.length >= 2);
  if (usable.length === 0) throw new RouteImportError('no_lines');
  return usable;
}
