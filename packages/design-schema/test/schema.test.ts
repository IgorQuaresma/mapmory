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
    expect(() => parseDesign({ ...sampleDesign, junk: 'x'.repeat(70_000) })).toThrow(/exceeds/);
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
      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.map.themeId).toBe(v2);
      expect(migrated.texts[1]!.fontId).toBe('fraunces');
      // Everything else — colours, texts, place — is untouched.
      expect(migrated.map.palette).toEqual(sampleDesign.map.palette);
      expect(migrated.texts[0]).toEqual(sampleDesign.texts[0]);
    }
  });

  it('keeps unchanged v1 themes', () => {
    const migrated = migrateDesign({ ...structuredClone(sampleDesign), schemaVersion: 1 });
    expect(migrated).toEqual(sampleDesign);
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
