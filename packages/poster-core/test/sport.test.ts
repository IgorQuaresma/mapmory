import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { DesignSchema, type Design } from '@mapmory/design-schema';
import {
  applyTheme,
  buildStyle,
  computeLayout,
  detectRace,
  fitRoutesView,
  formatDistance,
  formatDuration,
  formatPace,
  generateDraft,
  legStats,
  makeRacePoster,
  makeSingleMapPoster,
  preflight,
  styleUpdates,
  toScreen,
} from '../src';
import { draftInput } from './fixtures';

const endpoints = { tilesUrl: 'http://tiles.test/basemap/{z}/{x}/{y}', glyphsUrl: 'http://tiles.test/font/{fontstack}/{range}' };

const ironman = () =>
  generateDraft({
    ...draftInput(),
    title: null,
    sport: {
      event: 'triathlon',
      name: 'Ironman Frankfurt',
      legs: [
        { discipline: 'swim', distanceKm: 3.8, timeS: 3912 },
        { discipline: 'bike', distanceKm: 180, timeS: 20412 },
        { discipline: 'run', distanceKm: 42.2, timeS: 16803 },
      ],
      finishTimeS: 42127,
    },
  });

/** A bike loop north of the venue, assigned to the bike leg. */
const withBikeRoute = (d: Design): Design => {
  const points = Array.from({ length: 60 }, (_, i) => [8.6 + 0.1 * Math.cos(i / 9.5), 50.2 + 0.06 * Math.sin(i / 9.5)] as [number, number]);
  return {
    ...d,
    routes: [{ id: 'bike', name: 'Bike', points, color: '#F0592A', widthDu: 4, style: 'solid', endpoints: true }],
    sport: { ...d.sport!, legs: d.sport!.legs.map((l) => (l.discipline === 'bike' ? { ...l, routeId: 'bike' } : l)) },
  };
};

describe('detectRace', () => {
  it('reads a full-distance triathlon with leg and finish times', () => {
    const race = detectRace('My first Ironman Frankfurt! Swim 1:05:12, bike 5:40:12, run 4:40:03 and finished in 11:42:07.')!;
    expect(race.event).toBe('triathlon');
    expect(race.name).toBe('Ironman Frankfurt');
    expect(race.legs.map((l) => [l.discipline, l.distanceKm, l.timeS])).toEqual([
      ['swim', 3.8, 3912],
      ['bike', 180, 20412],
      ['run', 42.2, 16803],
    ]);
    expect(race.finishTimeS).toBe(42127);
  });

  it('knows the middle, olympic and sprint distances in several languages', () => {
    expect(detectRace('IRONMAN 70.3 Cascais, terminei em 5:32')!.legs.map((l) => l.distanceKm)).toEqual([1.9, 90, 21.1]);
    expect(detectRace('IRONMAN 70.3 Cascais, terminei em 5:32')!.finishTimeS).toBe(5 * 3600 + 32 * 60);
    expect(detectRace('Mein erster Triathlon über die olympische Distanz am Langener Waldsee')!.legs.map((l) => l.distanceKm)).toEqual([1.5, 40, 10]);
    expect(detectRace('Sprint triathlon in Lisbon')!.legs.map((l) => l.distanceKm)).toEqual([0.75, 20, 5]);
    expect(detectRace('Challenge Roth 2024, Langdistanz')!.legs.map((l) => l.distanceKm)).toEqual([3.8, 180, 42.2]);
    expect(detectRace('Challenge Roth 2024')!.name).toBe('Challenge Roth');
  });

  it('does not take a lowercase word for the place after the brand', () => {
    expect(detectRace('my first ironman in Frankfurt')!.name).toBeNull();
  });

  it('reads duathlons, marathons and rides', () => {
    expect(detectRace('Duathlon in Viana do Castelo')!.legs.map((l) => l.discipline)).toEqual(['run', 'bike', 'run']);
    const berlin = detectRace('Ran the Berlin Marathon in 3:58:40 with my sister')!;
    expect(berlin).toMatchObject({ event: 'run', name: 'Berlin Marathon', finishTimeS: 14320 });
    expect(berlin.legs).toEqual([{ discipline: 'run', distanceKm: 42.195, timeS: 14320 }]);
    expect(detectRace('Meia maratona de Lisboa')!.legs[0]!.distanceKm).toBeCloseTo(21.0975);
    expect(detectRace('A 120 km gran fondo through the Dolomites')!).toMatchObject({ event: 'ride', legs: [{ discipline: 'bike', distanceKm: 120 }] });
  });

  it('reads a 58:30 swim as minutes and ignores finish times shorter than the legs', () => {
    const race = detectRace('Triathlon: swim 58:30, bike 2:10, run 1:20, total 1:00')!;
    expect(race.legs[0]!.timeS).toBe(58 * 60 + 30);
    expect(race.finishTimeS).toBe(58 * 60 + 30 + 2 * 3600 + 10 * 60 + 3600 + 20 * 60);
  });

  it('returns null for memories that are not races', () => {
    expect(detectRace('The night we got engaged on the Pont des Arts in Paris')).toBeNull();
    expect(detectRace('Our first apartment in Lisbon, 2019')).toBeNull();
  });
});

describe('race stats', () => {
  it('formats durations, distances and paces', () => {
    expect(formatDuration(42127)).toBe('11:42:07');
    expect(formatDuration(3510)).toBe('58:30');
    expect(formatDistance(3.8, 'swim', 'metric')).toBe('3.8 km');
    expect(formatDistance(1.9, 'swim', 'metric')).toBe('1,900 m');
    expect(formatDistance(180, 'bike', 'metric')).toBe('180 km');
    expect(formatDistance(42.195, 'run', 'imperial')).toBe('26.2 mi');
    expect(formatPace(3.8, 3912, 'swim', 'metric')).toBe('1:43 /100 m');
    expect(formatPace(180, 20412, 'bike', 'metric')).toBe('31.7 km/h');
    expect(formatPace(42.2, 16803, 'run', 'metric')).toBe('6:38 /km');
    expect(legStats({ discipline: 'run', distanceKm: 42.2, timeS: 16803 }, 'metric')).toEqual(['42.2 km · 4:40:03', '6:38 /km']);
    expect(legStats({ discipline: 'run', distanceKm: null, timeS: null }, 'metric')).toEqual([]);
  });
});

describe('race poster layout', () => {
  it('drafts a valid three-panel poster with the event name and finish time', () => {
    const d = ironman();
    expect(DesignSchema.safeParse(d).success).toBe(true);
    expect(d.map.themeId).toBe('race-day');
    expect(d.sport!.legs.map((l) => l.label)).toEqual(['Swim', 'Bike', 'Run']);
    expect(d.texts.find((t) => t.role === 'title')).toMatchObject({ content: 'Ironman Frankfurt', slot: 'top' });
    expect(d.texts.find((t) => t.id === 'finish')).toMatchObject({ content: '11:42:07', slot: 'bottom', visible: true });
    // Swim courses are small, bike courses large: the swim panel is zoomed in furthest.
    const [swim, bike, run] = d.sport!.legs;
    expect(swim!.zoom).toBeGreaterThan(run!.zoom);
    expect(run!.zoom).toBeGreaterThan(bike!.zoom);
  });

  it('labels legs in the poster language', () => {
    const d = generateDraft({ ...draftInput(), locale: 'de', sport: { event: 'triathlon', name: null, legs: [{ discipline: 'swim', distanceKm: null, timeS: null }, { discipline: 'bike', distanceKm: null, timeS: null }, { discipline: 'run', distanceKm: null, timeS: null }], finishTimeS: null } });
    expect(d.sport!.legs.map((l) => l.label)).toEqual(['Schwimmen', 'Rad', 'Laufen']);
    expect(d.texts.some((t) => t.id === 'finish')).toBe(false);
  });

  it('splits the map area into non-overlapping panels with stats underneath', () => {
    for (const layout of ['columns', 'rows', 'hero'] as const) {
      const d = ironman();
      const l = computeLayout({ ...d, sport: { ...d.sport!, layout } });
      expect(l.panels).toHaveLength(3);
      const area = l.map.trimRect;
      for (const [i, p] of l.panels.entries()) {
        const r = p.trimRect;
        expect(r.x).toBeGreaterThanOrEqual(area.x - 1e-6);
        expect(r.x + r.w).toBeLessThanOrEqual(area.x + area.w + 1e-6);
        expect(r.y + r.h + d.sport!.statsSizeDu * 4).toBeLessThanOrEqual(area.y + area.h + 1e-6);
        expect(p.stats!.y).toBeGreaterThan(r.y + r.h);
        for (const q of l.panels.slice(i + 1)) {
          const s = q.trimRect;
          const overlap = r.x < s.x + s.w && s.x < r.x + r.w && r.y < s.y + s.h && s.y < r.y + r.h;
          expect(overlap, `${layout}: panels ${i} and ${q.index}`).toBe(false);
        }
      }
    }
    // Hero: the bike leg (longest) is the large top panel.
    const hero = computeLayout({ ...ironman(), sport: { ...ironman().sport!, layout: 'hero' } });
    expect(hero.panels[1]!.trimRect.w).toBeGreaterThan(hero.panels[0]!.trimRect.w * 1.5);
    expect(hero.panels[1]!.trimRect.y).toBeLessThan(hero.panels[0]!.trimRect.y);
  });

  it('keeps single-map posters exactly as before', () => {
    const d = generateDraft(draftInput());
    const l = computeLayout(d);
    expect(l.panels).toHaveLength(1);
    expect(l.panels[0]!.leg).toBeNull();
    expect(l.map.trimRect).toEqual(l.panels[0]!.trimRect);
    expect(l.map.viewport).toEqual(l.panels[0]!.viewport);
  });

  it('bleeds only panels that touch the trim edge', () => {
    const d = ironman();
    const edge = { ...d, map: { ...d.map, insetDu: { ...d.map.insetDu, left: 0, right: 0 } } };
    const l = computeLayout(edge, { bleedDu: 10 });
    expect(l.panels[0]!.rect.x).toBe(-10);
    expect(l.panels[1]!.rect.x).toBe(l.panels[1]!.trimRect.x);
    expect(l.panels[2]!.rect.x + l.panels[2]!.rect.w).toBeCloseTo(1010);
  });
});

describe('race poster maps', () => {
  it('draws each leg route only in its own panel', () => {
    const d = withBikeRoute(ironman());
    const routeCount = (legId: string) => {
      const style = buildStyle(d, endpoints, legId);
      expect(validateStyleMin(style)).toEqual([]);
      const data = (style.sources.routes as { data: { features: { geometry: { type: string } }[] } }).data;
      return data.features.filter((f) => f.geometry.type === 'LineString').length;
    };
    expect(routeCount('leg2')).toBe(1);
    expect(routeCount('leg1')).toBe(0);
    expect(routeCount('leg3')).toBe(0);
  });

  it('rebuilds the style when a route is assigned to another leg', () => {
    const d = withBikeRoute(ironman());
    const moved = { ...d, sport: { ...d.sport!, legs: d.sport!.legs.map((l) => ({ ...l, routeId: l.discipline === 'run' ? 'bike' : null })) } };
    expect(styleUpdates(d, moved)).toBeNull();
  });

  it('fits a leg panel to its route', () => {
    const d = withBikeRoute(ironman());
    const view = fitRoutesView(d, d.routes, 'leg2')!;
    const placed = { ...d, sport: { ...d.sport!, legs: d.sport!.legs.map((l) => (l.id === 'leg2' ? { ...l, ...view } : l)) } };
    const panel = computeLayout(placed).panels[1]!;
    for (const p of d.routes[0]!.points) {
      const [x, y] = toScreen(p, panel.viewport);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(panel.trimRect.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(panel.trimRect.h);
    }
  });

  it('recolours leg routes and stats with the theme', () => {
    const d = applyTheme(withBikeRoute(ironman()), 'finisher');
    expect(d.routes[0]!.color).toBe('#F2C14E');
    expect(d.sport!.statsColor).toBe('#F2C14E');
    // The finish time keeps the theme's display typeface.
    expect(d.texts.find((t) => t.id === 'finish')).toMatchObject({ fontId: 'montserrat', weight: 800, uppercase: false, letterSpacing: 0.02 });
  });

  it('flags legs without a route and figures wider than their panel', () => {
    const d = withBikeRoute(ironman());
    const codes = (x: Design) => preflight(x).map((i) => `${i.code}:${i.target}`);
    expect(codes(d)).toContain('leg-without-route:leg1');
    expect(codes(d)).not.toContain('leg-without-route:leg2');
    expect(codes(d).some((c) => c.startsWith('stats-too-wide'))).toBe(false);
    expect(codes({ ...d, sport: { ...d.sport!, statsSizeDu: 40 } }).some((c) => c.startsWith('stats-too-wide'))).toBe(true);
  });

  it('switches between a single map and a race poster', () => {
    const single = generateDraft(draftInput());
    const race = makeRacePoster(single, detectRace('Olympic triathlon')!, 'en');
    expect(DesignSchema.safeParse(race).success).toBe(true);
    expect(computeLayout(race).panels).toHaveLength(3);
    expect(race.texts).toEqual(single.texts);
    const back = makeSingleMapPoster(race);
    expect(back.sport).toBeNull();
    expect(back.map.center).toEqual(race.sport!.legs[0]!.center);
  });
});
