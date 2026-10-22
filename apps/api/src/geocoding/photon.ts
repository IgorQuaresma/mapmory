import type { GeocodeResult, PlaceType } from '@mapmory/design-schema';
import { fetchJson } from './http';
import type { Geocoder, SearchOptions } from './types';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown> & {
    osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; type?: string; name?: string;
    street?: string; housenumber?: string; city?: string; district?: string; county?: string; state?: string;
    country?: string; extent?: [number, number, number, number];
  };
}

const PHOTON_LANGS = new Set(['en', 'de', 'fr']);
const POI_KEYS = new Set(['tourism', 'amenity', 'historic', 'leisure', 'shop', 'man_made', 'bridge', 'natural', 'railway', 'aeroway', 'building']);

function placeType(p: PhotonFeature['properties']): PlaceType {
  switch (p.type) {
    case 'street': return 'street';
    case 'locality':
    case 'district': return 'district';
    case 'city': return 'city';
    case 'county': return 'county';
    case 'state': return 'state';
    case 'country': return 'country';
    case 'house': return p.osm_key && POI_KEYS.has(p.osm_key) && p.name ? 'poi' : 'house';
    default: return p.osm_key && POI_KEYS.has(p.osm_key) ? 'poi' : 'other';
  }
}

export function mapPhotonFeature(f: PhotonFeature): GeocodeResult {
  const p = f.properties;
  const name = p.name ?? ([p.street, p.housenumber].filter(Boolean).join(' ') || p.city || p.country || 'Unnamed place');
  const label = [name, p.city && p.city !== name ? p.city : null, p.state && p.state !== name ? p.state : null, p.country && p.country !== name ? p.country : null]
    .filter(Boolean)
    .join(', ');
  const ext = p.extent;
  return {
    id: `${p.osm_type ?? 'X'}${p.osm_id ?? 0}`.slice(0, 64),
    name: name.slice(0, 200),
    label: label.slice(0, 300),
    lngLat: [f.geometry.coordinates[0], f.geometry.coordinates[1]],
    // Photon extent is [minLon, maxLat, maxLon, minLat].
    bbox: ext ? [ext[0], ext[3], ext[2], ext[1]] : null,
    type: placeType(p),
    city: p.city ?? (p.type === 'city' ? (p.name ?? null) : null),
    country: p.country ?? null,
  };
}

export function createPhotonGeocoder(baseUrl: string, userAgent: string): Geocoder {
  const lang = (l: string) => (PHOTON_LANGS.has(l) ? l : 'default');
  return {
    name: 'photon',
    async search(query: string, { lang: l, limit, near }: SearchOptions) {
      const params: Record<string, string> = { q: query, limit: String(limit), lang: lang(l) };
      if (near) Object.assign(params, { lon: String(near[0]), lat: String(near[1]) });
      const data = (await fetchJson(baseUrl, 'api', params, userAgent)) as { features?: PhotonFeature[] };
      return (data.features ?? []).map(mapPhotonFeature);
    },
    async reverse([lng, lat], l) {
      const data = (await fetchJson(baseUrl, 'reverse', { lon: String(lng), lat: String(lat), lang: lang(l), limit: '1' }, userAgent)) as { features?: PhotonFeature[] };
      const f = data.features?.[0];
      return f ? { ...mapPhotonFeature(f), lngLat: [lng, lat] } : null;
    },
  };
}
