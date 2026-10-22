import type { DraftInput, GeocodeResult } from '@mapmory/design-schema';

export const pontDesArts: GeocodeResult = {
  id: 'W23456789',
  name: 'Pont des Arts',
  label: 'Pont des Arts, Paris, France',
  lngLat: [2.33753, 48.85826],
  bbox: null,
  type: 'poi',
  city: 'Paris',
  country: 'France',
};

export const paris: GeocodeResult = {
  id: 'R7444',
  name: 'Paris',
  label: 'Paris, Île-de-France, France',
  lngLat: [2.3483915, 48.8534951],
  bbox: [2.224122, 48.815575, 2.469703, 48.902156],
  type: 'city',
  city: 'Paris',
  country: 'France',
};

export const draftInput = (overrides: Partial<DraftInput> = {}): DraftInput => ({
  places: [pontDesArts],
  title: 'Where it all began',
  subtitle: null,
  date: { iso: '2019-06-14', precision: 'day' },
  mood: 'romantic',
  locale: 'en',
  ...overrides,
});
