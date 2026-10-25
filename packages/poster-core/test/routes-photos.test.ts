import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { DesignSchema, type Design } from '@mapmory/design-schema';
import {
  buildStyle,
  computeLayout,
  fitRoutesView,
  generateDraft,
  preflight,
  routeFromMarkers,
  routesBounds,
  simplifyRoute,
  styleUpdates,
  toScreen,
} from '../src';
import { draftInput, paris, pontDesArts } from './fixtures';

const endpoints = {
  tilesUrl: 'http://tiles.test/basemap/{z}/{x}/{y}',
  glyphsUrl: 'http://tiles.test/font/{fontstack}/{range}',
};

/** A wiggly 5,000-point track along the Seine. */
const longTrack = Array.from(
  { length: 5000 },
  (_, i) => [2.29 + i * 0.00002, 48.858 + Math.sin(i / 80) * 0.002] as [number, number],
);

const withRoute = (d: Design, style: 'solid' | 'dashed' | 'dotted' = 'dashed'): Design => ({
  ...d,
  routes: [
    {
      id: 'r1',
      name: 'Walk',
      points: simplifyRoute(longTrack),
      color: '#C42B4B',
      widthDu: 4,
      style,
      endpoints: true,
    },
  ],
});

describe('simplifyRoute', () => {
  it('keeps at most 1,000 points, both ends, and the shape', () => {
    const s = simplifyRoute(longTrack);
    expect(s.length).toBeLessThanOrEqual(1000);
    expect(s.length).toBeGreaterThan(50);
    expect(s[0]).toEqual([2.29, 48.858]);
    expect(s.at(-1)).toEqual([
      Number(longTrack.at(-1)![0].toFixed(5)),
      Number(longTrack.at(-1)![1].toFixed(5)),
    ]);
    // Every original point stays within a few metres of the simplified line (metres via a local flat projection).
    const m = (p: [number, number]): [number, number] => [p[0] * 73_200, p[1] * 111_200];
    const toSegment = (p: [number, number], a: [number, number], b: [number, number]) => {
      const [px, py] = m(p),
        [ax, ay] = m(a),
        [bx, by] = m(b);
      const dx = bx - ax,
        dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    const toLine = (p: [number, number]) =>
      Math.min(...s.slice(1).map((q, i) => toSegment(p, s[i]!, q)));
    expect(Math.max(...longTrack.filter((_, i) => i % 25 === 0).map(toLine))).toBeLessThan(5);
  });

  it('drops invalid coordinates and duplicates', () => {
    expect(
      simplifyRoute([
        [2, 48],
        [2, 48],
        [Number.NaN, 1],
        [500, 1],
        [2.1, 48.1],
      ]),
    ).toEqual([
      [2, 48],
      [2.1, 48.1],
    ]);
  });

  it('connects the poster markers in order', () => {
    const d = generateDraft(
      draftInput({
        places: [pontDesArts, { ...paris, id: 'x', type: 'poi', lngLat: [2.2945, 48.8584] }],
      }),
    );
    expect(routeFromMarkers(d)).toEqual([
      [2.33753, 48.85826],
      [2.2945, 48.8584],
    ]);
    expect(routesBounds([{ points: routeFromMarkers(d) }])).toEqual([
      2.2945, 48.85826, 2.33753, 48.8584,
    ]);
  });
});

describe('fitRoutesView', () => {
  it('keeps the whole route inside a round map', () => {
    const base = withRoute(generateDraft(draftInput()));
    for (const shape of ['rect', 'circle', 'heart'] as const) {
      const d = { ...base, map: { ...base.map, shape } };
      const view = fitRoutesView(d)!;
      const placed = { ...d, map: { ...d.map, ...view } };
      const { trimRect, viewport } = computeLayout(placed).map;
      const r = Math.min(trimRect.w, trimRect.h) / 2;
      for (const p of d.routes[0]!.points) {
        const [x, y] = toScreen(p, viewport);
        if (shape === 'rect') {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(trimRect.w);
        } else {
          // Inside the circle (the heart's central area lies inside its circumscribed circle too).
          expect(Math.hypot(x - trimRect.w / 2, y - trimRect.h / 2)).toBeLessThanOrEqual(r);
        }
      }
    }
  });
});

describe('routes in the map style', () => {
  it('produces a valid style with route and endpoint layers above the roads, below the labels', () => {
    const d = withRoute(generateDraft(draftInput()));
    expect(DesignSchema.safeParse(d).success).toBe(true);
    const style = buildStyle(d, endpoints);
    expect(validateStyleMin(style)).toEqual([]);
    const ids = style.layers.map((l) => l.id);
    expect(ids.indexOf('routes-dashed')).toBeGreaterThan(ids.indexOf('roads-highway'));
    expect(ids.indexOf('routes-dashed')).toBeLessThan(ids.indexOf('labels-roads'));
    const data = (style.sources.routes as { data: { features: unknown[] } }).data;
    expect(data.features).toHaveLength(3); // line + start + end
  });

  it('rebuilds the style when routes change', () => {
    const d = generateDraft(draftInput());
    expect(styleUpdates(d, withRoute(d))).toBeNull();
  });
});

describe('free text and photos in the layout', () => {
  it('places a free text at its position with rotation', () => {
    const d = generateDraft(draftInput());
    const free = {
      ...d.texts[0]!,
      id: 'note',
      role: 'custom' as const,
      content: 'Our first kiss',
      slot: 'free' as const,
      freePosition: [300, 400] as [number, number],
      rotationDeg: -10,
      sizeDu: 40,
    };
    const layout = computeLayout({ ...d, texts: [...d.texts, free] });
    const t = layout.texts.find((x) => x.id === 'note')!;
    expect(t.free).toBe(true);
    expect(t.x).toBe(300);
    expect(t.y).toBeCloseTo(400 - (40 * 1.25) / 2);
    expect(t.rotationDeg).toBe(-10);
  });

  it('lays out photos with their frames', () => {
    const d = generateDraft(draftInput());
    const photo = {
      id: 'p1',
      photoId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      center: [500, 600] as [number, number],
      widthDu: 300,
      aspect: 0.75,
      pxWidth: 3000,
      rotationDeg: 5,
      frame: 'polaroid' as const,
      frameColor: '#FFFFFF',
    };
    const p = computeLayout({ ...d, photos: [photo] }).photos[0]!;
    expect([p.x, p.y, p.w, p.h]).toEqual([350, 487.5, 300, 225]);
    expect(p.framePadBottom).toBeGreaterThan(p.framePad);
    const circle = computeLayout({ ...d, photos: [{ ...photo, frame: 'circle' }] }).photos[0]!;
    expect(circle.h).toBe(circle.w);
  });

  it('warns when a photo will print soft', () => {
    const d = generateDraft(draftInput());
    const photo = {
      id: 'p1',
      photoId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      center: [500, 600] as [number, number],
      widthDu: 600,
      aspect: 0.75,
      pxWidth: 640,
      rotationDeg: 0,
      frame: 'none' as const,
      frameColor: '#FFFFFF',
    };
    // A3: 600 du = 178 mm = 7 in → 640 px is about 91 ppi.
    expect(
      preflight({ ...d, photos: [photo] }).some((i) => i.code === 'photo-low-resolution'),
    ).toBe(true);
    expect(
      preflight({ ...d, photos: [{ ...photo, pxWidth: 3000 }] }).some(
        (i) => i.code === 'photo-low-resolution',
      ),
    ).toBe(false);
  });
});
