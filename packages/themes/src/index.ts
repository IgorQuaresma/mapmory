import type {
  FontId,
  FrameStyle,
  Layers,
  MapShape,
  MarkerIcon,
  Mood,
  Palette,
  ThemeId,
} from '@mapmory/design-schema';

export interface ThemeTypography {
  title: { fontId: FontId; weight: number; uppercase: boolean; letterSpacing: number };
  body: { fontId: FontId; weight: number; uppercase: boolean; letterSpacing: number };
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  palette: Palette;
  layers: Layers;
  pageBackground: string;
  textColor: string;
  accent: string;
  typography: ThemeTypography;
  frame: { style: FrameStyle; color: string };
  shape: MapShape;
  roadWeight: number;
  buildingOpacity: number;
  /** Fontstack used for map labels (must exist in Martin's font catalog). */
  labelFont: FontId;
}

const allLayers = (overrides: Partial<Layers> = {}): Layers => ({
  roads: true,
  paths: false,
  buildings: true,
  water: true,
  parks: true,
  railways: false,
  labels: false,
  ...overrides,
});

export const THEMES: Record<ThemeId, Theme> = {
  'classic-ink': {
    id: 'classic-ink',
    name: 'Classic Ink',
    description: 'Black ink on warm cream paper.',
    palette: {
      land: '#F5F1E8', water: '#CFD9DC', parks: '#E3E6D3', roads: '#1F1F1F',
      roadsMinor: '#5E5E5E', buildings: '#E8E1D3', rail: '#8A8A8A', labels: '#1F1F1F',
    },
    layers: allLayers(),
    pageBackground: '#F5F1E8',
    textColor: '#1F1F1F',
    accent: '#B23A3A',
    typography: {
      title: { fontId: 'playfair-display', weight: 700, uppercase: false, letterSpacing: 0 },
      body: { fontId: 'montserrat', weight: 400, uppercase: true, letterSpacing: 0.2 },
    },
    frame: { style: 'thin-line', color: '#1F1F1F' },
    shape: 'rect',
    roadWeight: 1,
    buildingOpacity: 0.9,
    labelFont: 'inter',
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean lines on white, nothing more.',
    palette: {
      land: '#FFFFFF', water: '#E6E9EC', parks: '#F1F3EE', roads: '#2A2A2A',
      roadsMinor: '#9A9A9A', buildings: '#F2F2F2', rail: '#BDBDBD', labels: '#444444',
    },
    layers: allLayers({ buildings: false }),
    pageBackground: '#FFFFFF',
    textColor: '#222222',
    accent: '#222222',
    typography: {
      title: { fontId: 'inter', weight: 600, uppercase: true, letterSpacing: 0.3 },
      body: { fontId: 'inter', weight: 400, uppercase: true, letterSpacing: 0.25 },
    },
    frame: { style: 'none', color: '#222222' },
    shape: 'rect',
    roadWeight: 0.9,
    buildingOpacity: 1,
    labelFont: 'inter',
  },
  blush: {
    id: 'blush',
    name: 'Blush',
    description: 'Soft rose tones for romantic moments.',
    palette: {
      land: '#F9E9E4', water: '#D9B8BE', parks: '#F2D8D3', roads: '#8C3B4A',
      roadsMinor: '#C48A93', buildings: '#F3DCD6', rail: '#C9A0A7', labels: '#7A2E3B',
    },
    layers: allLayers(),
    pageBackground: '#FBEFEA',
    textColor: '#7A2E3B',
    accent: '#C0392B',
    typography: {
      title: { fontId: 'great-vibes', weight: 400, uppercase: false, letterSpacing: 0 },
      body: { fontId: 'fraunces', weight: 500, uppercase: true, letterSpacing: 0.2 },
    },
    frame: { style: 'none', color: '#7A2E3B' },
    shape: 'circle',
    roadWeight: 1,
    buildingOpacity: 0.8,
    labelFont: 'fraunces',
  },
  'old-letter': {
    id: 'old-letter',
    name: 'Old Letter',
    description: 'Airmail paper with red-and-blue edge stripes and ink-drawn streets.',
    palette: {
      land: '#F2EFE6', water: '#C9D3DF', parks: '#E1E3D2', roads: '#1B1A33',
      roadsMinor: '#6E6A80', buildings: '#E7E2D6', rail: '#8A8698', labels: '#1B1A33',
    },
    layers: allLayers({ railways: true }),
    pageBackground: '#F2EFE6',
    textColor: '#1B1A33',
    accent: '#C42B4B',
    typography: {
      title: { fontId: 'fraunces', weight: 600, uppercase: false, letterSpacing: 0 },
      body: { fontId: 'dm-mono', weight: 400, uppercase: true, letterSpacing: 0.12 },
    },
    frame: { style: 'airmail', color: '#C42B4B' },
    shape: 'rect',
    roadWeight: 1,
    buildingOpacity: 0.85,
    labelFont: 'dm-mono',
  },
  'night-train': {
    id: 'night-train',
    name: 'Night Train',
    description: 'An indigo city with sunflower streets and railways lit like tracks at night.',
    palette: {
      land: '#17183A', water: '#0E0F2B', parks: '#1F2350', roads: '#FFC93C',
      roadsMinor: '#9C8A4A', buildings: '#1E1F47', rail: '#FFE7A3', labels: '#FFE7A3',
    },
    layers: allLayers({ railways: true }),
    pageBackground: '#12132E',
    textColor: '#FFE7A3',
    accent: '#FF5C7A',
    typography: {
      title: { fontId: 'bricolage-grotesque', weight: 700, uppercase: true, letterSpacing: 0.14 },
      body: { fontId: 'dm-mono', weight: 400, uppercase: true, letterSpacing: 0.15 },
    },
    frame: { style: 'none', color: '#FFE7A3' },
    shape: 'rect',
    roadWeight: 1,
    buildingOpacity: 1,
    labelFont: 'bricolage-grotesque',
  },
  'lavender-field': {
    id: 'lavender-field',
    name: 'Lavender Field',
    description: 'Lilac water, sage parks and plum streets, soft and calm.',
    palette: {
      land: '#F4F1F8', water: '#C9B8EE', parks: '#C7D8C0', roads: '#5B2A5E',
      roadsMinor: '#9C7FA0', buildings: '#E9E3F0', rail: '#B6A6C2', labels: '#5B2A5E',
    },
    layers: allLayers({ paths: true }),
    pageBackground: '#F4F1F8',
    textColor: '#4A2350',
    accent: '#7A4FD6',
    typography: {
      title: { fontId: 'fraunces', weight: 500, uppercase: false, letterSpacing: 0 },
      body: { fontId: 'bricolage-grotesque', weight: 500, uppercase: true, letterSpacing: 0.18 },
    },
    frame: { style: 'thin-line', color: '#4A2350' },
    shape: 'arch',
    roadWeight: 0.95,
    buildingOpacity: 0.9,
    labelFont: 'bricolage-grotesque',
  },
  'gold-ink': {
    id: 'gold-ink',
    name: 'Gold Ink',
    description: 'Gold lines on black for celebrations.',
    palette: {
      land: '#111111', water: '#1E1E1E', parks: '#1A1A1A', roads: '#D4AF6A',
      roadsMinor: '#8C7448', buildings: '#1C1C1C', rail: '#5A4C33', labels: '#D4AF6A',
    },
    layers: allLayers({ buildings: false }),
    pageBackground: '#0F0F0F',
    textColor: '#D4AF6A',
    accent: '#D4AF6A',
    typography: {
      title: { fontId: 'playfair-display', weight: 600, uppercase: false, letterSpacing: 0.02 },
      body: { fontId: 'montserrat', weight: 300, uppercase: true, letterSpacing: 0.3 },
    },
    frame: { style: 'thin-line', color: '#D4AF6A' },
    shape: 'rect',
    roadWeight: 1.1,
    buildingOpacity: 1,
    labelFont: 'playfair-display',
  },
  riviera: {
    id: 'riviera',
    name: 'Riviera',
    description: 'Sun-bleached paper, cobalt streets and coral water, like a postcard from the coast.',
    palette: {
      land: '#FBF3E9', water: '#F6B3A8', parks: '#E6ECD9', roads: '#2E3FD6',
      roadsMinor: '#8C96E6', buildings: '#F3E7D7', rail: '#A3A9E0', labels: '#1E2A8C',
    },
    layers: allLayers(),
    pageBackground: '#FBF3E9',
    textColor: '#1E2A8C',
    accent: '#E8364F',
    typography: {
      title: { fontId: 'bricolage-grotesque', weight: 800, uppercase: false, letterSpacing: -0.01 },
      body: { fontId: 'dm-mono', weight: 400, uppercase: true, letterSpacing: 0.12 },
    },
    frame: { style: 'none', color: '#1E2A8C' },
    shape: 'rounded',
    roadWeight: 1,
    buildingOpacity: 0.9,
    labelFont: 'bricolage-grotesque',
  },
};

export const THEME_LIST: Theme[] = Object.values(THEMES);

/** Deterministic mood → theme table (plan §9). The LLM only picks a mood from an enum. */
export const MOOD_THEME: Record<Mood, ThemeId> = {
  romantic: 'blush',
  nostalgic: 'old-letter',
  adventurous: 'riviera',
  celebratory: 'gold-ink',
  calm: 'lavender-field',
  bittersweet: 'night-train',
  neutral: 'classic-ink',
};

export const MOOD_MARKER: Record<Mood, MarkerIcon> = {
  romantic: 'heart',
  nostalgic: 'pin',
  adventurous: 'flag',
  celebratory: 'star',
  calm: 'dot',
  bittersweet: 'heart',
  neutral: 'pin',
};

export function getTheme(id: ThemeId): Theme {
  return THEMES[id];
}
