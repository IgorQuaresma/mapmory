import type { GeocodeResult } from '@mapmory/design-schema';
import { toScreen } from '@mapmory/poster-core';
import type { Geocoder } from './types';

/** Offline geocoder covering the development tile regions; used in tests and offline dev. */
export const STUB_PLACES: GeocodeResult[] = [
  { id: 'W1', name: 'Pont des Arts', label: 'Pont des Arts, Paris, France', lngLat: [2.33753, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France' },
  { id: 'W2', name: 'Eiffel Tower', label: 'Eiffel Tower, Paris, France', lngLat: [2.29448, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France' },
  { id: 'W3', name: 'Montmartre', label: 'Montmartre, Paris, France', lngLat: [2.34224, 48.88672], bbox: null, type: 'district', city: 'Paris', country: 'France' },
  { id: 'R1', name: 'Paris', label: 'Paris, Île-de-France, France', lngLat: [2.34839, 48.8535], bbox: [2.224122, 48.815575, 2.469703, 48.902156], type: 'city', city: 'Paris', country: 'France' },
  { id: 'W4', name: 'St.-Paulus-Dom', label: 'St.-Paulus-Dom, Münster, Germany', lngLat: [7.62568, 51.96296], bbox: null, type: 'poi', city: 'Münster', country: 'Germany' },
  { id: 'W5', name: 'Prinzipalmarkt', label: 'Prinzipalmarkt, Münster, Germany', lngLat: [7.62845, 51.96235], bbox: null, type: 'street', city: 'Münster', country: 'Germany' },
  { id: 'W6', name: 'Aasee', label: 'Aasee, Münster, Germany', lngLat: [7.6086, 51.9551], bbox: null, type: 'poi', city: 'Münster', country: 'Germany' },
  { id: 'R2', name: 'Münster', label: 'Münster, North Rhine-Westphalia, Germany', lngLat: [7.62571, 51.96236], bbox: [7.4737, 51.8401, 7.7743, 52.0602], type: 'city', city: 'Münster', country: 'Germany' },
  { id: 'W7', name: 'Belém Tower', label: 'Belém Tower, Lisbon, Portugal', lngLat: [-9.21596, 38.69157], bbox: null, type: 'poi', city: 'Lisbon', country: 'Portugal' },
  { id: 'W8', name: 'Praça do Comércio', label: 'Praça do Comércio, Lisbon, Portugal', lngLat: [-9.13654, 38.70757], bbox: null, type: 'poi', city: 'Lisbon', country: 'Portugal' },
  { id: 'R3', name: 'Lisbon', label: 'Lisbon, Portugal', lngLat: [-9.13934, 38.72225], bbox: [-9.2298, 38.6914, -9.0866, 38.7958], type: 'city', city: 'Lisbon', country: 'Portugal' },
  { id: 'W9', name: 'Brooklyn Bridge', label: 'Brooklyn Bridge, New York, United States', lngLat: [-73.99686, 40.70608], bbox: null, type: 'poi', city: 'New York', country: 'United States' },
  { id: 'W10', name: 'Central Park', label: 'Central Park, New York, United States', lngLat: [-73.96541, 40.78251], bbox: [-73.9817, 40.7644, -73.9493, 40.8006], type: 'poi', city: 'New York', country: 'United States' },
  { id: 'R4', name: 'Manhattan', label: 'Manhattan, New York, United States', lngLat: [-73.97125, 40.78306], bbox: [-74.0479, 40.6829, -73.9067, 40.8820], type: 'district', city: 'New York', country: 'United States' },
];

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function createStubGeocoder(): Geocoder {
  return {
    name: 'stub',
    async search(query, { limit }) {
      const words = normalize(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
      const scored = STUB_PLACES.map((p) => {
        const hay = normalize(`${p.name} ${p.label}`);
        const score = words.reduce((s, w) => s + (hay.includes(w) ? (normalize(p.name).includes(w) ? 3 : 1) : 0), 0);
        return { p, score };
      }).filter((x) => x.score > 0);
      return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
    },
    async reverse(lngLat) {
      let best: GeocodeResult | null = null;
      let bestD = Infinity;
      for (const p of STUB_PLACES) {
        const [x, y] = toScreen(p.lngLat, { center: lngLat, zoom: 12, bearing: 0, width: 0, height: 0 });
        const d = Math.hypot(x, y);
        if (d < bestD) { bestD = d; best = p; }
      }
      return best ? { ...best, id: `pin:${lngLat[0].toFixed(5)},${lngLat[1].toFixed(5)}`, name: `Near ${best.name}`, type: 'other', lngLat, bbox: null } : null;
    },
  };
}
