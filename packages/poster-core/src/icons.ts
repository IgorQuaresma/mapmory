import type { MarkerIcon } from '@mapmory/design-schema';

/**
 * Marker icons as 24×24 SVG paths. Paths are adapted from Material Icons (Apache License 2.0).
 * `anchor` is the point (in the 24×24 box) placed exactly on the coordinate.
 */
export const MARKER_ICON_PATHS: Record<MarkerIcon, { d: string; anchor: [number, number]; evenOdd?: boolean }> = {
  heart: {
    d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    anchor: [12, 12],
  },
  pin: {
    d: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    anchor: [12, 22],
    evenOdd: true,
  },
  star: {
    d: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    anchor: [12, 12],
  },
  dot: { d: 'M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12z', anchor: [12, 12] },
  ring: {
    d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zm0 3.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11z',
    anchor: [12, 12],
    evenOdd: true,
  },
  flag: { d: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z', anchor: [6, 21] },
  home: { d: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z', anchor: [12, 20] },
};
