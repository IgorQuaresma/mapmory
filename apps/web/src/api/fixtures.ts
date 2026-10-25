import type { GeocodeResult } from '@mapmory/design-schema';

/**
 * Geocoder fixture for the mock API, covering the four dev tile regions (Paris, Münster, Lisbon, Manhattan), plus two race
 * cities (Frankfurt, Berlin) for the race poster examples.
 */
export interface FixturePlace extends GeocodeResult {
  aliases: string[];
}

export const FIXTURE_PLACES: FixturePlace[] = [
  { id: 'W1', name: 'Pont des Arts', label: 'Pont des Arts, Paris, France', lngLat: [2.33753, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France', aliases: ['pont des arts', 'love lock bridge'] },
  { id: 'W2', name: 'Eiffel Tower', label: 'Eiffel Tower, Paris, France', lngLat: [2.29448, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France', aliases: ['eiffel tower', 'tour eiffel', 'eiffel', 'eiffelturm'] },
  { id: 'W3', name: 'Louvre Museum', label: 'Louvre Museum, Paris, France', lngLat: [2.33764, 48.86061], bbox: null, type: 'poi', city: 'Paris', country: 'France', aliases: ['louvre'] },
  { id: 'W4', name: 'Sacré-Cœur', label: 'Sacré-Cœur, Montmartre, Paris, France', lngLat: [2.34308, 48.88671], bbox: null, type: 'poi', city: 'Paris', country: 'France', aliases: ['sacre-coeur', 'sacre coeur', 'montmartre'] },
  { id: 'R7444', name: 'Paris', label: 'Paris, Île-de-France, France', lngLat: [2.3483915, 48.8534951], bbox: [2.224122, 48.815575, 2.469703, 48.902156], type: 'city', city: 'Paris', country: 'France', aliases: ['paris'] },
  { id: 'W5', name: 'St.-Paulus-Dom', label: 'St.-Paulus-Dom, Münster, Germany', lngLat: [7.62585, 51.96278], bbox: null, type: 'poi', city: 'Münster', country: 'Germany', aliases: ['paulus-dom', 'paulusdom', 'münster cathedral', 'munster cathedral', 'dom'] },
  { id: 'W6', name: 'Prinzipalmarkt', label: 'Prinzipalmarkt, Münster, Germany', lngLat: [7.62835, 51.96203], bbox: null, type: 'street', city: 'Münster', country: 'Germany', aliases: ['prinzipalmarkt'] },
  { id: 'W7', name: 'Aasee', label: 'Aasee, Münster, Germany', lngLat: [7.60853, 51.95496], bbox: null, type: 'poi', city: 'Münster', country: 'Germany', aliases: ['aasee'] },
  { id: 'R62591', name: 'Münster', label: 'Münster, North Rhine-Westphalia, Germany', lngLat: [7.6261, 51.9625], bbox: [7.52, 51.9, 7.72, 52.01], type: 'city', city: 'Münster', country: 'Germany', aliases: ['münster', 'munster', 'muenster'] },
  { id: 'W8', name: 'Belém Tower', label: 'Belém Tower, Lisbon, Portugal', lngLat: [-9.21598, 38.69158], bbox: null, type: 'poi', city: 'Lisbon', country: 'Portugal', aliases: ['belem tower', 'belém tower', 'torre de belém', 'torre de belem', 'belem', 'belém'] },
  { id: 'W9', name: 'Praça do Comércio', label: 'Praça do Comércio, Lisbon, Portugal', lngLat: [-9.13664, 38.70758], bbox: null, type: 'poi', city: 'Lisbon', country: 'Portugal', aliases: ['praca do comercio', 'praça do comércio', 'commerce square'] },
  { id: 'R5400890', name: 'Lisbon', label: 'Lisbon, Portugal', lngLat: [-9.1393, 38.7223], bbox: [-9.23, 38.69, -9.09, 38.8], type: 'city', city: 'Lisbon', country: 'Portugal', aliases: ['lisbon', 'lisboa', 'lissabon'] },
  { id: 'W10', name: 'Brooklyn Bridge', label: 'Brooklyn Bridge, New York, United States', lngLat: [-73.99686, 40.70608], bbox: null, type: 'poi', city: 'New York', country: 'United States', aliases: ['brooklyn bridge'] },
  { id: 'W11', name: 'Central Park', label: 'Central Park, Manhattan, New York, United States', lngLat: [-73.96546, 40.78255], bbox: [-73.9819, 40.7644, -73.9493, 40.8007], type: 'poi', city: 'New York', country: 'United States', aliases: ['central park'] },
  { id: 'W12', name: 'Times Square', label: 'Times Square, Manhattan, New York, United States', lngLat: [-73.98566, 40.75797], bbox: null, type: 'poi', city: 'New York', country: 'United States', aliases: ['times square'] },
  { id: 'R62400', name: 'Frankfurt am Main', label: 'Frankfurt am Main, Hesse, Germany', lngLat: [8.68212, 50.11064], bbox: [8.4727, 50.0155, 8.8004, 50.2271], type: 'city', city: 'Frankfurt am Main', country: 'Germany', aliases: ['frankfurt am main', 'frankfurt'] },
  { id: 'R62422', name: 'Berlin', label: 'Berlin, Germany', lngLat: [13.40495, 52.52001], bbox: [13.0884, 52.3383, 13.7612, 52.6755], type: 'city', city: 'Berlin', country: 'Germany', aliases: ['berlin', 'berlim'] },
  { id: 'R175905', name: 'New York', label: 'New York, United States', lngLat: [-73.9857, 40.7484], bbox: [-74.05, 40.68, -73.93, 40.82], type: 'city', city: 'New York', country: 'United States', aliases: ['new york', 'nyc', 'manhattan'] },
];

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function toResult({ aliases: _a, ...r }: FixturePlace): GeocodeResult {
  return r;
}
