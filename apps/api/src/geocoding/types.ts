import type { GeocodeResult } from '@mapmory/design-schema';

export interface SearchOptions {
  lang: string;
  limit: number;
  /** Optional location bias [lng, lat]. */
  near?: [number, number];
}

export interface Geocoder {
  readonly name: string;
  search(query: string, options: SearchOptions): Promise<GeocodeResult[]>;
  reverse(lngLat: [number, number], lang: string): Promise<GeocodeResult | null>;
}

export class GeocoderUnavailableError extends Error {}
