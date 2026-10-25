import type { Design } from '../src';

export const sampleDesign: Design = {
  schemaVersion: 4,
  page: {
    paper: 'A3',
    orientation: 'portrait',
    trimMm: { w: 297, h: 420 },
    marginDu: 60,
    background: '#F4EFE6',
    frame: { style: 'thin-line', color: '#2B2B2B', widthDu: 2, insetDu: 30 },
  },
  map: {
    insetDu: { top: 60, right: 60, bottom: 300, left: 60 },
    center: [2.33753, 48.85826],
    zoom: 15.2,
    bearing: 0,
    shape: 'rect',
    outline: { widthDu: 0, color: '#2B2B2B' },
    themeId: 'classic-ink',
    palette: {
      land: '#F4EFE6', water: '#BFD3D9', parks: '#DCE3CF', roads: '#2B2B2B',
      roadsMinor: '#8A8A8A', buildings: '#E6DFD3', rail: '#8A8A8A', labels: '#2B2B2B',
    },
    layers: { roads: true, paths: false, buildings: true, water: true, parks: true, railways: false, labels: false },
    labelLanguage: 'en',
    roadWeight: 1,
  },
  markers: [{ id: 'm1', lngLat: [2.33753, 48.85826], icon: 'heart', color: '#C0392B', sizeDu: 28 }],
  texts: [
    {
      id: 'title', role: 'title', content: 'Where it all began', fontId: 'playfair-display', weight: 700, italic: false,
      sizeDu: 64, letterSpacing: 0.02, uppercase: false, color: '#2B2B2B', align: 'center', slot: 'bottom', order: 0,
      offsetDu: [0, 0], visible: true, freePosition: null, rotationDeg: 0,
    },
    {
      id: 'subtitle', role: 'subtitle', content: 'Pont des Arts · Paris', fontId: 'montserrat', weight: 400, italic: false,
      sizeDu: 22, letterSpacing: 0.2, uppercase: true, color: '#2B2B2B', align: 'center', slot: 'bottom', order: 1,
      offsetDu: [0, 0], visible: true, freePosition: null, rotationDeg: 0,
    },
  ],
  routes: [],
  photos: [],
  sport: null,
  attribution: { corner: 'bottom-right' },
};
