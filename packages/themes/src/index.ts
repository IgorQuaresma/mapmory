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
      body: { fontId: 'cormorant-garamond', weight: 600, uppercase: true, letterSpacing: 0.2 },
    },
    frame: { style: 'none', color: '#7A2E3B' },
    shape: 'circle',
    roadWeight: 1,
    buildingOpacity: 0.8,
    labelFont: 'cormorant-garamond',
  },
  sepia: {
    id: 'sepia',
    name: 'Sepia',
    description: 'Aged paper and brown ink, like an old atlas.',
    palette: {
      land: '#EFE3CC', water: '#C9B79C', parks: '#E2D5B5', roads: '#5B4632',
      roadsMinor: '#8F7A5F', buildings: '#E5D6BC', rail: '#9C8A70', labels: '#4A3828',
    },
    layers: allLayers({ railways: true }),
    pageBackground: '#F3E9D6',
    textColor: '#4A3828',
    accent: '#8E3B2F',
    typography: {
      title: { fontId: 'cormorant-garamond', weight: 600, uppercase: false, letterSpacing: 0.02 },
      body: { fontId: 'cormorant-garamond', weight: 500, uppercase: true, letterSpacing: 0.18 },
    },
    frame: { style: 'double-line', color: '#4A3828' },
    shape: 'rect',
    roadWeight: 1,
    buildingOpacity: 0.85,
    labelFont: 'cormorant-garamond',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Light streets on a deep night-blue city.',
    palette: {
      land: '#121826', water: '#0A1B2E', parks: '#16243A', roads: '#E8E3D3',
      roadsMinor: '#6C7A91', buildings: '#1B2233', rail: '#3E4A5E', labels: '#E8E3D3',
    },
    layers: allLayers(),
    pageBackground: '#0E1420',
    textColor: '#E8E3D3',
    accent: '#F2C14E',
    typography: {
      title: { fontId: 'josefin-sans', weight: 600, uppercase: true, letterSpacing: 0.25 },
      body: { fontId: 'josefin-sans', weight: 300, uppercase: true, letterSpacing: 0.25 },
    },
    frame: { style: 'none', color: '#E8E3D3' },
    shape: 'rect',
    roadWeight: 1,
    buildingOpacity: 1,
    labelFont: 'inter',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Greens and earth tones for the adventurous.',
    palette: {
      land: '#EEF0E6', water: '#A9C6C9', parks: '#B9CDA3', roads: '#2F4A35',
      roadsMinor: '#7C927F', buildings: '#DCE1CF', rail: '#8DA08F', labels: '#2F4A35',
    },
    layers: allLayers({ paths: true }),
    pageBackground: '#EEF0E6',
    textColor: '#2F4A35',
    accent: '#D2691E',
    typography: {
      title: { fontId: 'montserrat', weight: 700, uppercase: true, letterSpacing: 0.12 },
      body: { fontId: 'montserrat', weight: 400, uppercase: true, letterSpacing: 0.2 },
    },
    frame: { style: 'thick-line', color: '#2F4A35' },
    shape: 'rect',
    roadWeight: 1,
    buildingOpacity: 0.9,
    labelFont: 'inter',
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
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue water and crisp coastlines.',
    palette: {
      land: '#F2F6F8', water: '#2F6F8F', parks: '#DDE9E4', roads: '#1E3D4F',
      roadsMinor: '#7F9BAA', buildings: '#E3EBEF', rail: '#9FB3BE', labels: '#1E3D4F',
    },
    layers: allLayers(),
    pageBackground: '#F2F6F8',
    textColor: '#1E3D4F',
    accent: '#E07A5F',
    typography: {
      title: { fontId: 'inter', weight: 700, uppercase: false, letterSpacing: 0 },
      body: { fontId: 'inter', weight: 400, uppercase: true, letterSpacing: 0.2 },
    },
    frame: { style: 'none', color: '#1E3D4F' },
    shape: 'rounded',
    roadWeight: 1,
    buildingOpacity: 0.9,
    labelFont: 'inter',
  },
};

export const THEME_LIST: Theme[] = Object.values(THEMES);

/** Deterministic mood → theme table (plan §9). The LLM only picks a mood from an enum. */
export const MOOD_THEME: Record<Mood, ThemeId> = {
  romantic: 'blush',
  nostalgic: 'sepia',
  adventurous: 'forest',
  celebratory: 'gold-ink',
  calm: 'minimal',
  bittersweet: 'midnight',
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
