import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CORNERS, DISCIPLINES, EXPORT_FORMATS, PANEL_LAYOUTS, PHOTO_FRAMES, SPORT_EVENTS, ROUTE_STYLES, EXPORT_STATUSES, FRAME_STYLES, LABEL_LANGUAGES, MAP_SHAPES, MARKER_ICONS, MOODS, TEXT_ROLES, TEXT_SLOTS, THEME_IDS, LAYER_KEYS, PALETTE_KEYS } from '@mapmory/design-schema';
import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { pt } from './pt';

const flatten = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });

describe('i18n resources', () => {
  const enKeys = new Set(flatten(en).map((k) => k.replace(/_(one|other)$/, '')));
  const deKeys = new Set(flatten(de).map((k) => k.replace(/_(one|other)$/, '')));

  const ptKeys = new Set(flatten(pt).map((k) => k.replace(/_(one|other)$/, '')));

  it('German has exactly the English keys', () => {
    expect([...enKeys].filter((k) => !deKeys.has(k))).toEqual([]);
    expect([...deKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('Portuguese has exactly the English keys', () => {
    expect([...enKeys].filter((k) => !ptKeys.has(k))).toEqual([]);
    expect([...ptKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('translations keep every placeholder', () => {
    const values = (o: object, prefix = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v ? values(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)] as [string, string]]));
    const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const enValues = new Map(values(en));
    for (const [name, res] of [['de', de], ['pt', pt]] as const) {
      const wrong = values(res).filter(([k, v]) => JSON.stringify(placeholders(v)) !== JSON.stringify(placeholders(enValues.get(k) ?? '')));
      expect(wrong.map(([k]) => `${name}:${k}`)).toEqual([]);
    }
  });

  it('every static key used in the code exists', () => {
    const src = path.resolve(__dirname, '..');
    const used = new Set<string>();
    for (const f of files(src)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.-]+)'/g)) used.add(m[1]!);
    }
    expect([...used].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('dynamic key families cover every enum value', () => {
    const families: [string, readonly (string | number)[]][] = [
      ['themes', THEME_IDS], ['moods', MOODS], ['shapes', MAP_SHAPES], ['icons', MARKER_ICONS], ['frames', FRAME_STYLES],
      ['slots', TEXT_SLOTS], ['corners', CORNERS], ['languages', LABEL_LANGUAGES], ['export.status', EXPORT_STATUSES],
      ['editor.text.roles', TEXT_ROLES], ['editor.style.layer', LAYER_KEYS], ['editor.style.palette', PALETTE_KEYS],
      ['editor.routes.styles', ROUTE_STYLES], ['editor.photos.frames', PHOTO_FRAMES],
      ['editor.routes.errors', ['too_large', 'unreadable', 'no_lines']],
      ['editor.photos.errors', ['unsupported_image', 'invalid_image', 'photo_limit', 'payload_too_large', 'generic']],
      ['weights', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
      ['race.events', SPORT_EVENTS], ['race.disciplines', DISCIPLINES], ['race.layouts', PANEL_LAYOUTS],
      ['race.import.errors', ['too_large', 'unreadable', 'no_lines']],
      ['preflight', ['text-outside-safe-zone', 'text-too-wide', 'low-contrast', 'text-too-small', 'low-dpi', 'exceeds-max-size', 'empty-title', 'marker-outside-map', 'photo-low-resolution', 'leg-without-route', 'stats-too-wide']],
    ];
    const missing = families.flatMap(([f, values]) => values.map((v) => `${f}.${v}`)).filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
    expect(EXPORT_FORMATS.filter((f) => !enKeys.has(`export.formats.${f}.name`))).toEqual([]);
  });
});
