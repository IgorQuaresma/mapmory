import { MAX_ROUTE_POINTS, type Design, type Route } from '@mapmory/design-schema';
import { project } from './geo';
import { computeLayout } from './layout';
import { fitView } from './sport';

type Pt = [number, number];
const round5 = (p: Pt): Pt => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))];

/** Perpendicular distance from p to segment ab, in world pixels at zoom 20 (≈ 0.1 m). */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return Math.hypot(p[0] - x, p[1] - y);
}

/** Ramer–Douglas–Peucker on projected coordinates; iterative to stay safe on long tracks. */
function rdp(points: Pt[], projected: Pt[], tolerance: number): Pt[] {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let index = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistance(projected[i]!, projected[s]!, projected[e]!);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1 && max > tolerance) {
      keep[index] = 1;
      stack.push([s, index], [index, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Reduces a track to at most `maxPoints` points while keeping its shape, and rounds coordinates to ~1 m.
 * Invalid coordinates are dropped. Used before a GPX or GeoJSON track is stored in a design.
 */
export function simplifyRoute(input: Pt[], maxPoints = MAX_ROUTE_POINTS): Pt[] {
  const points = input
    .filter(
      (p) =>
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 85.05,
    )
    .map(round5)
    .filter((p, i, all) => i === 0 || p[0] !== all[i - 1]![0] || p[1] !== all[i - 1]![1]);
  if (points.length <= maxPoints) return points;
  const projected = points.map((p) => project(p, 20));
  let tolerance = 2;
  let result = rdp(points, projected, tolerance);
  while (result.length > maxPoints) {
    tolerance *= 1.6;
    result = rdp(points, projected, tolerance);
  }
  return result;
}

/** A straight route connecting the poster's markers in order ("connect my places"). */
export function routeFromMarkers(design: Pick<Design, 'markers'>): Pt[] {
  return design.markers.map((m) => round5(m.lngLat));
}

/** [w, s, e, n] around every route point, or null when there are no routes. */
export function routesBounds(
  routes: Pick<Route, 'points'>[],
): [number, number, number, number] | null {
  const all = routes.flatMap((r) => r.points);
  if (all.length === 0) return null;
  const lngs = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/**
 * Map view that frames the routes inside the *visible* map: for a circle the inscribed square, for a heart its
 * central area, for an arch the area below the curve (round and heart maps would otherwise cut route ends off).
 * On a race poster, pass `legId` to frame that leg's panel.
 */
export function fitRoutesView(
  design: Design,
  routes: Pick<Route, 'points'>[] = design.routes,
  legId: string | null = null,
) {
  const bbox = routesBounds(routes);
  if (!bbox) return null;
  const layout = computeLayout(design);
  const panel = layout.panels.find((p) => p.leg?.id === legId) ?? layout.panels[0]!;
  return fitView(bbox, panel.trimRect.w, panel.trimRect.h, design.map.shape);
}
