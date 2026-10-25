import { DISCIPLINES, type Discipline } from '@mapmory/design-schema';
import { simplifyRoute } from '@mapmory/poster-core';
import { parseGeoJson } from './routes-import';

export interface ImportedLeg {
  discipline: Discipline;
  /** Track/lap name from the file, or '' when none. */
  name: string;
  /**
   * Simplified with simplifyRoute (≤ 1000 points), [lng, lat] rounded as simplifyRoute does. Empty for a leg the file
   * describes without GPS (e.g. a pool swim session), so the poster can still show its distance and time.
   */
  points: [number, number][];
  /** From the full-resolution track (haversine sum) or the file's own totals; null if unknown. */
  distanceKm: number | null;
  /** Elapsed seconds from timestamps or file totals; null if unknown. */
  durationS: number | null;
  /** How the discipline was determined. */
  source: 'file' | 'speed' | 'order';
}

export const MAX_ACTIVITY_FILE_BYTES = 25 * 1024 * 1024;

export type ActivityImportErrorCode = 'too_large' | 'unreadable' | 'no_lines';
export class ActivityImportError extends Error {
  constructor(public readonly code: ActivityImportErrorCode) {
    super(code);
  }
}

type Pt = [number, number];
/** One GPS fix; `t` in ms since the Unix epoch, null when the file has no time for it. */
interface Fix {
  p: Pt;
  t: number | null;
}
/** What the file says a piece is; null when it doesn't say. */
type Kind = Discipline | 'transition' | null;
type Source = ImportedLeg['source'];

/** A candidate leg as read from a file: a FIT session, a GPX track, a TCX activity or a GeoJSON line. */
interface Piece {
  kind: Kind;
  source: Source;
  name: string;
  /** Full resolution, in file order. */
  fixes: Fix[];
  /** File totals until `withTotals` fills the gaps from the fixes. */
  distanceKm: number | null;
  durationS: number | null;
  /** ms since the Unix epoch. */
  start: number | null;
}
type Leg = Piece & { kind: Discipline };

const unreadable = () => new ActivityImportError('unreadable');
const validPt = (p: Pt) =>
  Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const cleanName = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/[\p{Cc}\p{Cs}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
const parseTime = (s: string | null | undefined) => {
  const t = s ? Date.parse(s.trim()) : NaN;
  return Number.isFinite(t) ? t : null;
};

// ─── Geometry ────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
function haversineKm(a: Pt, b: Pt): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function pathKm(fixes: Fix[]): number {
  let d = 0;
  for (let i = 1; i < fixes.length; i++) d += haversineKm(fixes[i - 1]!.p, fixes[i]!.p);
  return d;
}
type TimedFix = Fix & { t: number };
const timedFixes = (fixes: Fix[]) => fixes.filter((f): f is TimedFix => f.t !== null);
/** Seconds between the earliest and the latest fix, or null with fewer than two timed fixes. */
function spanS(fixes: Fix[]): number | null {
  let min = Infinity;
  let max = -Infinity;
  for (const f of fixes) {
    if (f.t === null) continue;
    min = Math.min(min, f.t);
    max = Math.max(max, f.t);
  }
  return max > min ? (max - min) / 1000 : null;
}

// ─── Discipline from words ───────────────────────────────────────────────────

/** Keywords in EN/DE/PT/ES/FR (plus a few IT), matched on lower-case text without accents; `_`/`-` count as spaces. */
const KEYWORDS: [Exclude<Kind, null>, RegExp][] = [
  ['swim', /swim|schwimm|\bnatac|\bnado\b|\bnatation|\bnuoto|open water/],
  [
    'bike',
    /\bbik(e|es|ing)\b|cycl|\bride\b|\briding\b|\brad(\b|fahr|tour|renn|rund|strecke|ausfahrt)|rennrad|fahrrad|mountainbike|\bmtb\b|\bciclis|\bvelo\b|\bbici/,
  ],
  ['run', /\brun(\b|s\b|ning|ner)|lauf|\bcorrida|\bcarrera|course a pied|\bjog/],
  ['transition', /transition|\bwechsel|\bt[12]\b|\btransici|\btransica/],
];
/** Strava's numeric GPX <type> codes that are known for sure. */
const STRAVA_TYPES: Record<string, Discipline> = { '1': 'bike', '9': 'run' };

/** A discipline named in free text; null when none, or when several are (e.g. "Swim Bike Run"). */
function kindFromText(s: string | null | undefined): Kind {
  if (!s) return null;
  const text = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[_-]+/g, ' ');
  const hits = KEYWORDS.filter(([, re]) => re.test(text)).map(([kind]) => kind);
  const disciplines = hits.filter((k) => k !== 'transition');
  if (disciplines.length === 1) return disciplines[0]!;
  return disciplines.length === 0 && hits.length > 0 ? 'transition' : null;
}
const kindFromType = (s: string | null | undefined): Kind =>
  STRAVA_TYPES[(s ?? '').trim()] ?? kindFromText(s);

// ─── FIT ─────────────────────────────────────────────────────────────────────

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const FIT_MAX_RECORDS = 500_000;
const SEMICIRCLES = 180 / 2 ** 31;
const FIT_SPORTS: Record<number, Exclude<Kind, null>> = {
  1: 'run',
  2: 'bike',
  3: 'transition',
  5: 'swim',
};
const MSG_SPORT = 12;
const MSG_SESSION = 18;
const MSG_RECORD = 20;
const FIELD_TIMESTAMP = 253;

type FitRead = (v: DataView, at: number, little: boolean) => number;
const u8: FitRead = (v, at) => v.getUint8(at);
const u16: FitRead = (v, at, le) => v.getUint16(at, le);
const u32: FitRead = (v, at, le) => v.getUint32(at, le);
/** FIT base types (low 5 bits): byte size, reader, "invalid" marker. 64-bit and string fields are skipped. */
const FIT_TYPES: Record<number, [number, FitRead, number]> = {
  0x00: [1, u8, 0xff], // enum
  0x01: [1, (v, at) => v.getInt8(at), 0x7f],
  0x02: [1, u8, 0xff],
  0x03: [2, (v, at, le) => v.getInt16(at, le), 0x7fff],
  0x04: [2, u16, 0xffff],
  0x05: [4, (v, at, le) => v.getInt32(at, le), 0x7fffffff],
  0x06: [4, u32, 0xffffffff],
  0x08: [4, (v, at, le) => v.getFloat32(at, le), NaN],
  0x09: [8, (v, at, le) => v.getFloat64(at, le), NaN],
  0x0a: [1, u8, 0], // uint8z
  0x0b: [2, u16, 0],
  0x0c: [4, u32, 0],
  0x0d: [1, u8, 0xff], // byte
};

interface FitDefinition {
  global: number;
  little: boolean;
  fields: { num: number; size: number; type: number }[];
  /** Bytes of one data message, developer fields included. */
  size: number;
}
interface FitSession {
  start: number | null;
  end: number | null;
  elapsedS: number | null;
  distanceM: number | null;
  sport: number | null;
}

const hasFitSignature = (b: Uint8Array, at = 0) =>
  b.length >= at + 12 &&
  b[at]! >= 12 &&
  b[at + 8] === 0x2e &&
  b[at + 9] === 0x46 &&
  b[at + 10] === 0x49 &&
  b[at + 11] === 0x54; // ".FIT"

/** Reads one field; null for FIT's "invalid" markers, unsupported types and fields smaller than their type. */
function fitValue(view: DataView, at: number, size: number, type: number, little: boolean) {
  const t = FIT_TYPES[type & 0x1f];
  if (!t || size < t[0]) return null;
  const v = t[1](view, at, little);
  return v === t[2] || !Number.isFinite(v) ? null : v;
}

/**
 * Walks the messages between `start` and `end`, calling `onMessage` with the fields of the messages we use (by field
 * number). Every read is bounds-checked; anything that does not add up is 'unreadable'.
 */
function readFitMessages(
  view: DataView,
  start: number,
  end: number,
  onMessage: (global: number, fields: Map<number, number>) => void,
) {
  const defs: (FitDefinition | undefined)[] = [];
  let pos = start;
  let lastTimestamp: number | null = null;
  const need = (n: number) => {
    if (pos + n > end) throw unreadable();
  };
  while (pos < end) {
    const header = view.getUint8(pos++);
    let local: number;
    let timestamp: number | null = null;
    if (header & 0x80) {
      // Compressed timestamp header: 5-bit offset from the last full timestamp.
      if (lastTimestamp === null) throw unreadable();
      local = (header >> 5) & 0x03;
      const offset = header & 0x1f;
      timestamp = lastTimestamp - (lastTimestamp & 0x1f) + offset;
      if (offset < (lastTimestamp & 0x1f)) timestamp += 0x20;
      lastTimestamp = timestamp;
    } else if (header & 0x40) {
      need(5);
      const architecture = view.getUint8(pos + 1);
      if (architecture > 1) throw unreadable();
      const little = architecture === 0;
      const global = view.getUint16(pos + 2, little);
      const count = view.getUint8(pos + 4);
      pos += 5;
      need(count * 3);
      const fields = [];
      let size = 0;
      for (let i = 0; i < count; i++, pos += 3) {
        const field = {
          num: view.getUint8(pos),
          size: view.getUint8(pos + 1),
          type: view.getUint8(pos + 2),
        };
        fields.push(field);
        size += field.size;
      }
      if (header & 0x20) {
        // Developer data fields: we never read them, only skip their bytes.
        need(1);
        const devCount = view.getUint8(pos++);
        need(devCount * 3);
        for (let i = 0; i < devCount; i++, pos += 3) size += view.getUint8(pos + 1);
      }
      defs[header & 0x0f] = { global, little, fields, size };
      continue;
    } else {
      local = header & 0x0f;
    }
    const def = defs[local];
    if (!def) throw unreadable();
    need(def.size);
    const wanted =
      def.global === MSG_RECORD || def.global === MSG_SESSION || def.global === MSG_SPORT;
    const values = new Map<number, number>();
    let at = pos;
    for (const f of def.fields) {
      if (wanted || f.num === FIELD_TIMESTAMP) {
        const v = fitValue(view, at, f.size, f.type, def.little);
        if (v !== null) values.set(f.num, v);
      }
      at += f.size;
    }
    pos += def.size;
    const own = values.get(FIELD_TIMESTAMP);
    if (own !== undefined) lastTimestamp = own;
    else if (timestamp !== null) values.set(FIELD_TIMESTAMP, timestamp);
    if (wanted) onMessage(def.global, values);
  }
}

/**
 * FIT (Garmin, Wahoo, Coros…) → one piece per session, records assigned to sessions by time; a file without sessions
 * (e.g. an unfinished recording) is one piece, typed by its sport message if any. Laps are not used: multisport files
 * already have one session per leg. The CRC is not checked.
 */
function parseFit(bytes: Uint8Array): Piece[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fixes: Fix[] = [];
  const sessions: FitSession[] = [];
  let sport: number | null = null;
  const onMessage = (global: number, v: Map<number, number>) => {
    const get = (n: number) => v.get(n) ?? null;
    if (global === MSG_RECORD) {
      const lat = get(0);
      const lng = get(1);
      const ts = get(FIELD_TIMESTAMP);
      if (lat === null || lng === null || fixes.length >= FIT_MAX_RECORDS) return;
      const p: Pt = [lng * SEMICIRCLES, lat * SEMICIRCLES];
      if (validPt(p)) fixes.push({ p, t: ts === null ? null : FIT_EPOCH_MS + ts * 1000 });
    } else if (global === MSG_SESSION) {
      const elapsed = get(7);
      const distance = get(9);
      sessions.push({
        start: get(2),
        end: get(FIELD_TIMESTAMP),
        elapsedS: elapsed === null ? null : elapsed / 1000,
        distanceM: distance === null ? null : distance / 100,
        sport: get(5),
      });
    } else if (global === MSG_SPORT) {
      sport = get(0) ?? sport;
    }
  };
  // A file may chain several FIT streams, each with its own header and definitions.
  let offset = 0;
  while (hasFitSignature(bytes, offset)) {
    const start = offset + bytes[offset]!;
    const end = start + view.getUint32(offset + 4, true);
    if (end > bytes.length) throw unreadable();
    readFitMessages(view, start, end, onMessage);
    offset = end + 2;
  }
  if (offset === 0) throw unreadable();

  const fitKind = (s: number | null): Kind => (s === null ? null : (FIT_SPORTS[s] ?? null));
  if (sessions.length === 0)
    return [
      {
        kind: fitKind(sport),
        source: 'file',
        name: '',
        fixes,
        distanceKm: null,
        durationS: null,
        start: null,
      },
    ];
  const toMs = (s: number) => FIT_EPOCH_MS + s * 1000;
  const ordered = sessions
    .map((s) => ({
      ...s,
      start: s.start ?? (s.end !== null && s.elapsedS !== null ? s.end - s.elapsedS : null),
    }))
    .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const buckets: Fix[][] = ordered.map(() => []);
  for (const f of fixes) {
    if (f.t === null && ordered.length > 1) continue;
    let i = 0;
    while (i + 1 < ordered.length && f.t !== null) {
      const next = ordered[i + 1]!.start;
      if (next === null || toMs(next) > f.t) break;
      i++;
    }
    buckets[i]!.push(f);
  }
  return ordered.map((s, i) => ({
    kind: fitKind(s.sport),
    source: 'file',
    name: '',
    fixes: buckets[i]!,
    distanceKm: s.distanceM === null ? null : s.distanceM / 1000,
    durationS: s.elapsedS,
    start: s.start === null ? null : toMs(s.start),
  }));
}

// ─── XML (GPX, TCX) and GeoJSON ──────────────────────────────────────────────

const child = (el: Element, name: string) => [...el.children].find((c) => c.localName === name);
const all = (el: Element | Document, name: string) => [...el.getElementsByTagNameNS('*', name)];
const piece = (kind: Kind, name: string, fixes: Fix[], extra: Partial<Piece> = {}): Piece => ({
  kind,
  source: 'file',
  name,
  fixes,
  distanceKm: null,
  durationS: null,
  start: null,
  ...extra,
});

/**
 * GPX → one piece per track, its segments joined (or per planned route when the file has no track). Discipline from
 * <type>, else from <name>. A track without either but with times is later split by speed, which also covers tracks
 * whose segments are different legs; segment breaks themselves are not trusted, since watches also start new
 * segments after a pause or GPS loss.
 */
function readGpx(doc: Document): Piece[] {
  const tracks = all(doc, 'trk');
  const lines = tracks.length > 0 ? tracks : all(doc, 'rte');
  return lines.map((el) => {
    const name = cleanName(child(el, 'name')?.textContent);
    const kind = kindFromType(child(el, 'type')?.textContent) ?? kindFromText(name);
    const fixes = all(el, el.localName === 'trk' ? 'trkpt' : 'rtept')
      .map((pt) => ({
        p: [
          Number.parseFloat(pt.getAttribute('lon') ?? ''),
          Number.parseFloat(pt.getAttribute('lat') ?? ''),
        ] as Pt,
        t: parseTime(child(pt, 'time')?.textContent),
      }))
      .filter((f) => validPt(f.p));
    return piece(kind, name, fixes);
  });
}

/** TCX → one piece per <Activity> (also inside a <MultiSportSession>; its <Transition> laps are left out). */
function readTcx(doc: Document): Piece[] {
  const num = (el: Element | undefined) => Number.parseFloat(el?.textContent ?? '');
  return all(doc, 'Activity').map((activity) => {
    const laps = all(activity, 'Lap');
    const lapTotal = (tag: string) =>
      laps.length > 0 ? laps.reduce((sum, lap) => sum + num(child(lap, tag)), 0) : NaN;
    const fixes = all(activity, 'Trackpoint').flatMap((tp): Fix[] => {
      const pos = child(tp, 'Position');
      if (!pos) return [];
      const p: Pt = [num(child(pos, 'LongitudeDegrees')), num(child(pos, 'LatitudeDegrees'))];
      return validPt(p) ? [{ p, t: parseTime(child(tp, 'Time')?.textContent) }] : [];
    });
    const distanceM = lapTotal('DistanceMeters');
    const timerS = lapTotal('TotalTimeSeconds');
    return piece(kindFromType(activity.getAttribute('Sport')), '', fixes, {
      distanceKm: Number.isFinite(distanceM) ? distanceM / 1000 : null,
      // TotalTimeSeconds is timer time (pauses excluded): only a fallback for elapsed time.
      durationS: spanS(fixes) ?? (Number.isFinite(timerS) ? timerS : null),
      start:
        parseTime(laps[0]?.getAttribute('StartTime')) ??
        parseTime(child(activity, 'Id')?.textContent),
    });
  });
}

function readXml(text: string): Piece[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw unreadable();
  const root = doc.documentElement.localName;
  if (root === 'gpx') return readGpx(doc);
  if (root === 'TrainingCenterDatabase') return readTcx(doc);
  throw unreadable();
}

const PROPERTY_KEYS = ['type', 'sport', 'activity', 'activityType', 'activity_type', 'discipline'];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** GeoJSON → one piece per line (via routes-import), typed by a feature property or its name. No times. */
function readGeoJson(text: string): Piece[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw unreadable();
  }
  const features =
    isObject(json) && json.type === 'FeatureCollection' && Array.isArray(json.features)
      ? json.features
      : [json];
  return features.flatMap((feature: unknown) => {
    const props = isObject(feature) && isObject(feature.properties) ? feature.properties : {};
    const fromProps =
      PROPERTY_KEYS.map((k) => props[k])
        .filter((v): v is string => typeof v === 'string')
        .map(kindFromType)
        .find((k) => k !== null) ?? null;
    return parseGeoJson(JSON.stringify(feature), '').map((r) =>
      piece(
        fromProps ?? kindFromText(r.name),
        r.name,
        r.points.map((p) => ({ p, t: null })),
      ),
    );
  });
}

/** Format by extension, falling back to the content (FIT signature, XML root, else JSON). */
function readFile(bytes: Uint8Array, fileName: string): Piece[] {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';
  const textual = ['gpx', 'tcx', 'json', 'geojson'].includes(ext);
  if (ext === 'fit' || (!textual && hasFitSignature(bytes))) return parseFit(bytes);
  const text = new TextDecoder().decode(bytes);
  if (ext === 'json' || ext === 'geojson') return readGeoJson(text);
  if (ext === 'gpx' || ext === 'tcx' || /^\s*</.test(text)) return readXml(text);
  return readGeoJson(text);
}

// ─── Splitting one track by speed ────────────────────────────────────────────

const STEP_S = 30;
/** Median over ±2 steps (2.5 min): rides out GPS spikes, turnarounds and short stops. */
const SMOOTH_STEPS = 2;
/** Longer without a fix → no speed (auto-pause, GPS loss); treated like a stop. */
const GAP_S = 120;
const STOP_KMH = 1.2;
const SWIM_MAX_KMH = 5.5;
const RUN_MAX_KMH = 19;
/** Shorter runs of one class are boundary artefacts (a step half on the bike, half walking): treated as stops. */
const FLICKER_S = 90;
/**
 * A bike or swim run between two runs could be a duathlon's bike or an aquathlon's swim: absorbed into the run only
 * when shorter than this or than half of the shorter side (a downhill, a walk).
 */
const ABSORB_S = 5 * 60;
/** Pieces shorter than this share of the moving time (≥ 90 s, ≤ 15 min) are transitions. Legs are ≥ ~8%. */
const TRANSITION_SHARE = 0.05;
const TRANSITION_MIN_S = 90;
const TRANSITION_MAX_S = 15 * 60;

type SpeedClass = Discipline | 'stop';
interface Run {
  cls: SpeedClass;
  /** Step indices, `to` exclusive. */
  from: number;
  to: number;
}
const steps = (r: Run) => r.to - r.from;
const transitionS = (movingS: number) =>
  Math.max(TRANSITION_MIN_S, Math.min(TRANSITION_SHARE * movingS, TRANSITION_MAX_S));

const BY_SPEED: readonly Discipline[] = ['swim', 'run', 'bike'];
/** Between swim and bike speeds: where a run-speed stretch goes when the race has no run (e.g. an aquabike). */
const SWIM_BIKE_SPLIT_KMH = (SWIM_MAX_KMH + RUN_MAX_KMH) / 2;

/**
 * Speed class, limited to the race's disciplines: a would-be class the race doesn't have becomes the nearest slower or
 * faster one it has (a duathlon's walk is run, not swim; in a single-discipline race everything moving is that one).
 */
function classify(kmh: number, allowed: ReadonlySet<Discipline>): SpeedClass {
  if (!Number.isFinite(kmh) || kmh < STOP_KMH) return 'stop';
  const raw = kmh < SWIM_MAX_KMH ? 'swim' : kmh <= RUN_MAX_KMH ? 'run' : 'bike';
  if (allowed.has(raw)) return raw;
  const i = BY_SPEED.indexOf(raw);
  const slower = BY_SPEED.slice(0, i).findLast((d) => allowed.has(d));
  const faster = BY_SPEED.slice(i + 1).find((d) => allowed.has(d));
  if (slower && faster) return kmh < SWIM_BIKE_SPLIT_KMH ? slower : faster;
  return slower ?? faster ?? raw;
}

function compact(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const prev = out.at(-1);
    if (prev && prev.cls === r.cls) prev.to = r.to;
    else out.push({ ...r });
  }
  return out;
}

/**
 * Absorbs what cannot be a leg of its own: stops between two runs of the same class (an aid station must not split
 * the bike), then — shortest first — runs shorter than both moving neighbours when those are the same other class (a
 * bike leg's climbs look like running, a walk in the run like swimming). Only run-bike-run and run-swim-run are race
 * formats; those middles need to be short as well (`ABSORB_S`).
 */
function settle(input: Run[]): Run[] {
  let runs = compact(input);
  for (;;) {
    let changed = false;
    for (let i = 1; i < runs.length - 1; i++) {
      const [prev, run, next] = [runs[i - 1]!, runs[i]!, runs[i + 1]!];
      if (run.cls === 'stop' && prev.cls === next.cls) {
        run.cls = prev.cls;
        changed = true;
      }
    }
    if (changed) {
      runs = compact(runs);
      continue;
    }
    let best: [number, number, number] | null = null;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]!;
      if (run.cls === 'stop') continue;
      let p = i - 1;
      while (p >= 0 && runs[p]!.cls === 'stop') p--;
      let q = i + 1;
      while (q < runs.length && runs[q]!.cls === 'stop') q++;
      if (p < 0 || q >= runs.length || runs[p]!.cls !== runs[q]!.cls) continue;
      const side = Math.min(steps(runs[p]!), steps(runs[q]!));
      const format = runs[p]!.cls === 'run' && run.cls !== 'run';
      const limit = format ? Math.min(side, Math.max(ABSORB_S / STEP_S, 0.5 * side)) : side;
      if (steps(run) < limit && (!best || steps(run) < steps(runs[best[0]]!))) best = [i, p, q];
    }
    if (!best) return runs;
    const [, p, q] = best;
    for (let k = p + 1; k < q; k++) runs[k]!.cls = runs[p]!.cls;
    runs = compact(runs);
  }
}

/**
 * A track whose file doesn't name its sport → legs by speed: positions every 30 s (interpolated), speed per step from
 * the straight-line displacement (path length would add up GPS jitter, worst in the water), a 2.5-min median, classes
 * stop < 1.2 ≤ swim < 5.5 ≤ run ≤ 19 < bike km/h (only the race's disciplines, see `classify`); fragments under 90 s become stops, then `settle`, transitions
 * dropped, and standing time trimmed off each leg's ends. Returns the piece unchanged when it has too few times, or
 * with just its discipline when it is a single leg.
 */
function splitBySpeed(source: Piece, allowed: ReadonlySet<Discipline>): Piece[] {
  const fixes = timedFixes(source.fixes)
    .sort((a, b) => a.t - b.t)
    .filter((f, i, arr) => i === 0 || f.t > arr[i - 1]!.t);
  if (fixes.length < 2) return [source];
  const t0 = fixes[0]!.t;
  const stepMs = STEP_S * 1000;
  const n = Math.floor((fixes.at(-1)!.t - t0) / stepMs);
  if (n < 1) return [source];

  const at: (Pt | null)[] = [];
  for (let k = 0, j = 0; k <= n; k++) {
    const t = t0 + k * stepMs;
    while (j < fixes.length - 2 && fixes[j + 1]!.t <= t) j++;
    const [a, b] = [fixes[j]!, fixes[j + 1]!];
    if (b.t - a.t > GAP_S * 1000) at.push(t === a.t ? a.p : t === b.t ? b.p : null);
    else {
      const f = Math.min(1, (t - a.t) / (b.t - a.t));
      at.push([a.p[0] + f * (b.p[0] - a.p[0]), a.p[1] + f * (b.p[1] - a.p[1])]);
    }
  }
  const kmh = Array.from({ length: n }, (_, k) => {
    const [a, b] = [at[k], at[k + 1]];
    return a && b ? (haversineKm(a, b) * 3600) / STEP_S : NaN;
  });
  const classes = kmh.map((_, k) => {
    const window = kmh
      .slice(Math.max(0, k - SMOOTH_STEPS), k + SMOOTH_STEPS + 1)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return classify(window.length ? window[Math.floor(window.length / 2)]! : NaN, allowed);
  });

  const raw = compact(classes.map((cls, k) => ({ cls, from: k, to: k + 1 })));
  const settled = settle(
    raw.map((r) => (steps(r) < FLICKER_S / STEP_S ? { ...r, cls: 'stop' as const } : r)),
  );
  const movingSteps = settled.reduce((s, r) => s + (r.cls === 'stop' ? 0 : steps(r)), 0);
  const short = transitionS(movingSteps * STEP_S) / STEP_S;
  const legs = settle(
    settled.map((r) => (r.cls !== 'stop' && steps(r) < short ? { ...r, cls: 'stop' as const } : r)),
  ).filter((r) => r.cls !== 'stop');

  if (legs.length <= 1) {
    // One leg (or only fragments): the whole piece is that discipline, file totals kept.
    const moving = raw.filter((r) => r.cls !== 'stop').sort((a, b) => steps(b) - steps(a));
    const main = legs[0] ?? moving[0];
    return main ? [{ ...source, kind: main.cls as Discipline, source: 'speed' }] : [source];
  }
  const standing = (k: number) => !(kmh[k]! >= STOP_KMH);
  return legs.map((r) => {
    let [first, end] = [r.from, r.to];
    while (end - first > 1 && standing(first)) first++;
    while (end - first > 1 && standing(end - 1)) end--;
    const from = t0 + first * stepMs;
    const to = end >= n ? Infinity : t0 + end * stepMs;
    return {
      ...source,
      kind: r.cls as Discipline,
      source: 'speed',
      fixes: fixes.filter((f) => f.t >= from && f.t < to),
      distanceKm: null,
      durationS: null,
      start: null,
    };
  });
}

// ─── Putting the legs together ───────────────────────────────────────────────

function withTotals(p: Piece): Piece {
  return {
    ...p,
    distanceKm: p.distanceKm ?? (p.fixes.length >= 2 ? pathKm(p.fixes) : null),
    durationS: p.durationS ?? spanS(p.fixes),
    start: p.start ?? timedFixes(p.fixes)[0]?.t ?? null,
  };
}

const SOURCE_RANK: Record<Source, number> = { order: 0, speed: 1, file: 2 };
const sumOrNull = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
/** Joins two pieces of one leg; the less certain source wins so the UI can still flag a guess. */
const join = (a: Piece, b: Piece): Piece => ({
  ...a,
  name: a.name || b.name,
  fixes: a.fixes.concat(b.fixes),
  distanceKm: sumOrNull(a.distanceKm, b.distanceKm),
  durationS: sumOrNull(a.durationS, b.durationS),
  source: SOURCE_RANK[b.source] < SOURCE_RANK[a.source] ? b.source : a.source,
});

/** Speed-classified pieces too short to be a leg (a separately recorded transition, a warm-up) are dropped. */
function dropTransitions(pieces: Piece[]): Piece[] {
  const total = pieces.reduce((s, p) => s + (p.durationS ?? 0), 0);
  const kept = pieces.filter(
    (p) => p.source !== 'speed' || p.durationS === null || p.durationS >= transitionS(total),
  );
  return kept.length > 0 ? kept : pieces;
}

const gapKm = (a: Piece, b: Piece) => {
  const [end, start] = [a.fixes.at(-1), b.fixes[0]];
  return end && start ? haversineKm(end.p, start.p) : Infinity;
};

/**
 * Pieces nothing else could type get the race's leg order. When no piece is typed and there are more pieces than
 * legs, neighbours are merged first, the pair whose end and start are closest (a leg saved in two parts continues
 * where it stopped; the swim usually is the shortest piece, so "shortest first" would glue it to the bike). Typed
 * pieces move the position in `expected` forward, so a known swim followed by two unknowns gives bike, run.
 */
function assignByOrder(pieces: Piece[], expected: Discipline[]): Leg[] {
  const order: readonly Discipline[] = expected.length > 0 ? expected : DISCIPLINES;
  if (pieces.every((p) => p.kind === null)) {
    const list = [...pieces];
    while (list.length > order.length) {
      let best = 0;
      for (let i = 1; i < list.length - 1; i++)
        if (gapKm(list[i]!, list[i + 1]!) < gapKm(list[best]!, list[best + 1]!)) best = i;
      list.splice(best, 2, join(list[best]!, list[best + 1]!));
    }
    return list.map((p, i) => ({ ...p, kind: order[i]!, source: 'order' }));
  }
  let next = 0;
  let prev: Kind = null;
  return pieces.map((p): Leg => {
    if (p.kind !== null && p.kind !== 'transition') {
      const j = p.kind === prev ? -1 : order.indexOf(p.kind, next);
      if (j !== -1) next = j + 1;
      prev = p.kind;
      return { ...p, kind: p.kind };
    }
    const kind = order[Math.min(next++, order.length - 1)]!;
    prev = kind;
    return { ...p, kind, source: 'order' };
  });
}

function mergeSameDiscipline(legs: Leg[]): Leg[] {
  const out: Leg[] = [];
  for (const leg of legs) {
    const prev = out.at(-1);
    if (prev && prev.kind === leg.kind)
      out[out.length - 1] = { ...join(prev, leg), kind: leg.kind };
    else out.push(leg);
  }
  return out;
}

/**
 * Reads one or more activity files (any order) and returns the race legs in chronological order.
 * `expected` is the race's leg order, e.g. ['swim','bike','run'] for a triathlon or ['run','bike','run'] for a duathlon;
 * it assigns pieces neither the file nor the speed can type, and limits the speed split to the race's disciplines
 * (a duathlon's walk is never a swim). With all three disciplines in it, speed alone decides.
 *
 * Pipeline: read pieces (FIT sessions, GPX tracks, TCX activities, GeoJSON lines) → untyped timed pieces split by speed
 * → transitions dropped → sorted by start time when every piece has one (else file order, then order within the file)
 * → remaining untyped pieces assigned from `expected` → consecutive pieces of one discipline merged.
 * Throws `ActivityImportError` with a code the UI can explain.
 */
export async function importActivityFiles(
  files: File[],
  expected: Discipline[],
): Promise<ImportedLeg[]> {
  if (files.some((f) => f.size > MAX_ACTIVITY_FILE_BYTES))
    throw new ActivityImportError('too_large');
  const pieces: Piece[] = [];
  for (const file of files) {
    for (const p of readFile(new Uint8Array(await file.arrayBuffer()), file.name)) pieces.push(p);
  }
  const known = new Set<Discipline>(expected.filter((d) => DISCIPLINES.includes(d)));
  const allowed: ReadonlySet<Discipline> = known.size > 0 ? known : new Set(DISCIPLINES);
  const typed = pieces
    .filter((p) => p.kind !== null || p.fixes.length >= 2)
    .flatMap((p) => (p.kind === null ? splitBySpeed(p, allowed) : [p]))
    .filter((p) => p.kind !== 'transition')
    .map(withTotals);
  const sorted = typed.every((p) => p.start !== null)
    ? [...typed].sort((a, b) => a.start! - b.start!)
    : typed;
  const legs = mergeSameDiscipline(assignByOrder(dropTransitions(sorted), expected)).map(
    (p): ImportedLeg => ({
      discipline: p.kind,
      name: p.name,
      points: simplifyRoute(p.fixes.map((f) => f.p)),
      distanceKm: p.distanceKm === null ? null : Math.round(p.distanceKm * 1000) / 1000,
      durationS: p.durationS === null ? null : Math.round(p.durationS),
      source: p.source,
    }),
  );
  if (!legs.some((l) => l.points.length >= 2)) throw new ActivityImportError('no_lines');
  return legs;
}
