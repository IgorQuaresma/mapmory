import { describe, expect, it } from 'vitest';
import { RouteImportError, importRouteFile, parseGeoJson, parseGpx } from './routes-import';

const GPX_TWO_TRACKS = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Morning walk</name>
    <trkseg><trkpt lat="48.8583" lon="2.2945"/><trkpt lat="48.8590" lon="2.3000"/></trkseg>
    <trkseg><trkpt lat="48.8600" lon="2.3100"/><trkpt lat="48.8606" lon="2.3376"/></trkseg>
  </trk>
  <trk><trkseg><trkpt lat="48.85" lon="2.35"/><trkpt lat="48.86" lon="2.36"/></trkseg></trk>
</gpx>`;

const GPX_ROUTE = `<gpx version="1.1"><rte><name>Planned</name><rtept lat="38.69" lon="-9.21"/><rtept lat="38.70" lon="-9.20"/><rtept lat="38.71" lon="-9.19"/></rte></gpx>`;

const GEOJSON_MULTI = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Boat trip' }, geometry: { type: 'MultiLineString', coordinates: [[[-9.2, 38.69], [-9.19, 38.7]], [[-9.18, 38.71], [-9.17, 38.72]]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-9.2, 38.69] } },
  ],
});

const file = (content: string, name: string) => new File([content], name, { type: 'text/plain' });

describe('parseGpx', () => {
  it('returns one route per track with its segments joined, named from <name> or the file', () => {
    const r = parseGpx(GPX_TWO_TRACKS, 'paris');
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ name: 'Morning walk', points: [[2.2945, 48.8583], [2.3, 48.859], [2.31, 48.86], [2.3376, 48.8606]] });
    expect(r[1]!.name).toBe('paris 2');
  });

  it('reads planned routes (<rte>)', () => {
    expect(parseGpx(GPX_ROUTE, 'x')[0]).toEqual({ name: 'Planned', points: [[-9.21, 38.69], [-9.2, 38.7], [-9.19, 38.71]] });
  });

  it('rejects files that are not GPX', () => {
    expect(() => parseGpx('<html><body>hi</body></html>', 'x')).toThrow(RouteImportError);
    expect(() => parseGpx('<gpx><trk>', 'x')).toThrow(RouteImportError);
  });
});

describe('parseGeoJson', () => {
  it('joins MultiLineString parts and ignores points', () => {
    const r = parseGeoJson(GEOJSON_MULTI, 'lisbon');
    expect(r).toEqual([{ name: 'Boat trip', points: [[-9.2, 38.69], [-9.19, 38.7], [-9.18, 38.71], [-9.17, 38.72]] }]);
  });

  it('accepts a bare LineString geometry', () => {
    expect(parseGeoJson('{"type":"LineString","coordinates":[[1,2],[3,4]]}', 'line')).toEqual([{ name: 'line', points: [[1, 2], [3, 4]] }]);
  });
});

describe('importRouteFile', () => {
  it('detects the format and simplifies', async () => {
    expect((await importRouteFile(file(GPX_TWO_TRACKS, 'walk.gpx'))).map((r) => r.name)).toEqual(['Morning walk', 'walk 2']);
    expect((await importRouteFile(file(GEOJSON_MULTI, 'trip.geojson')))[0]!.points).toHaveLength(4);
  });

  it('explains files without usable lines', async () => {
    await expect(importRouteFile(file('{"type":"Point","coordinates":[1,2]}', 'p.geojson'))).rejects.toMatchObject({ code: 'no_lines' });
    await expect(importRouteFile(file('not json at all', 'x.json'))).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('refuses files over 15 MB', async () => {
    const big = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'huge.gpx');
    await expect(importRouteFile(big)).rejects.toMatchObject({ code: 'too_large' });
  });
});
