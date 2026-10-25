import { MAX_RACE_SECONDS, MAX_ROUTES, MAX_TEXTS, type Design, type Discipline, type DraftSport, type Leg, type Route, type SportEvent } from '@mapmory/design-schema';
import { EVENT_LEGS, fitRoutesView, formatDuration } from '@mapmory/poster-core';
import { clampWeight } from '@mapmory/fonts';
import { disciplineColor, getTheme } from '@mapmory/themes';
import type { ImportedLeg } from '../../lib/activity-import';

/**
 * Parses a race time typed by the user: "11:42:07", "1:05" (h:mm), "58:30" (mm:ss when the first part is 24 or more),
 * or plain minutes ("45"). Returns seconds, `null` for an empty field, or `undefined` when the text is not a time.
 */
export function parseRaceTime(text: string): number | null | undefined {
  const s = text.trim();
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return undefined;
  const n = parts.map(Number);
  let seconds: number;
  if (n.length === 3) {
    if (n[1]! > 59 || n[2]! > 59) return undefined;
    seconds = n[0]! * 3600 + n[1]! * 60 + n[2]!;
  } else if (n.length === 2) {
    if (n[1]! > 59) return undefined;
    seconds = n[0]! >= 24 ? n[0]! * 60 + n[1]! : n[0]! * 3600 + n[1]! * 60;
  } else {
    seconds = n[0]! * 60;
  }
  return seconds <= MAX_RACE_SECONDS ? seconds : undefined;
}

/** The value shown in a time field: "" for no time. */
export const formatRaceTime = (seconds: number | null) => (seconds === null ? '' : formatDuration(seconds));

/** Distances as typed: "3.8" or "3,8". Returns km, `null` when empty, `undefined` when invalid. */
export function parseDistance(text: string): number | null | undefined {
  const s = text.trim().replace(',', '.');
  if (!s) return null;
  if (!/^\d{1,4}(\.\d{0,3})?$/.test(s)) return undefined;
  const v = Number(s);
  return v <= 5000 ? v : undefined;
}

/** Imported distances: two decimals for swims (3.86 km), one for the rest. */
export const roundDistance = (km: number, discipline: Discipline) => Number(km.toFixed(discipline === 'swim' ? 2 : 1));

/** A race with the default legs of an event and no distances or times yet. */
export function emptyRace(event: SportEvent): DraftSport {
  return { event, name: null, legs: EVENT_LEGS[event].map((discipline) => ({ discipline, distanceKm: null, timeS: null })), finishTimeS: null };
}

/** Changes the event of a race found in a memory, keeping what is known about legs of the same discipline. */
export function changeEvent(race: DraftSport, event: SportEvent): DraftSport {
  const pool = [...race.legs];
  const legs = EVENT_LEGS[event].map((discipline) => {
    const i = pool.findIndex((l) => l.discipline === discipline);
    return i === -1 ? { discipline, distanceKm: null, timeS: null } : pool.splice(i, 1)[0]!;
  });
  return { ...race, event, legs };
}

export interface ImportResult {
  design: Design;
  /** Legs that got a route, by leg id. */
  assigned: string[];
  /** Legs the files had nothing for. */
  missing: Leg[];
  /** Some legs could not get a route because the poster already has the maximum number of routes. */
  overLimit: boolean;
}

/**
 * Applies imported activity legs to a race poster: the k-th imported leg of a discipline goes to the k-th poster leg
 * of that discipline. Routes previously shown in leg panels are replaced; other routes stay. Each panel is fitted to
 * its new route, and distances and times are taken from the files.
 */
export function applyImportedLegs(design: Design, imported: ImportedLeg[]): ImportResult {
  const sport = design.sport!;
  const legRouteIds = new Set(sport.legs.map((l) => l.routeId).filter(Boolean));
  const kept = design.routes.filter((r) => !legRouteIds.has(r.id));
  const routes: Route[] = [...kept];
  const pool = [...imported];
  const assigned: string[] = [];
  const missing: Leg[] = [];
  let overLimit = false;

  const legs = sport.legs.map((leg): Leg => {
    const i = pool.findIndex((p) => p.discipline === leg.discipline);
    if (i === -1) {
      missing.push(leg);
      // The leg's old route was removed with the others, so its panel no longer points at it.
      return { ...leg, routeId: null };
    }
    const found = pool.splice(i, 1)[0]!;
    const next: Leg = {
      ...leg,
      routeId: null,
      // Figures already on the poster (official distances, typed splits) win: watch GPS reads swims and courses
      // short or long, so the file only fills what is still empty.
      distanceKm: leg.distanceKm ?? (found.distanceKm !== null ? roundDistance(found.distanceKm, leg.discipline) : null),
      timeS: leg.timeS ?? (found.durationS !== null ? Math.min(MAX_RACE_SECONDS, Math.round(found.durationS)) : null),
    };
    if (found.points.length < 2) return next;
    if (routes.length >= MAX_ROUTES) {
      overLimit = true;
      return next;
    }
    const route: Route = {
      id: uniqueId(`${leg.discipline}`, routes),
      name: (found.name || leg.label).slice(0, 60),
      points: found.points,
      color: disciplineColor(design.map.themeId, leg.discipline),
      widthDu: 4,
      style: 'solid',
      endpoints: true,
    };
    routes.push(route);
    assigned.push(leg.id);
    return { ...next, routeId: route.id };
  });

  let result: Design = { ...design, routes, sport: { ...sport, legs } };
  // Fit each panel to its route (fitting needs the final layout, so this runs after the legs are set).
  result = {
    ...result,
    sport: {
      ...result.sport!,
      legs: result.sport!.legs.map((leg) => {
        const route = leg.routeId && routes.find((r) => r.id === leg.routeId);
        const view = route ? fitRoutesView(result, [route], leg.id) : null;
        return view ? { ...leg, ...view } : leg;
      }),
    },
  };
  const times = result.sport!.legs.map((l) => l.timeS);
  if (result.sport!.finishTimeS === null && times.every((x) => x !== null)) {
    result = withFinishTime(result, Math.min(MAX_RACE_SECONDS, times.reduce((a, b) => a! + b!, 0)!));
  }
  return { design: result, assigned, missing, overLimit };
}

function uniqueId(prefix: string, existing: { id: string }[]) {
  if (!existing.some((e) => e.id === prefix)) return prefix;
  let i = 2;
  while (existing.some((e) => e.id === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/**
 * Sets the finish time and the large finish-time text on the poster (id `finish`, made by the race draft): the text
 * follows the time, is hidden when the time is cleared, and is added below the map when there is none yet.
 */
export function withFinishTime(design: Design, finishTimeS: number | null): Design {
  if (!design.sport) return design;
  const sport = { ...design.sport, finishTimeS };
  const existing = design.texts.find((t) => t.id === 'finish');
  if (existing) {
    const texts = design.texts.map((t) => (t.id === 'finish' ? (finishTimeS === null ? { ...t, visible: false } : { ...t, content: formatDuration(finishTimeS), visible: true }) : t));
    return { ...design, sport, texts };
  }
  if (finishTimeS === null || design.texts.length >= MAX_TEXTS) return { ...design, sport };
  const { title } = getTheme(design.map.themeId).typography;
  const base = design.texts.find((t) => t.role === 'date') ?? design.texts[0];
  if (!base) return { ...design, sport };
  const text = {
    ...base,
    id: 'finish',
    role: 'custom' as const,
    content: formatDuration(finishTimeS),
    fontId: title.fontId,
    weight: clampWeight(title.fontId, title.weight),
    sizeDu: 76,
    letterSpacing: 0.02,
    uppercase: false,
    slot: 'bottom' as const,
    order: 1,
    offsetDu: [0, 0] as [number, number],
    visible: true,
    freePosition: null,
    rotationDeg: 0,
  };
  return { ...design, sport, texts: [...design.texts, text] };
}
