import type {
  Design,
  Discipline,
  DraftSport,
  Leg,
  MapShape,
  Route,
  Sport,
  SportEvent,
} from '@mapmory/design-schema';
import { fitBounds } from './geo';

/** Legs of each race format, in race order. */
export const EVENT_LEGS: Record<SportEvent, Discipline[]> = {
  triathlon: ['swim', 'bike', 'run'],
  duathlon: ['run', 'bike', 'run'],
  aquathlon: ['swim', 'run'],
  run: ['run'],
  ride: ['bike'],
  swim: ['swim'],
};

/** Standard distances (km) of the common race formats. */
export const RACE_DISTANCES = {
  'tri-full': [3.8, 180, 42.2],
  'tri-middle': [1.9, 90, 21.1],
  'tri-olympic': [1.5, 40, 10],
  'tri-sprint': [0.75, 20, 5],
  'du-standard': [10, 40, 5],
  'du-sprint': [5, 20, 2.5],
  aquathlon: [1, 5],
  marathon: [42.195],
  'half-marathon': [21.0975],
} as const;

const LEG_LABELS: Record<string, Record<Discipline, string>> = {
  en: { swim: 'Swim', bike: 'Bike', run: 'Run' },
  de: { swim: 'Schwimmen', bike: 'Rad', run: 'Laufen' },
  pt: { swim: 'Natação', bike: 'Ciclismo', run: 'Corrida' },
  es: { swim: 'Natación', bike: 'Ciclismo', run: 'Carrera' },
  fr: { swim: 'Natation', bike: 'Vélo', run: 'Course' },
  it: { swim: 'Nuoto', bike: 'Bici', run: 'Corsa' },
  nl: { swim: 'Zwemmen', bike: 'Fietsen', run: 'Lopen' },
};

/** The leg name shown on the poster, in the poster's language. */
export function legLabel(discipline: Discipline, locale: string): string {
  return (LEG_LABELS[locale.slice(0, 2)] ?? LEG_LABELS.en!)[discipline];
}

/** "1:05:12" for times of an hour or more, "58:30" below. */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const KM_PER_MILE = 1.609344;
const M_PER_YARD = 0.9144;
const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)));

/** Swims in metres (yards) below 2 km, everything else in km (miles). */
export function formatDistance(km: number, discipline: Discipline, units: Sport['units']): string {
  if (units === 'imperial') {
    if (discipline === 'swim')
      return `${Math.round((km * 1000) / M_PER_YARD).toLocaleString('en-US')} yd`;
    const mi = km / KM_PER_MILE;
    return `${trim(mi, mi < 10 ? 2 : 1)} mi`;
  }
  if (discipline === 'swim' && km < 2) return `${Math.round(km * 1000).toLocaleString('en-US')} m`;
  return `${trim(km, km < 10 ? 2 : 1)} km`;
}

/** Pace per 100 m (swim), speed (bike) or pace per km (run). */
export function formatPace(
  km: number,
  timeS: number,
  discipline: Discipline,
  units: Sport['units'],
): string {
  const imperial = units === 'imperial';
  if (discipline === 'bike') {
    const speed = (imperial ? km / KM_PER_MILE : km) / (timeS / 3600);
    return `${speed.toFixed(1)} ${imperial ? 'mph' : 'km/h'}`;
  }
  if (discipline === 'swim') {
    const hundreds = imperial ? (km * 1000) / M_PER_YARD / 100 : km * 10;
    return `${formatDuration(timeS / hundreds)} /100 ${imperial ? 'yd' : 'm'}`;
  }
  return `${formatDuration(timeS / (imperial ? km / KM_PER_MILE : km))} /${imperial ? 'mi' : 'km'}`;
}

/** The figures under a race panel: distance and time on one line, pace or speed on the next. */
export function legStats(
  leg: Pick<Leg, 'discipline' | 'distanceKm' | 'timeS'>,
  units: Sport['units'],
): string[] {
  const { distanceKm: km, timeS, discipline } = leg;
  const first = [
    km ? formatDistance(km, discipline, units) : null,
    timeS ? formatDuration(timeS) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = first ? [first] : [];
  if (km && timeS) lines.push(formatPace(km, timeS, discipline, units));
  return lines;
}

/** Square box inside the visible part of a shaped panel, so routes are not cut off by a circle, heart or arch. */
export function visibleBox(shape: MapShape, w: number, h: number): { w: number; h: number } {
  const min = Math.min(w, h);
  if (shape === 'circle') return { w: min / Math.SQRT2, h: min / Math.SQRT2 };
  if (shape === 'heart') return { w: min * 0.55, h: min * 0.55 };
  if (shape === 'arch') return { w: w * 0.9, h: Math.max(h - w * 0.35, h * 0.5) };
  return { w, h };
}

/** View that frames `bbox` in a panel of size w×h. */
export function fitView(
  bbox: [number, number, number, number],
  w: number,
  h: number,
  shape: MapShape,
) {
  const box = visibleBox(shape, w, h);
  const fit = fitBounds(bbox, box.w, box.h, {
    padding: Math.min(box.w, box.h) * 0.08,
    maxZoom: 16,
    minZoom: 2,
  });
  return { center: fit.center, zoom: Number(fit.zoom.toFixed(2)), bearing: 0 };
}

/** Typical area a course covers around the venue, for legs without a route yet (km across). */
function courseExtentKm(discipline: Discipline, distanceKm: number | null): number {
  const km = distanceKm ?? { swim: 1.9, bike: 90, run: 21 }[discipline];
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  if (discipline === 'swim') return clamp(km * 0.45, 0.5, 3);
  if (discipline === 'bike') return clamp(km * 0.22, 5, 60);
  return clamp(km * 0.3, 1.5, 14);
}

/** Starting view of a leg panel without a route: centred on the venue, zoomed to the course's typical size. */
export function defaultLegView(
  center: [number, number],
  discipline: Discipline,
  distanceKm: number | null,
  w: number,
  h: number,
) {
  const half = courseExtentKm(discipline, distanceKm) / 2;
  const dLat = half / 111.32;
  const dLng = half / (111.32 * Math.max(0.1, Math.cos((center[1] * Math.PI) / 180)));
  const fit = fitBounds(
    [center[0] - dLng, center[1] - dLat, center[0] + dLng, center[1] + dLat],
    w,
    h,
    { padding: 0, maxZoom: 16, minZoom: 3 },
  );
  return {
    center: [Number(center[0].toFixed(6)), Number(center[1].toFixed(6))] as [number, number],
    zoom: Number(fit.zoom.toFixed(2)),
    bearing: 0,
  };
}

/** Routes drawn in a panel: the leg's own route plus routes not assigned to any leg. */
export function panelRoutes(design: Design, legId: string | null): Route[] {
  const sport = design.sport;
  if (!sport || legId === null) return design.routes;
  const assigned = new Set(sport.legs.map((l) => l.routeId).filter(Boolean));
  const own = sport.legs.find((l) => l.id === legId)?.routeId ?? null;
  return design.routes.filter((r) => r.id === own || !assigned.has(r.id));
}

// ---------------------------------------------------------------------------------------------------------------
// Finding a race in a memory text. Deterministic and language-aware (EN/DE/PT/ES/FR), so it works without the LLM.

const DISCIPLINE_WORDS: Record<Discipline, RegExp> = {
  swim: /\b(swim(?:ming)?|schwimm\w*|nata[çc][ãa]o|nado|nataci[óo]n|natation|nuoto|zwemmen)\b/iu,
  bike: /\b(bike|biking|ride|cycl\w*|rad(?:fahren|strecke|split)?|ciclismo|bici(?:cleta)?|v[ée]lo|fietsen)\b/iu,
  run: /\b(run(?:ning)?|lauf(?:en)?|corrida|carrera|course à pied|corsa|lopen)\b/iu,
};

const TIME = String.raw`(\d{1,2})\s?[:h]\s?(\d{2})(?:\s?[:m']\s?(\d{2}))?`;

function parseTime(m: RegExpExecArray | RegExpMatchArray, offset = 1): number | null {
  const a = Number(m[offset]);
  const b = Number(m[offset + 1]);
  const c = m[offset + 2] === undefined ? null : Number(m[offset + 2]);
  if (b > 59 || (c !== null && c > 59)) return null;
  if (c !== null) return a * 3600 + b * 60 + c;
  // Two parts: hours and minutes, unless the first part cannot be hours of a race leg (e.g. a 58:30 swim).
  return a >= 24 ? a * 60 + b : a * 3600 + b * 60;
}

const has = (text: string, re: RegExp) => re.test(text);

/** Recognises a race in a memory, e.g. "My first Ironman in Frankfurt, 11:42:07 (swim 1:05, bike 5:40, run 4:40)". */
export function detectRace(text: string): DraftSport | null {
  const t = text.normalize('NFC');
  let event: SportEvent | null = null;
  let distances: readonly number[] | null = null;

  const full =
    /\b(ironman(?!\s*70\.3)|140\.6|lang(?:distanz)?\b|full[- ]distance|long[- ]distance|ironman completo|distancia ironman)\b/iu;
  const middle =
    /\b(70\.3|half[- ]ironman|halb(?:distanz|er ironman)|middle[- ]distance|mitteldistanz|meio[- ]ironman|medio[- ]ironman)\b|70\.3/iu;
  if (has(t, /\b(tri(?:athlon|atlo|atl[óo]n)|ironman|70\.3|140\.6|challenge roth)\b|70\.3/iu)) {
    event = 'triathlon';
    if (has(t, middle)) distances = RACE_DISTANCES['tri-middle'];
    else if (has(t, full) || has(t, /challenge roth/iu)) distances = RACE_DISTANCES['tri-full'];
    else if (has(t, /\b(ol[yi]mp\w*|standard[- ]distance|kurzdistanz)\b/iu))
      distances = RACE_DISTANCES['tri-olympic'];
    else if (has(t, /\bsprint\b/iu)) distances = RACE_DISTANCES['tri-sprint'];
  } else if (has(t, /\b(duathlon|duatlo|duatl[óo]n)\b/iu)) {
    event = 'duathlon';
    distances = has(t, /\bsprint\b/iu)
      ? RACE_DISTANCES['du-sprint']
      : RACE_DISTANCES['du-standard'];
  } else if (has(t, /\b(aquathlon|aquatlo|acuatl[óo]n)\b/iu)) {
    event = 'aquathlon';
    distances = RACE_DISTANCES.aquathlon;
  } else if (
    has(
      t,
      /\b(half[- ]marathon|halbmarathon|meia[- ]maratona|media marat[óo]n|semi[- ]marathon)\b/iu,
    )
  ) {
    event = 'run';
    distances = RACE_DISTANCES['half-marathon'];
  } else if (has(t, /\b(marathon|maratona|marat[óo]n)\b/iu)) {
    event = 'run';
    distances = RACE_DISTANCES.marathon;
  } else if (
    has(
      t,
      /\b(gran ?fondo|sportive|century ride|radrennen|radmarathon|cycling race|bike race|cyclosportive|corrida de bicicleta)\b/iu,
    )
  ) {
    event = 'ride';
  } else if (
    has(
      t,
      /\b(open[- ]water swim|ocean swim|swim race|freiwasserschwimmen|travessia a nado|maratón acuático)\b/iu,
    )
  ) {
    event = 'swim';
  } else if (
    has(
      t,
      /\b(\d+(?:[.,]\d+)?\s?k(?:m)?\s?(?:run|race|lauf)|trail run|ultra(?:trail|marathon)?|corrida de \d+)\b/iu,
    )
  ) {
    event = 'run';
  }
  if (!event) return null;

  const disciplines = EVENT_LEGS[event];
  // Single-leg races: take a stated distance ("100 km gran fondo", "10k run").
  if (!distances && disciplines.length === 1) {
    const m = /(\d+(?:[.,]\d+)?)\s?(km|k|mi|miles?)\b/iu.exec(t);
    if (m) {
      const v = Number(m[1]!.replace(',', '.'));
      distances = [/^mi/i.test(m[2]!) ? v * KM_PER_MILE : v];
    }
  }

  // Leg times: a discipline word followed closely by a time ("swim 1:05", "Rad: 5h40").
  const used = new Set<number>();
  const timeRe = new RegExp(TIME, 'gu');
  const times = [...t.matchAll(timeRe)].map((m) => ({
    index: m.index!,
    end: m.index! + m[0].length,
    s: parseTime(m),
  }));
  const legTimes = disciplines.map(() => null as number | null);
  const seen = new Map<Discipline, number>();
  for (const [i, d] of disciplines.entries()) {
    const nth = seen.get(d) ?? 0;
    seen.set(d, nth + 1);
    const words = [...t.matchAll(new RegExp(DISCIPLINE_WORDS[d].source, 'giu'))];
    const word = words[nth];
    if (!word) continue;
    const after = times.find(
      (x, j) =>
        !used.has(j) && x.index >= word.index! && x.index - (word.index! + word[0].length) <= 25,
    );
    if (after && after.s !== null) {
      legTimes[i] = after.s;
      used.add(times.indexOf(after));
    }
  }
  // Finish time: after a "finished/total/in" word, or the one remaining time.
  let finish: number | null = null;
  const finishRe = new RegExp(
    String.raw`\b(finish(?:ed)?|finisher|total|overall|in|em|en|zeit|gesamt(?:zeit)?|ziel(?:zeit)?|tempo(?: final)?|tiempo|chegada|terminei|cheguei)\b[^\d]{0,20}` +
      TIME,
    'giu',
  );
  for (const m of t.matchAll(finishRe)) {
    const idx = times.findIndex(
      (x, j) => !used.has(j) && x.index >= m.index! && x.end <= m.index! + m[0].length,
    );
    if (idx !== -1 && times[idx]!.s !== null) {
      finish = times[idx]!.s;
      used.add(idx);
      break;
    }
  }
  const rest = times.filter((x, j) => !used.has(j) && x.s !== null);
  if (finish === null && rest.length === 1) finish = rest[0]!.s;
  const legSum = legTimes.every((x) => x !== null) ? legTimes.reduce((a, b) => a! + b!, 0)! : null;
  if (finish !== null && legSum !== null && finish < legSum) finish = null;
  if (disciplines.length === 1 && legTimes[0] === null && finish !== null) legTimes[0] = finish;

  return {
    event,
    name: eventName(t),
    legs: disciplines.map((discipline, i) => ({
      discipline,
      distanceKm: distances?.[i] ?? null,
      timeS: legTimes[i] ?? null,
    })),
    finishTimeS: finish ?? legSum,
  };
}

/** "Ironman Frankfurt", "Challenge Roth", "Berlin Marathon": the event as the user wrote it. */
function eventName(t: string): string | null {
  // Case-sensitive on purpose: the place after the brand must be capitalised ("Ironman in Frankfurt" → no match).
  const word = String.raw`\p{Lu}[\p{L}'’-]+`;
  const brand = /\b(ironman(?:\s70\.3)?|challenge|t100)\s+/iu.exec(t);
  const place =
    brand &&
    new RegExp(String.raw`^(${word}(?:[\s-]${word})?)`, 'u').exec(
      t.slice(brand.index + brand[0].length),
    );
  if (brand && place) return `${brand[0].trim()} ${place[1]}`.slice(0, 80);
  const kind = String.raw`[Hh]alf[- ][Mm]arathon|[Mm]arathon|[Hh]albmarathon|[Tt]riathlon|[Dd]uathlon|[Mm]eia[- ][Mm]aratona|[Mm]aratona|[Mm]arat[óo]n|[Gg]ran ?[Ff]ondo`;
  const named = new RegExp(String.raw`((?:${word}\s){1,3})(${kind})\b`, 'u').exec(t);
  if (named) return `${named[1]!.trim()} ${named[2]}`.slice(0, 80);
  return null;
}
