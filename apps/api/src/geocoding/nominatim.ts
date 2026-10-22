import type { GeocodeResult, PlaceType } from '@mapmory/design-schema';
import { fetchJson } from './http';
import type { Geocoder, SearchOptions } from './types';

interface NominatimResult {
  osm_type?: string; osm_id?: number; lat: string; lon: string; boundingbox?: [string, string, string, string];
  name?: string; display_name?: string; category?: string; type?: string; addresstype?: string;
  address?: Record<string, string>;
}

const POI_CATEGORIES = new Set(['tourism', 'amenity', 'historic', 'leisure', 'shop', 'man_made', 'bridge', 'natural', 'railway']);

function placeType(r: NominatimResult): PlaceType {
  if (r.category && POI_CATEGORIES.has(r.category)) return 'poi';
  switch (r.addresstype) {
    case 'house': case 'building': return 'house';
    case 'road': return 'street';
    case 'suburb': case 'neighbourhood': case 'quarter': case 'city_district': case 'borough': return 'district';
    case 'city': case 'town': case 'village': case 'municipality': return 'city';
    case 'county': return 'county';
    case 'state': case 'region': return 'state';
    case 'country': return 'country';
    default: return 'other';
  }
}

export function mapNominatim(r: NominatimResult): GeocodeResult {
  const a = r.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
  const name = r.name || r.display_name?.split(',')[0] || 'Unnamed place';
  const bb = r.boundingbox?.map(Number);
  return {
    id: `${(r.osm_type ?? 'x')[0]!.toUpperCase()}${r.osm_id ?? 0}`.slice(0, 64),
    name: name.slice(0, 200),
    label: (r.display_name ?? name).slice(0, 300),
    lngLat: [Number(r.lon), Number(r.lat)],
    // Nominatim boundingbox is [minLat, maxLat, minLon, maxLon].
    bbox: bb && bb.length === 4 ? [bb[2]!, bb[0]!, bb[3]!, bb[1]!] : null,
    type: placeType(r),
    city,
    country: a.country ?? null,
  };
}

export function createNominatimGeocoder(baseUrl: string, userAgent: string): Geocoder {
  return {
    name: 'nominatim',
    async search(query: string, { lang, limit }: SearchOptions) {
      const data = (await fetchJson(baseUrl, 'search', { q: query, format: 'jsonv2', addressdetails: '1', limit: String(limit), 'accept-language': lang }, userAgent)) as NominatimResult[];
      return data.map(mapNominatim);
    },
    async reverse([lng, lat], lang) {
      const data = (await fetchJson(baseUrl, 'reverse', { lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', 'accept-language': lang }, userAgent)) as NominatimResult & { error?: string };
      return data.error ? null : { ...mapNominatim(data), lngLat: [lng, lat] };
    },
  };
}
