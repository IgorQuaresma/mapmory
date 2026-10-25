import { describe, expect, it } from 'vitest';
import {
  ActivityImportError,
  MAX_ACTIVITY_FILE_BYTES,
  importActivityFiles,
  type ImportedLeg,
} from './activity-import';

// ─── Synthetic tracks ────────────────────────────────────────────────────────

interface Fix {
  lng: number;
  lat: number;
  t?: number;
}
/** One stretch of movement: speed, minutes, heading (0 = east, 90 = north), sampling interval, GPS noise (σ, m). */
interface Stretch {
  kmh: number;
  min: number;
  heading?: number;
  everyS?: number;
  noiseM?: number;
}

/** Deterministic PRNG (mulberry32) so the noisy tracks are the same on every run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORIGIN = { lng: 8.5, lat: 47.3 };
const M_PER_DEG = 111_320;
const RACE_START = Date.UTC(2026, 5, 14, 7, 0, 0);

/** A track through the stretches; also returns where (and when) each stretch starts. */
function trace(stretches: Stretch[], t0 = RACE_START, seed = 1) {
  const rnd = random(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const cos = Math.cos((ORIGIN.lat * Math.PI) / 180);
  const toLngLat = (x: number, y: number) => ({
    lng: ORIGIN.lng + x / (M_PER_DEG * cos),
    lat: ORIGIN.lat + y / M_PER_DEG,
  });
  const fixes: Required<Fix>[] = [];
  const starts: { lng: number; lat: number; t: number }[] = [];
  let [x, y, t] = [0, 0, t0];
  for (const s of stretches) {
    const every = s.everyS ?? 2;
    const v = s.kmh / 3.6;
    const h = ((s.heading ?? 0) * Math.PI) / 180;
    starts.push({ ...toLngLat(x, y), t });
    for (let e = 0; e < s.min * 60; e += every) {
      const noise = s.noiseM ?? 3;
      fixes.push({ ...toLngLat(x + gauss() * noise, y + gauss() * noise), t });
      x += Math.cos(h) * v * every;
      y += Math.sin(h) * v * every;
      t += every * 1000;
    }
  }
  return { fixes, starts, end: t };
}

const distM = (a: { lng: number; lat: number }, b: [number, number]) =>
  Math.hypot(
    (a.lng - b[0]) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180),
    (a.lat - b[1]) * M_PER_DEG,
  );

interface GpxTrack {
  name?: string;
  type?: string;
  fixes: Fix[];
}
const gpx = (tracks: GpxTrack[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${tracks
    .map(
      (trk) =>
        `<trk>${trk.name ? `<name>${trk.name}</name>` : ''}${trk.type ? `<type>${trk.type}</type>` : ''}<trkseg>${trk.fixes
          .map(
            (f) =>
              `<trkpt lat="${f.lat.toFixed(7)}" lon="${f.lng.toFixed(7)}">${f.t === undefined ? '' : `<time>${new Date(f.t).toISOString()}</time>`}</trkpt>`,
          )
          .join('')}</trkseg></trk>`,
    )
    .join('')}</gpx>`;

const file = (content: BlobPart, name: string) => new File([content], name);
const disciplines = (legs: ImportedLeg[]) => legs.map((l) => l.discipline);
const TRI = ['swim', 'bike', 'run'] as const;
const tri = () => [...TRI];

// ─── A tiny FIT encoder ──────────────────────────────────────────────────────

type FieldDef = [num: number, size: number, baseType: number];
const ENUM = 0x00;
const SINT32 = 0x85;
const UINT32 = 0x86;
const FIT_EPOCH_S = Date.UTC(1989, 11, 31) / 1000;
const fitTime = (ms: number) => Math.round(ms / 1000 - FIT_EPOCH_S);
const semicircles = (deg: number) => Math.round((deg * 2 ** 31) / 180);

class FitWriter {
  private bytes: number[] = [];
  private defs = new Map<number, { fields: FieldDef[]; little: boolean; devBytes: number }>();

  define(
    local: number,
    global: number,
    fields: FieldDef[],
    { bigEndian = false, devSizes = [] as number[] } = {},
  ) {
    const little = !bigEndian;
    this.bytes.push(0x40 | (devSizes.length ? 0x20 : 0) | local, 0, bigEndian ? 1 : 0);
    this.bytes.push(...this.encode(global, 2, 0x84, little), fields.length);
    for (const f of fields) this.bytes.push(...f);
    if (devSizes.length) {
      this.bytes.push(devSizes.length);
      devSizes.forEach((size, i) => this.bytes.push(i, size, 0));
    }
    const devBytes = devSizes.reduce((a, b) => a + b, 0);
    this.defs.set(local, { fields, little, devBytes });
    return this;
  }

  /** A data message; with `compressedOffset`, a compressed-timestamp header (local types 0–3 only). */
  data(local: number, values: number[], compressedOffset?: number) {
    const def = this.defs.get(local)!;
    this.bytes.push(
      compressedOffset === undefined ? local : 0x80 | (local << 5) | (compressedOffset & 0x1f),
    );
    def.fields.forEach(([, size, type], i) =>
      this.bytes.push(...this.encode(values[i]!, size, type, def.little)),
    );
    for (let i = 0; i < def.devBytes; i++) this.bytes.push(0xab);
    return this;
  }

  build(): Uint8Array<ArrayBuffer> {
    const size = this.bytes.length;
    const header = [
      14,
      0x20,
      0x54,
      0x08,
      size & 0xff,
      (size >> 8) & 0xff,
      (size >> 16) & 0xff,
      size >>> 24,
    ];
    return new Uint8Array([...header, 0x2e, 0x46, 0x49, 0x54, 0, 0, ...this.bytes, 0, 0]);
  }

  private encode(v: number, size: number, type: number, little: boolean): number[] {
    const view = new DataView(new ArrayBuffer(size));
    const signed = [0x01, 0x03, 0x05].includes(type & 0x1f);
    if (size === 1) view.setUint8(0, v);
    else if (size === 2) (signed ? view.setInt16 : view.setUint16).call(view, 0, v, little);
    else (signed ? view.setInt32 : view.setUint32).call(view, 0, v, little);
    return [...new Uint8Array(view.buffer)];
  }
}

interface FitSessionSpec {
  sport: number;
  min: number;
  km: number;
  kmh: number;
  heading?: number;
}

/**
 * file_id, then records every 10 s (every second one with a compressed timestamp, plus a developer field to skip),
 * then the sessions in a big-endian definition, as Garmin writes them at the end.
 */
function fitActivity(sessions: FitSessionSpec[], t0 = RACE_START) {
  const w = new FitWriter()
    .define(0, 0, [
      [0, 1, ENUM],
      [4, 4, UINT32],
    ])
    .data(0, [4, fitTime(t0)])
    .define(
      1,
      20,
      [
        [253, 4, UINT32],
        [0, 4, SINT32],
        [1, 4, SINT32],
      ],
      { devSizes: [2] },
    )
    .define(2, 20, [
      [0, 4, SINT32],
      [1, 4, SINT32],
    ]);
  const { fixes } = trace(
    sessions.map((s) => ({ kmh: s.kmh, min: s.min, heading: s.heading, everyS: 10, noiseM: 0 })),
    t0,
  );
  fixes.forEach((f, i) => {
    const ts = fitTime(f.t);
    const pos = [semicircles(f.lat), semicircles(f.lng)];
    if (i % 2) w.data(2, pos, ts);
    else w.data(1, [ts, ...pos]);
  });
  w.define(
    3,
    18,
    [
      [253, 4, UINT32],
      [2, 4, UINT32],
      [7, 4, UINT32],
      [9, 4, UINT32],
      [5, 1, ENUM],
    ],
    { bigEndian: true },
  );
  let start = t0;
  for (const s of sessions) {
    const end = start + s.min * 60_000;
    w.data(3, [fitTime(end), fitTime(start), s.min * 60_000, s.km * 100_000, s.sport]);
    start = end;
  }
  return w.build();
}

const MULTISPORT: FitSessionSpec[] = [
  { sport: 5, min: 30, km: 1.5, kmh: 3, heading: 0 },
  { sport: 3, min: 3, km: 0.3, kmh: 6, heading: 90 },
  { sport: 2, min: 60, km: 40, kmh: 40, heading: 90 },
  { sport: 3, min: 2, km: 0.2, kmh: 6, heading: 180 },
  { sport: 1, min: 40, km: 10, kmh: 15, heading: 270 },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FIT', () => {
  it('splits a multisport file into its sessions, with totals from the file and transitions dropped', async () => {
    const legs = await importActivityFiles([file(fitActivity(MULTISPORT), 'race.fit')], tri());
    expect(legs.map(({ points, ...rest }) => ({ ...rest, hasLine: points.length >= 2 }))).toEqual([
      {
        discipline: 'swim',
        name: '',
        distanceKm: 1.5,
        durationS: 1800,
        source: 'file',
        hasLine: true,
      },
      {
        discipline: 'bike',
        name: '',
        distanceKm: 40,
        durationS: 3600,
        source: 'file',
        hasLine: true,
      },
      {
        discipline: 'run',
        name: '',
        distanceKm: 10,
        durationS: 2400,
        source: 'file',
        hasLine: true,
      },
    ]);
    // Records were assigned by time: the bike starts where T1 ended, ~150 m north of the swim exit.
    const swimEnd = legs[0]!.points.at(-1)!;
    const bikeStart = legs[1]!.points[0]!;
    expect(bikeStart[1] - swimEnd[1]).toBeGreaterThan(0.001);
  });

  it('reads a single-sport run, also without a .fit extension', async () => {
    const run = fitActivity([{ sport: 1, min: 45, km: 10.2, kmh: 13.6 }]);
    for (const name of ['run.fit', 'export.bin']) {
      const legs = await importActivityFiles([file(run, name)], tri());
      expect(legs).toHaveLength(1);
      expect(legs[0]).toMatchObject({
        discipline: 'run',
        distanceKm: 10.2,
        durationS: 2700,
        source: 'file',
      });
    }
  });

  it('rejects corrupt and truncated files', async () => {
    const good = fitActivity(MULTISPORT);
    const patched = (bytes: Uint8Array<ArrayBuffer>) => {
      const copy = bytes.slice();
      new DataView(copy.buffer).setUint32(4, copy.length - 14, true);
      return copy;
    };
    const header = good.slice(0, 14);
    const cases: Uint8Array<ArrayBuffer>[] = [
      good.slice(0, good.length - 40), // data size beyond the end of the file
      patched(good.slice(0, 14 + 200 + 3)), // a message cut in half
      patched(new Uint8Array([...header, 0x05, 1, 2, 3])), // data message without a definition
      patched(new Uint8Array([...header, 0x40, 0, 0])), // truncated definition
      patched(new Uint8Array([...header, 0x40, 0, 7, 20, 0, 0])), // unknown architecture
      new TextEncoder().encode('definitely not a FIT file'),
    ];
    for (const bytes of cases) {
      await expect(importActivityFiles([file(bytes, 'bad.fit')], tri())).rejects.toMatchObject({
        code: 'unreadable',
      });
    }
  });
});

describe('GPX', () => {
  it('reads typed tracks and drops a typed transition', async () => {
    const { fixes, starts } = trace([
      { kmh: 3, min: 20, everyS: 5 },
      { kmh: 6, min: 2 },
      { kmh: 30, min: 40, everyS: 5, heading: 90 },
      { kmh: 11, min: 30, everyS: 5, heading: 180 },
    ]);
    const cut = (i: number) =>
      fixes.filter((f) => f.t >= starts[i]!.t && (!starts[i + 1] || f.t < starts[i + 1]!.t));
    const text = gpx([
      { name: 'Lake', type: 'open_water_swimming', fixes: cut(0) },
      { type: 'transition', fixes: cut(1) },
      { type: 'road_biking', fixes: cut(2) },
      { name: 'Laufen', type: 'running', fixes: cut(3) },
    ]);
    const legs = await importActivityFiles([file(text, 'race.gpx')], tri());
    expect(legs.map((l) => [l.discipline, l.name, l.source])).toEqual([
      ['swim', 'Lake', 'file'],
      ['bike', '', 'file'],
      ['run', 'Laufen', 'file'],
    ]);
    expect(legs[1]!.distanceKm).toBeGreaterThan(19.5);
    expect(legs[1]!.distanceKm).toBeLessThan(21.5);
    expect(Math.abs(legs[2]!.durationS! - 30 * 60)).toBeLessThanOrEqual(5); // last fix 5 s before the end
  });

  it('reads the discipline from track names in several languages, without times', async () => {
    const line = (lng: number): Fix[] => [
      { lng, lat: 47 },
      { lng: lng + 0.01, lat: 47.01 },
    ];
    const text = gpx([
      { name: 'Swim', fixes: line(8) },
      { name: 'Radstrecke', fixes: line(8.1) },
      { name: 'Corrida', fixes: line(8.2) },
    ]);
    const legs = await importActivityFiles([file(text, 'tracks.gpx')], ['run', 'bike', 'run']);
    expect(legs.map((l) => [l.discipline, l.name, l.source, l.durationS])).toEqual([
      ['swim', 'Swim', 'file', null],
      ['bike', 'Radstrecke', 'file', null],
      ['run', 'Corrida', 'file', null],
    ]);
  });

  it('splits one recorded triathlon by speed, despite noise, an aid-station stop, a climb and walking', async () => {
    const race = trace(
      [
        { kmh: 3, min: 15, everyS: 4, noiseM: 6 }, // 0 swim
        { kmh: 3, min: 15, everyS: 4, noiseM: 6, heading: 90 },
        { kmh: 0, min: 1 }, // 2 T1: standing, then jogging with the bike
        { kmh: 6.5, min: 3, heading: 90 },
        { kmh: 32, min: 30, heading: 90 }, // 4 bike
        { kmh: 0, min: 3 }, // aid station
        { kmh: 32, min: 20 },
        { kmh: 14, min: 4 }, // climb
        { kmh: 32, min: 25, heading: 270 },
        { kmh: 4.5, min: 2, heading: 270 }, // 9 T2: walking, standing
        { kmh: 0, min: 1 },
        { kmh: 12, min: 25, heading: 180 }, // 11 run, out and back with a walk
        { kmh: 5, min: 1, heading: 180 },
        { kmh: 12, min: 24, heading: 0 },
      ],
      RACE_START,
      7,
    );
    const text = gpx([{ name: 'Ironman 70.3 Rapperswil', fixes: race.fixes }]);
    const t = performance.now();
    const legs = await importActivityFiles([file(text, 'race.gpx')], tri());
    expect(performance.now() - t).toBeLessThan(1500);

    expect(disciplines(legs)).toEqual(['swim', 'bike', 'run']);
    expect(legs.every((l) => l.source === 'speed' && l.name === 'Ironman 70.3 Rapperswil')).toBe(
      true,
    );
    const [swim, bike, run] = legs as [ImportedLeg, ImportedLeg, ImportedLeg];
    const minutes = (l: ImportedLeg) => l.durationS! / 60;
    expect(Math.abs(minutes(swim) - 30)).toBeLessThan(2);
    expect(Math.abs(minutes(bike) - 82)).toBeLessThan(2);
    expect(Math.abs(minutes(run) - 50)).toBeLessThan(2);
    // Leg starts within ~2 minutes of the truth: at 32 km/h that is ~1 km, at 12 km/h ~400 m.
    expect(distM(race.starts[4]!, bike.points[0]!)).toBeLessThan(1000);
    expect(distM(race.starts[11]!, run.points[0]!)).toBeLessThan(400);
    expect(bike.distanceKm).toBeGreaterThan(39);
    expect(bike.distanceKm).toBeLessThan(46);
    // Haversine over independent 3 m noise at 2 s inflates a run's 10 km (real GPS noise is smoother).
    expect(run.distanceKm).toBeGreaterThan(9.5);
    expect(run.distanceKm).toBeLessThan(13);
    expect(legs.every((l) => l.points.length <= 1000)).toBe(true);
  });

  it('splits a duathlon run/bike/run and keeps a lone untyped run whole', async () => {
    const race = trace([
      { kmh: 13, min: 46 },
      { kmh: 5, min: 2, heading: 90 },
      { kmh: 30, min: 80, heading: 90, everyS: 4 },
      { kmh: 0, min: 1, heading: 90 },
      { kmh: 12, min: 25, heading: 180 },
    ]);
    const legs = await importActivityFiles(
      [file(gpx([{ fixes: race.fixes }]), 'du.gpx')],
      ['run', 'bike', 'run'],
    );
    expect(disciplines(legs)).toEqual(['run', 'bike', 'run']);
    legs.forEach((l, i) => expect(Math.abs(l.durationS! / 60 - [46, 80, 25][i]!)).toBeLessThan(2));

    const run = trace([
      { kmh: 11, min: 20 },
      { kmh: 4, min: 2, heading: 90 }, // a walk up a hill
      { kmh: 11, min: 20, heading: 180 },
    ]);
    const single = await importActivityFiles([file(gpx([{ fixes: run.fixes }]), 'run.gpx')], tri());
    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({ discipline: 'run', source: 'speed' });
  });

  it('keeps walks inside a duathlon run as run, never swim', async () => {
    const race = trace(
      [
        { kmh: 12, min: 20 },
        { kmh: 4.5, min: 4, heading: 90 }, // walk in the first run
        { kmh: 12, min: 20 },
        { kmh: 0, min: 2 }, // T1
        { kmh: 30, min: 70, heading: 90, everyS: 4 },
        { kmh: 0, min: 1 }, // T2
        { kmh: 4, min: 3, heading: 180 }, // heavy legs: walking out of T2
        { kmh: 11, min: 15, heading: 180 },
        { kmh: 5, min: 4, heading: 180 }, // walk in the second run
        { kmh: 11, min: 10, heading: 180 },
        { kmh: 4.5, min: 10, heading: 0 }, // walking on after the finish
      ],
      RACE_START,
      3,
    );
    const legs = await importActivityFiles(
      [file(gpx([{ fixes: race.fixes }]), 'du.gpx')],
      ['run', 'bike', 'run'],
    );
    expect(legs.map((l) => [l.discipline, l.source])).toEqual([
      ['run', 'speed'],
      ['bike', 'speed'],
      ['run', 'speed'],
    ]);
    expect(Math.abs(legs[0]!.durationS! / 60 - 44)).toBeLessThan(2);
    expect(Math.abs(legs[1]!.durationS! / 60 - 70)).toBeLessThan(2);
  });

  it('reads everything moving as the discipline of a single-discipline race', async () => {
    const run = trace([
      { kmh: 11, min: 20 },
      { kmh: 4, min: 12, heading: 90 }, // a long walk: would be a swim by speed alone
      { kmh: 11, min: 10, heading: 180 },
    ]);
    const text = gpx([{ fixes: run.fixes }]);
    const legs = await importActivityFiles([file(text, 'run.gpx')], ['run']);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ discipline: 'run', source: 'speed' });
    expect(Math.abs(legs[0]!.durationS! / 60 - 42)).toBeLessThan(1);
    // With all three disciplines allowed, speed alone decides: the walk is a swim-speed stretch.
    expect(disciplines(await importActivityFiles([file(text, 'run.gpx')], tri()))).toContain(
      'swim',
    );
  });

  it('explains files without usable lines', async () => {
    const onePoint = gpx([{ name: 'Swim', fixes: [{ lng: 8, lat: 47 }] }]);
    await expect(importActivityFiles([file(onePoint, 'p.gpx')], tri())).rejects.toMatchObject({
      code: 'no_lines',
    });
    await expect(
      importActivityFiles([file('<html></html>', 'x.gpx')], tri()),
    ).rejects.toMatchObject({
      code: 'unreadable',
    });
  });
});

describe('TCX', () => {
  const trackpoints = (fixes: Required<Fix>[]) =>
    fixes
      .map(
        (f) =>
          `<Trackpoint><Time>${new Date(f.t).toISOString()}</Time><Position><LatitudeDegrees>${f.lat}</LatitudeDegrees><LongitudeDegrees>${f.lng}</LongitudeDegrees></Position></Trackpoint>`,
      )
      .join('');
  const activity = (sport: string, fixes: Required<Fix>[], distanceM: number) =>
    `<Activity Sport="${sport}"><Id>${new Date(fixes[0]!.t).toISOString()}</Id><Lap StartTime="${new Date(fixes[0]!.t).toISOString()}"><TotalTimeSeconds>1</TotalTimeSeconds><DistanceMeters>${distanceM}</DistanceMeters><Track>${trackpoints(fixes)}</Track></Lap></Activity>`;
  const tcx = (body: string) =>
    `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">${body}</TrainingCenterDatabase>`;

  it('reads a multisport session and leaves its transitions out', async () => {
    const { fixes, starts } = trace([
      { kmh: 12, min: 20, everyS: 10 },
      { kmh: 5, min: 2, everyS: 10 },
      { kmh: 30, min: 40, everyS: 10 },
      { kmh: 12, min: 10, everyS: 10 },
    ]);
    const cut = (i: number) =>
      fixes.filter((f) => f.t >= starts[i]!.t && (!starts[i + 1] || f.t < starts[i + 1]!.t));
    const body = `<MultiSportSession><Id>x</Id><FirstSport>${activity('Running', cut(0), 4000)}</FirstSport><NextSport><Transition><TotalTimeSeconds>120</TotalTimeSeconds><Track>${trackpoints(cut(1))}</Track></Transition>${activity('Biking', cut(2), 20000)}</NextSport><NextSport>${activity('Running', cut(3), 2000)}</NextSport></MultiSportSession>`;
    const legs = await importActivityFiles([file(tcx(body), 'du.tcx')], ['run', 'bike', 'run']);
    expect(legs.map((l) => [l.discipline, l.distanceKm, l.source])).toEqual([
      ['run', 4, 'file'],
      ['bike', 20, 'file'],
      ['run', 2, 'file'],
    ]);
    expect(legs[0]!.durationS).toBeCloseTo(20 * 60 - 10, -1);
  });

  it('sorts several files of different formats by time', async () => {
    const { fixes, starts } = trace([
      { kmh: 3, min: 20, everyS: 10, noiseM: 5 },
      { kmh: 30, min: 40, everyS: 10, heading: 90 },
      { kmh: 11, min: 30, everyS: 10, heading: 180 },
    ]);
    const cut = (i: number) =>
      fixes.filter((f) => f.t >= starts[i]!.t && (!starts[i + 1] || f.t < starts[i + 1]!.t));
    const run = file(
      tcx(`<Activities>${activity('Running', cut(2), 5500)}</Activities>`),
      'run.tcx',
    );
    const swim = file(gpx([{ type: 'swimming', fixes: cut(0) }]), 'swim.gpx');
    const bike = file(
      fitActivity([{ sport: 2, min: 40, km: 20, kmh: 30 }], starts[1]!.t),
      'bike.fit',
    );
    const legs = await importActivityFiles([run, bike, swim], tri());
    expect(legs.map((l) => [l.discipline, l.source])).toEqual([
      ['swim', 'file'],
      ['bike', 'file'],
      ['run', 'file'],
    ]);
    expect(legs[2]!.distanceKm).toBe(5.5);
  });
});

describe('GeoJSON', () => {
  const line = (from: [number, number], to: [number, number], name?: string) => ({
    type: 'Feature',
    properties: name ? { name } : {},
    geometry: {
      type: 'LineString',
      coordinates: [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], to],
    },
  });
  const collection = (...features: unknown[]) =>
    JSON.stringify({ type: 'FeatureCollection', features });

  it('assigns the expected order when nothing else tells the discipline', async () => {
    const text = collection(
      line([8, 47], [8.01, 47]),
      line([8.01, 47], [8.2, 47.1]),
      line([8.2, 47.1], [8.25, 47.1]),
    );
    const legs = await importActivityFiles([file(text, 'race.geojson')], tri());
    expect(legs.map((l) => [l.discipline, l.source, l.durationS])).toEqual([
      ['swim', 'order', null],
      ['bike', 'order', null],
      ['run', 'order', null],
    ]);
    expect(legs[1]!.distanceKm).toBeGreaterThan(15);

    const du = await importActivityFiles([file(text, 'du.json')], ['run', 'bike', 'run']);
    expect(disciplines(du)).toEqual(['run', 'bike', 'run']);
  });

  it('merges the pieces that continue each other when there are more lines than legs', async () => {
    const text = collection(
      line([8, 47], [8.01, 47]), // swim
      line([8.012, 47], [8.1, 47.05]), // bike, first part
      line([8.1, 47.05], [8.2, 47.1]), // bike, second part, starting where the first ended
      line([8.21, 47.1], [8.25, 47.1]), // run
    );
    const legs = await importActivityFiles([file(text, 'race.geojson')], tri());
    expect(disciplines(legs)).toEqual(['swim', 'bike', 'run']);
    expect(legs[1]!.points).toHaveLength(5); // both parts; the shared joint is de-duplicated
  });

  it('uses feature properties and names', async () => {
    const text = collection(
      { ...line([8, 47], [8.01, 47]), properties: { sport: 'swimming' } },
      line([8.01, 47], [8.2, 47.1], 'Vélo'),
      line([8.2, 47.1], [8.25, 47.1]),
    );
    const legs = await importActivityFiles([file(text, 'race.geojson')], ['run', 'bike', 'run']);
    expect(legs.map((l) => [l.discipline, l.source])).toEqual([
      ['swim', 'file'],
      ['bike', 'file'],
      ['run', 'order'],
    ]);
  });
});

describe('limits', () => {
  it('refuses files over 25 MB', async () => {
    const big = file(new Uint8Array(MAX_ACTIVITY_FILE_BYTES + 1), 'huge.fit');
    const err = await importActivityFiles([big], tri()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ActivityImportError);
    expect(err).toMatchObject({ code: 'too_large' });
  });
});
