import type { FontId } from '@mapmory/design-schema';

export interface FontEntry {
  id: FontId;
  /** CSS font-family name registered by poster-react. */
  family: string;
  /** Basename in ./ttf (static instances `<file>-<weight>.ttf`) — the same files feed the browser preview, the PDF and the label glyphs (Martin). */
  file: string;
  weights: { min: number; max: number };
  category: 'serif' | 'sans' | 'script';
  /** Fontstack name Martin exposes for map labels. */
  labelFontstack: string;
  license: 'OFL-1.1';
}

export const FONT_CATALOG: Record<FontId, FontEntry> = {
  'playfair-display': {
    id: 'playfair-display', family: 'Mapmory Playfair Display', file: 'playfair-display',
    weights: { min: 400, max: 900 }, category: 'serif', labelFontstack: 'Playfair Display Regular', license: 'OFL-1.1',
  },
  montserrat: {
    id: 'montserrat', family: 'Mapmory Montserrat', file: 'montserrat',
    weights: { min: 100, max: 900 }, category: 'sans', labelFontstack: 'Montserrat Regular', license: 'OFL-1.1',
  },
  'cormorant-garamond': {
    id: 'cormorant-garamond', family: 'Mapmory Cormorant Garamond', file: 'cormorant-garamond',
    weights: { min: 300, max: 700 }, category: 'serif', labelFontstack: 'Cormorant Garamond Medium', license: 'OFL-1.1',
  },
  inter: {
    id: 'inter', family: 'Mapmory Inter', file: 'inter',
    weights: { min: 100, max: 900 }, category: 'sans', labelFontstack: 'Inter Regular', license: 'OFL-1.1',
  },
  'josefin-sans': {
    id: 'josefin-sans', family: 'Mapmory Josefin Sans', file: 'josefin-sans',
    weights: { min: 100, max: 700 }, category: 'sans', labelFontstack: 'Josefin Sans Regular', license: 'OFL-1.1',
  },
  'great-vibes': {
    id: 'great-vibes', family: 'Mapmory Great Vibes', file: 'great-vibes',
    weights: { min: 400, max: 400 }, category: 'script', labelFontstack: 'Great Vibes Regular', license: 'OFL-1.1',
  },
};

/** Fallback fontstack for map labels — broad script coverage. */
export const LABEL_FALLBACK_FONTSTACK = 'Noto Sans Regular';

export function clampWeight(fontId: FontId, weight: number): number {
  const { min, max } = FONT_CATALOG[fontId].weights;
  return Math.min(max, Math.max(min, Math.round(weight / 100) * 100));
}
