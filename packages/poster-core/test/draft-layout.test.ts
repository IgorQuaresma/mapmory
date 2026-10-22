import { describe, expect, it } from 'vitest';
import { DesignSchema, THEME_IDS } from '@mapmory/design-schema';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  applyTheme,
  buildStyle,
  canonicalJson,
  changePaper,
  computeLayout,
  exportGeometry,
  formatCoordinates,
  formatDate,
  generateDraft,
  preflight,
  shapePath,
  styleUpdates,
} from '../src';
import { draftInput, paris, pontDesArts } from './fixtures';

const endpoints = { tilesUrl: 'http://tiles.test/basemap/{z}/{x}/{y}', glyphsUrl: 'http://tiles.test/font/{fontstack}/{range}' };

describe('generateDraft', () => {
  it('is deterministic and schema-valid', () => {
    const a = generateDraft(draftInput());
    const b = generateDraft(draftInput());
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(DesignSchema.safeParse(a).success).toBe(true);
  });

  it('maps mood to theme and marker', () => {
    const d = generateDraft(draftInput({ mood: 'celebratory' }));
    expect(d.map.themeId).toBe('gold-ink');
    expect(d.markers[0]!.icon).toBe('star');
  });

  it('uses POI zoom for a single point and fits city bounds', () => {
    expect(generateDraft(draftInput()).map.zoom).toBe(15.5);
    const city = generateDraft(draftInput({ places: [paris] }));
    expect(city.map.zoom).toBeGreaterThan(10);
    expect(city.map.zoom).toBeLessThan(13);
  });

  it('fits several places with markers for each', () => {
    const d = generateDraft(draftInput({ places: [pontDesArts, { ...paris, lngLat: [2.2945, 48.8584], id: 'x', type: 'poi', name: 'Eiffel Tower' }] }));
    expect(d.markers).toHaveLength(2);
    const layout = computeLayout(d);
    for (const m of layout.markers) expect(m.insideMap).toBe(true);
  });

  it('fills texts from the input', () => {
    const d = generateDraft(draftInput());
    expect(d.texts.find((t) => t.id === 'title')!.content).toBe('Where it all began');
    expect(d.texts.find((t) => t.id === 'date')!.content).toBe('June 14, 2019');
    expect(d.texts.find((t) => t.id === 'subtitle')!.content).toBe('Paris, France');
  });

  it('shrinks long or letter-spaced titles to fit the page width', () => {
    const d = generateDraft(draftInput({ mood: 'bittersweet', title: 'Where it all began, forever and always' }));
    const title = computeLayout(d).texts.find((t) => t.id === 'title')!;
    expect(title.sizeDu).toBeLessThan(64);
    expect(preflight(d).some((i) => i.code === 'text-too-wide')).toBe(false);
  });

  it('falls back to the place name when there is no title', () => {
    const d = generateDraft(draftInput({ title: null }));
    expect(d.texts[0]!.content).toBe('Pont des Arts');
  });
});

describe('buildStyle', () => {
  it.each(THEME_IDS)('produces a valid MapLibre style for %s', (themeId) => {
    const d = applyTheme(generateDraft(draftInput()), themeId);
    const style = buildStyle({ ...d, map: { ...d.map, layers: { ...d.map.layers, labels: true } } }, endpoints);
    expect(validateStyleMin(style)).toEqual([]);
    expect(JSON.stringify(style)).not.toContain('sprite');
  });

  it('only references configured endpoints', () => {
    const style = buildStyle(generateDraft(draftInput()), endpoints);
    const urls = JSON.stringify(style).match(/https?:\/\/[^"]+/g) ?? [];
    for (const u of urls) expect(u.startsWith('http://tiles.test/')).toBe(true);
  });
});

describe('styleUpdates', () => {
  it('returns paint ops for palette changes and null for theme changes', () => {
    const a = generateDraft(draftInput());
    const b = { ...a, map: { ...a.map, palette: { ...a.map.palette, roads: '#FF0000' } } };
    expect(styleUpdates(a, b)).toEqual([
      { kind: 'paint', layer: 'roads-major', property: 'line-color', value: '#FF0000' },
      { kind: 'paint', layer: 'roads-highway', property: 'line-color', value: '#FF0000' },
    ]);
    expect(styleUpdates(a, applyTheme(a, 'night-train'))).toBeNull();
  });

  it('updates the background when water is toggled', () => {
    const a = generateDraft(draftInput());
    const b = { ...a, map: { ...a.map, layers: { ...a.map.layers, water: false } } };
    const ops = styleUpdates(a, b)!;
    expect(ops).toContainEqual({ kind: 'paint', layer: 'background', property: 'background-color', value: a.map.palette.land });
  });
});

describe('layout', () => {
  it('stacks bottom texts inside the band below the map', () => {
    const d = generateDraft(draftInput());
    const layout = computeLayout(d);
    const mapBottom = layout.map.trimRect.y + layout.map.trimRect.h;
    for (const t of layout.texts) {
      expect(t.y).toBeGreaterThanOrEqual(mapBottom);
      expect(t.y + t.lineHeightDu).toBeLessThanOrEqual(layout.page.h - d.page.marginDu);
    }
    const ys = layout.texts.map((t) => t.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });

  it('extends a full-bleed rect map into the bleed and keeps the trim geography', () => {
    const base = generateDraft(draftInput());
    const d = { ...base, map: { ...base.map, shape: 'rect' as const, insetDu: { top: 0, right: 0, bottom: 300, left: 0 } } };
    const plain = computeLayout(d);
    const bled = computeLayout(d, { bleedDu: 10 });
    expect(bled.map.rect).toEqual({ x: -10, y: -10, w: 1020, h: plain.map.trimRect.h + 10 });
    // The marker stays at the same page position with and without bleed.
    expect(bled.markers[0]!.x).toBeCloseTo(plain.markers[0]!.x, 6);
    expect(bled.markers[0]!.y).toBeCloseTo(plain.markers[0]!.y, 6);
  });

  it('never bleeds non-rectangular shapes', () => {
    const base = generateDraft(draftInput());
    const d = { ...base, map: { ...base.map, shape: 'circle' as const, insetDu: { top: 0, right: 0, bottom: 300, left: 0 } } };
    expect(computeLayout(d, { bleedDu: 10 }).map.rect.x).toBe(0);
  });
});

describe('paper and export geometry', () => {
  it('A0 at 300 DPI with 3 mm bleed matches the plan', () => {
    const d = changePaper(generateDraft(draftInput()), 'A0', 'portrait');
    const g = exportGeometry(d, { dpi: 300, bleedMm: 3, cropMarks: false });
    expect(g.pagePx).toEqual({ w: 10004, h: 14114 });
    expect(g.exceedsLimit).toBe(false);
    expect(g.pxPerDu).toBeCloseTo(9.933, 2);
  });

  it('scales proportionally between sizes with the same aspect ratio', () => {
    const a4 = changePaper(generateDraft(draftInput()), 'A4', 'portrait');
    const a2 = changePaper(a4, 'A2', 'portrait');
    const pick = (l: ReturnType<typeof computeLayout>) => ({ map: l.map, texts: l.texts, markers: l.markers, frame: l.frame });
    // Only physically-sized elements (safe zone, attribution) differ between sizes.
    expect(pick(computeLayout(a4))).toEqual(pick(computeLayout(a2)));
  });

  it('re-flows landscape so the map keeps a usable height', () => {
    const d = changePaper(generateDraft(draftInput()), 'A3', 'landscape');
    expect(DesignSchema.safeParse(d).success).toBe(true);
    expect(computeLayout(d).map.trimRect.h).toBeGreaterThanOrEqual(120);
  });

  it('flags renders beyond the pixel cap', () => {
    const page = { trimMm: { w: 1000, h: 1400 } } as Parameters<typeof exportGeometry>[0]['page'];
    expect(exportGeometry({ page }, { dpi: 300, bleedMm: 0, cropMarks: false }).exceedsLimit).toBe(true);
    expect(exportGeometry({ page }, { dpi: 200, bleedMm: 0, cropMarks: false }).exceedsLimit).toBe(false);
  });
});

describe('preflight', () => {
  it('passes a fresh draft without errors', () => {
    const issues = preflight(generateDraft(draftInput()), { dpi: 300, bleedMm: 3, cropMarks: false });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('detects low contrast', () => {
    const d = generateDraft(draftInput());
    d.texts[0]!.color = d.page.background;
    expect(preflight(d).some((i) => i.code === 'low-contrast' && i.target === 'title')).toBe(true);
  });
});

describe('format', () => {
  it('formats coordinates', () => {
    expect(formatCoordinates([2.33753, 48.85826])).toBe('48.8583° N, 2.3375° E');
    expect(formatCoordinates([-74.0445, 40.6892], 'dms')).toBe('40°41′21″ N  74°02′40″ W');
  });
  it('formats dates by precision and locale', () => {
    expect(formatDate({ iso: '2019-06-14', precision: 'day' }, 'de')).toBe('14. Juni 2019');
    expect(formatDate({ iso: '2019-06', precision: 'month' }, 'en')).toBe('June 2019');
    expect(formatDate({ iso: null, precision: 'unknown' }, 'en')).toBe('');
  });
});

describe('shapes', () => {
  it('produces closed paths for every shape', () => {
    for (const s of ['rect', 'rounded', 'circle', 'heart', 'arch'] as const) {
      expect(shapePath(s, 880, 1000)).toMatch(/^M.*Z$/);
    }
  });
});
