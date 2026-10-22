import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fitBounds, fromScreen, offsetCenter, project, toScreen, unproject } from '../src/geo';

describe('mercator', () => {
  it('round-trips project/unproject', () => {
    fc.assert(
      fc.property(fc.double({ min: -179, max: 179, noNaN: true }), fc.double({ min: -84, max: 84, noNaN: true }), fc.double({ min: 0, max: 18, noNaN: true }), (lng, lat, z) => {
        const [x, y] = unproject(project([lng, lat], z), z);
        expect(x).toBeCloseTo(lng, 6);
        expect(y).toBeCloseTo(lat, 6);
      }),
    );
  });

  it('places the center in the middle of the viewport', () => {
    const vp = { center: [2.33, 48.85] as [number, number], zoom: 14, bearing: 33, width: 880, height: 1054 };
    const [x, y] = toScreen(vp.center, vp);
    expect(x).toBeCloseTo(440);
    expect(y).toBeCloseTo(527);
  });

  it('rotates with bearing like MapLibre (bearing 90: east is up)', () => {
    const vp = { center: [0, 0] as [number, number], zoom: 10, bearing: 90, width: 100, height: 100 };
    const [x, y] = toScreen([0.01, 0], vp);
    expect(x).toBeCloseTo(50, 3);
    expect(y).toBeLessThan(50);
  });

  it('fromScreen inverts toScreen', () => {
    const vp = { center: [-9.14, 38.72] as [number, number], zoom: 13.4, bearing: -20, width: 880, height: 900 };
    const ll = fromScreen([123, 456], vp);
    const [x, y] = toScreen(ll, vp);
    expect(x).toBeCloseTo(123, 6);
    expect(y).toBeCloseTo(456, 6);
  });

  it('offsetCenter moves the centre by a screen offset', () => {
    const c = offsetCenter([2.33, 48.85], 14, 0, [100, 0]);
    const [x] = toScreen(c, { center: [2.33, 48.85], zoom: 14, bearing: 0, width: 0, height: 0 });
    expect(x).toBeCloseTo(100, 6);
  });

  it('fitBounds keeps the box inside the viewport', () => {
    const bbox: [number, number, number, number] = [2.22, 48.81, 2.47, 48.9];
    const { center, zoom } = fitBounds(bbox, 880, 1000, { padding: 20 });
    const vp = { center, zoom, bearing: 0, width: 880, height: 1000 };
    const [x1, y1] = toScreen([bbox[0], bbox[3]], vp);
    const [x2, y2] = toScreen([bbox[2], bbox[1]], vp);
    expect(x1).toBeGreaterThanOrEqual(19.9);
    expect(y1).toBeGreaterThanOrEqual(19.9);
    expect(x2).toBeLessThanOrEqual(860.1);
    expect(y2).toBeLessThanOrEqual(980.1);
  });
});
