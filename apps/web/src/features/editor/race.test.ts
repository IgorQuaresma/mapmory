import { DesignSchema, type Design } from '@mapmory/design-schema';
import { computeLayout, generateDraft, toScreen } from '@mapmory/poster-core';
import { describe, expect, it } from 'vitest';
import { FIXTURE_PLACES, toResult } from '../../api/fixtures';
import type { ImportedLeg } from '../../lib/activity-import';
import { applyImportedLegs, changeEvent, emptyRace, formatRaceTime, parseDistance, parseRaceTime, withFinishTime } from './race';

const frankfurt = toResult(FIXTURE_PLACES.find((p) => p.id === 'R62400')!);
const racePoster = (event: 'triathlon' | 'duathlon' = 'triathlon'): Design =>
  generateDraft({ places: [frankfurt], title: null, subtitle: null, date: { iso: null, precision: 'unknown' }, mood: 'celebratory', locale: 'en', sport: emptyRace(event) });

/** A small loop of `n` points around [lng, lat] with radius r (degrees). */
const loop = (lng: number, lat: number, r: number, n = 40) =>
  Array.from({ length: n }, (_, i) => [Number((lng + r * Math.cos((2 * Math.PI * i) / n)).toFixed(5)), Number((lat + (r / 1.6) * Math.sin((2 * Math.PI * i) / n)).toFixed(5))] as [number, number]);

const leg = (discipline: ImportedLeg['discipline'], points: [number, number][], distanceKm: number | null, durationS: number | null): ImportedLeg => ({
  discipline, name: '', points, distanceKm, durationS, source: 'file',
});

describe('race time and distance input', () => {
  it('parses h:mm:ss, h:mm, mm:ss and minutes', () => {
    expect(parseRaceTime('11:42:07')).toBe(42127);
    expect(parseRaceTime('1:05')).toBe(3900);
    expect(parseRaceTime('58:30')).toBe(3510);
    expect(parseRaceTime('45')).toBe(2700);
    expect(parseRaceTime('  ')).toBeNull();
    expect(parseRaceTime('1:75:00')).toBeUndefined();
    expect(parseRaceTime('abc')).toBeUndefined();
    expect(parseRaceTime('1:2:3:4')).toBeUndefined();
    expect(formatRaceTime(42127)).toBe('11:42:07');
    expect(formatRaceTime(null)).toBe('');
  });

  it('parses distances with a decimal point or comma', () => {
    expect(parseDistance('3.8')).toBe(3.8);
    expect(parseDistance('3,8')).toBe(3.8);
    expect(parseDistance('')).toBeNull();
    expect(parseDistance('-1')).toBeUndefined();
    expect(parseDistance('99999')).toBeUndefined();
  });

  it('changes the event and keeps what is known about matching legs', () => {
    const race = { ...emptyRace('triathlon'), legs: [{ discipline: 'swim' as const, distanceKm: 1.9, timeS: 2000 }, { discipline: 'bike' as const, distanceKm: 90, timeS: null }, { discipline: 'run' as const, distanceKm: 21.1, timeS: 6000 }] };
    expect(changeEvent(race, 'duathlon').legs).toEqual([
      { discipline: 'run', distanceKm: 21.1, timeS: 6000 },
      { discipline: 'bike', distanceKm: 90, timeS: null },
      { discipline: 'run', distanceKm: null, timeS: null },
    ]);
    expect(changeEvent(race, 'run').legs).toHaveLength(1);
  });
});

describe('applyImportedLegs', () => {
  const imported = [
    leg('swim', loop(8.66, 50.06, 0.004), 3.856, 3912),
    leg('bike', loop(8.68, 50.15, 0.12), 180.44, 20412),
    leg('run', loop(8.69, 50.11, 0.03), 42.31, 16803),
  ];

  it('keeps official distances and typed splits, and fills only what is empty', () => {
    const base = racePoster();
    const official = { ...base, sport: { ...base.sport!, legs: base.sport!.legs.map((l, i) => (i === 0 ? { ...l, distanceKm: 3.8, timeS: 3900 } : l)) } };
    const { design } = applyImportedLegs(official, imported);
    expect(design.sport!.legs.map((l) => [l.distanceKm, l.timeS])).toEqual([
      [3.8, 3900],
      [180.4, 20412],
      [42.3, 16803],
    ]);
  });

  it('gives every leg its route, distance and time, fits each panel and sets the finish time', () => {
    const { design, assigned, missing, overLimit } = applyImportedLegs(racePoster(), imported);
    expect(DesignSchema.safeParse(design).success).toBe(true);
    expect([assigned, missing, overLimit]).toEqual([['leg1', 'leg2', 'leg3'], [], false]);
    expect(design.routes.map((r) => r.id)).toEqual(['swim', 'bike', 'run']);
    expect(design.routes.map((r) => r.color)).toEqual(['#0077C8', '#F0592A', '#00A36C']);
    expect(design.sport!.legs.map((l) => [l.routeId, l.distanceKm, l.timeS])).toEqual([
      ['swim', 3.86, 3912],
      ['bike', 180.4, 20412],
      ['run', 42.3, 16803],
    ]);
    expect(design.sport!.finishTimeS).toBe(3912 + 20412 + 16803);
    expect(design.texts.find((t) => t.id === 'finish')).toMatchObject({ content: '11:25:27', visible: true });
    // Every route lies inside its own panel.
    const layout = computeLayout(design);
    for (const p of layout.panels) {
      const route = design.routes.find((r) => r.id === p.leg!.routeId)!;
      for (const pt of route.points) {
        const [x, y] = toScreen(pt, p.viewport);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(p.trimRect.w);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(p.trimRect.h);
      }
    }
  });

  it('matches repeated disciplines in order (duathlon run, bike, run)', () => {
    const du = applyImportedLegs(racePoster('duathlon'), [leg('run', loop(8.6, 50.1, 0.02), 10, 2400), leg('bike', loop(8.6, 50.1, 0.1), 40, 3900), leg('run', loop(8.6, 50.1, 0.01), 5, 1300)]);
    expect(du.design.sport!.legs.map((l) => [l.discipline, l.routeId, l.distanceKm])).toEqual([
      ['run', 'run', 10],
      ['bike', 'bike', 40],
      ['run', 'run2', 5],
    ]);
  });

  it('reports legs the files had nothing for and keeps a pool swim without GPS', () => {
    const r = applyImportedLegs(racePoster(), [leg('swim', [], 3.8, 3900), imported[1]!]);
    expect(r.missing.map((l) => l.discipline)).toEqual(['run']);
    expect(r.design.sport!.legs[0]).toMatchObject({ routeId: null, distanceKm: 3.8, timeS: 3900 });
    expect(r.design.sport!.legs[1]!.routeId).toBe('bike');
    expect(r.design.sport!.finishTimeS).toBeNull();
  });

  it('replaces earlier leg routes, keeps other routes and respects the route limit', () => {
    const first = applyImportedLegs(racePoster(), imported).design;
    const extra = (id: string) => ({ id, name: id, points: loop(8.7, 50.1, 0.01), color: '#000000', widthDu: 3, style: 'dashed' as const, endpoints: false });
    const withOthers = { ...first, routes: [...first.routes, extra('x1')] };
    const again = applyImportedLegs(withOthers, imported);
    expect(again.design.routes.map((r) => r.id)).toEqual(['x1', 'swim', 'bike', 'run']);
    const crowded = { ...first, routes: [...first.routes, extra('x1'), extra('x2')], sport: { ...first.sport!, legs: first.sport!.legs.map((l) => ({ ...l, routeId: null })) } };
    const full = applyImportedLegs(crowded, imported);
    expect(full.overLimit).toBe(true);
    expect(full.design.routes).toHaveLength(5);
    expect(DesignSchema.safeParse(full.design).success).toBe(true);
  });
});

describe('withFinishTime', () => {
  it('updates, hides and adds the finish-time text', () => {
    const d = racePoster();
    expect(d.texts.some((t) => t.id === 'finish')).toBe(false);
    const added = withFinishTime(d, 3600 * 4 + 5);
    expect(added.texts.find((t) => t.id === 'finish')).toMatchObject({ content: '4:00:05', slot: 'bottom', visible: true });
    expect(DesignSchema.safeParse(added).success).toBe(true);
    expect(withFinishTime(added, null).texts.find((t) => t.id === 'finish')!.visible).toBe(false);
    expect(withFinishTime(added, 60).texts.find((t) => t.id === 'finish')!.content).toBe('1:00');
  });
});
