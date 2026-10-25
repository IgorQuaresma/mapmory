import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DesignSchema, ExportOptionsSchema, InterpretationSchema, migrateDesign, parseDesign, sanitizePlainText } from '../src';
import { sampleDesign } from './sample';

describe('DesignSchema', () => {
  it('accepts the sample design', () => {
    expect(DesignSchema.parse(sampleDesign)).toEqual(sampleDesign);
  });

  it('rejects URLs or unknown ids where only catalog enums are allowed', () => {
    const bad = structuredClone(sampleDesign) as unknown as { map: { themeId: string } };
    bad.map.themeId = 'https://evil.example/style.json';
    expect(DesignSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid colours', () => {
    const bad = structuredClone(sampleDesign);
    bad.page.background = 'red';
    expect(DesignSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects control characters in text', () => {
    const bad = structuredClone(sampleDesign);
    bad.texts[0]!.content = 'Hello\u0000<script>';
    expect(DesignSchema.safeParse(bad).success).toBe(false);
  });

  it('enforces numeric bounds (property-based)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (zoom) => {
        const d = structuredClone(sampleDesign);
        d.map.zoom = zoom;
        expect(DesignSchema.safeParse(d).success).toBe(zoom >= 1 && zoom <= 18);
      }),
    );
  });

  it('limits markers and payload size', () => {
    const d = structuredClone(sampleDesign);
    d.markers = Array.from({ length: 21 }, (_, i) => ({ ...sampleDesign.markers[0]!, id: `m${i}` }));
    expect(DesignSchema.safeParse(d).success).toBe(false);
    expect(() => parseDesign({ ...sampleDesign, junk: 'x'.repeat(200_000) })).toThrow(/exceeds/);
  });

  it('rejects duplicate ids', () => {
    const d = structuredClone(sampleDesign);
    d.texts[1]!.id = d.texts[0]!.id;
    expect(DesignSchema.safeParse(d).success).toBe(false);
  });
});

describe('migrateDesign', () => {
  it('accepts the current version and rejects unknown versions', () => {
    expect(migrateDesign(sampleDesign)).toEqual(sampleDesign);
    expect(() => migrateDesign({ ...sampleDesign, schemaVersion: 99 })).toThrow(/Unsupported/);
  });

  it('upgrades v1 designs: renamed themes and Cormorant Garamond → Fraunces', () => {
    const renames = { forest: 'lavender-field', ocean: 'riviera', midnight: 'night-train', sepia: 'old-letter' } as const;
    for (const [v1, v2] of Object.entries(renames)) {
      const old = {
        ...structuredClone(sampleDesign),
        schemaVersion: 1,
        map: { ...sampleDesign.map, themeId: v1 },
        texts: sampleDesign.texts.map((t, i) => (i === 1 ? { ...t, fontId: 'cormorant-garamond' } : t)),
      };
      const migrated = migrateDesign(old);
      expect(migrated.schemaVersion).toBe(4);
      expect(migrated.map.themeId).toBe(v2);
      expect(migrated.texts[1]!.fontId).toBe('fraunces');
      // Everything else — colours, texts, place — is untouched.
      expect(migrated.map.palette).toEqual(sampleDesign.map.palette);
      expect(migrated.texts[0]).toEqual(sampleDesign.texts[0]);
    }
  });

  it('upgrades v2 designs: no routes or photos, texts in their slots', () => {
    const { routes: _r, photos: _p, sport: _s, ...rest } = structuredClone(sampleDesign);
    const v2 = { ...rest, schemaVersion: 2, texts: rest.texts.map(({ freePosition: _f, rotationDeg: _d, ...t }) => t) };
    const migrated = migrateDesign(v2);
    expect(migrated.routes).toEqual([]);
    expect(migrated.photos).toEqual([]);
    expect(migrated.texts.every((t) => t.freePosition === null && t.rotationDeg === 0)).toBe(true);
    expect(migrated).toEqual(sampleDesign);
  });

  it('keeps unchanged v1 themes', () => {
    const migrated = migrateDesign({ ...structuredClone(sampleDesign), schemaVersion: 1 });
    expect(migrated).toEqual(sampleDesign);
  });
});

describe('routes, photos and free text (v3)', () => {
  const route = { id: 'r1', name: 'Honeymoon', points: [[2.33, 48.85], [2.35, 48.86]] as [number, number][], color: '#C42B4B', widthDu: 4, style: 'dashed' as const, endpoints: true };
  const photo = { id: 'p1', photoId: '0f8fad5b-d9cb-469f-a165-70867728950e', center: [500, 700] as [number, number], widthDu: 300, aspect: 0.75, pxWidth: 3000, rotationDeg: -4, frame: 'polaroid' as const, frameColor: '#FFFFFF' };

  it('accepts routes and photos', () => {
    expect(DesignSchema.safeParse({ ...sampleDesign, routes: [route], photos: [photo] }).success).toBe(true);
  });

  it('rejects photo references that are not ids (no URLs)', () => {
    expect(DesignSchema.safeParse({ ...sampleDesign, photos: [{ ...photo, photoId: 'https://evil.example/x.jpg' }] }).success).toBe(false);
  });

  it('bounds routes', () => {
    expect(DesignSchema.safeParse({ ...sampleDesign, routes: [{ ...route, points: [[2.33, 48.85]] }] }).success).toBe(false);
    expect(DesignSchema.safeParse({ ...sampleDesign, routes: [{ ...route, points: [[200, 48.85], [2, 48]] }] }).success).toBe(false);
    const many = Array.from({ length: 1001 }, (_, i) => [2 + i / 1e4, 48] as [number, number]);
    expect(DesignSchema.safeParse({ ...sampleDesign, routes: [{ ...route, points: many }] }).success).toBe(false);
    expect(DesignSchema.safeParse({ ...sampleDesign, routes: Array.from({ length: 6 }, (_, i) => ({ ...route, id: `r${i}` })) }).success).toBe(false);
  });

  it('requires a position for freely placed text', () => {
    const texts = sampleDesign.texts.map((t, i) => (i === 0 ? { ...t, slot: 'free' as const } : t));
    expect(DesignSchema.safeParse({ ...sampleDesign, texts }).success).toBe(false);
    const placed = texts.map((t, i) => (i === 0 ? { ...t, freePosition: [400, 300] as [number, number], rotationDeg: -12 } : t));
    expect(DesignSchema.safeParse({ ...sampleDesign, texts: placed }).success).toBe(true);
  });
});

describe('race posters (v4)', () => {
  const leg = (id: string, discipline: 'swim' | 'bike' | 'run') => ({
    id, discipline, label: discipline, center: [8.68, 50.11] as [number, number], zoom: 12, bearing: 0, routeId: null, distanceKm: 10, timeS: 3600,
  });
  const sport = {
    event: 'triathlon' as const, layout: 'columns' as const, gapDu: 24, legs: [leg('swim', 'swim'), leg('bike', 'bike'), leg('run', 'run')],
    showStats: true, statsFontId: 'dm-mono' as const, statsSizeDu: 16, statsColor: '#111111', units: 'metric' as const, finishTimeS: 42127,
  };
  const route = { id: 'r1', name: 'Bike', points: [[8.6, 50.1], [8.7, 50.2]] as [number, number][], color: '#E4572E', widthDu: 4, style: 'solid' as const, endpoints: true };

  it('upgrades v3 designs to single-map posters', () => {
    const { sport: _s, ...v3 } = structuredClone(sampleDesign);
    expect(migrateDesign({ ...v3, schemaVersion: 3 })).toEqual(sampleDesign);
  });

  it('accepts one to three legs and checks their routes', () => {
    expect(DesignSchema.safeParse({ ...sampleDesign, sport }).success).toBe(true);
    expect(DesignSchema.safeParse({ ...sampleDesign, sport: { ...sport, legs: [] } }).success).toBe(false);
    expect(DesignSchema.safeParse({ ...sampleDesign, sport: { ...sport, legs: [...sport.legs, leg('run2', 'run')] } }).success).toBe(false);
    const withRoute = { ...sport, legs: sport.legs.map((l) => (l.id === 'bike' ? { ...l, routeId: 'r1' } : l)) };
    expect(DesignSchema.safeParse({ ...sampleDesign, sport: withRoute }).success).toBe(false);
    expect(DesignSchema.safeParse({ ...sampleDesign, routes: [route], sport: withRoute }).success).toBe(true);
    expect(DesignSchema.safeParse({ ...sampleDesign, sport: { ...sport, legs: [leg('a', 'swim'), leg('a', 'run')] } }).success).toBe(false);
    expect(DesignSchema.safeParse({ ...sampleDesign, sport: { ...sport, finishTimeS: -1 } }).success).toBe(false);
  });
});

describe('sanitizePlainText', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(sanitizePlainText('a\u0007b\n\nc', 100)).toBe('a b c');
    expect(sanitizePlainText('x'.repeat(10), 4)).toBe('xxxx');
  });
});

describe('InterpretationSchema', () => {
  it('rejects coordinates or extra structure smuggled into places', () => {
    const r = InterpretationSchema.safeParse({
      language: 'en',
      places: [{ query: 'x', role: 'primary', confidence: 2 }],
      date: { iso: null, precision: 'unknown' },
      mood: 'neutral',
      titleIdeas: [],
      subtitleIdea: null,
    });
    expect(r.success).toBe(false);
  });
});

describe('ExportOptionsSchema', () => {
  it('requires bleed for crop marks and PDF for CMYK', () => {
    expect(ExportOptionsSchema.safeParse({ format: 'pdf', dpi: 300, bleedMm: 0, cropMarks: true, colorProfile: 'srgb' }).success).toBe(false);
    expect(ExportOptionsSchema.safeParse({ format: 'png', dpi: 300, bleedMm: 3, cropMarks: false, colorProfile: 'cmyk-fogra39' }).success).toBe(false);
    expect(ExportOptionsSchema.safeParse({ format: 'pdf', dpi: 300, bleedMm: 3, cropMarks: true, colorProfile: 'cmyk-fogra39' }).success).toBe(true);
    expect(ExportOptionsSchema.safeParse({ format: 'pdf', dpi: 301, bleedMm: 3, cropMarks: false, colorProfile: 'srgb' }).success).toBe(false);
  });
});
