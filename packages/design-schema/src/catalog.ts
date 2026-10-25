/**
 * Catalog identifiers. The design document may only reference these enums — never URLs —
 * which removes SSRF and arbitrary-resource loading from the rendering path (plan §4.1, §8.1).
 */

export const THEME_IDS = [
  'classic-ink',
  'minimal',
  'blush',
  'old-letter',
  'night-train',
  'lavender-field',
  'gold-ink',
  'riviera',
  // Race posters (sport events).
  'race-day',
  'finisher',
  'trail',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const FONT_IDS = [
  'playfair-display',
  'montserrat',
  'fraunces',
  'inter',
  'josefin-sans',
  'great-vibes',
  'bricolage-grotesque',
  'dm-mono',
] as const;
export type FontId = (typeof FONT_IDS)[number];

export const MARKER_ICONS = ['heart', 'pin', 'star', 'dot', 'ring', 'flag', 'home'] as const;
export type MarkerIcon = (typeof MARKER_ICONS)[number];

export const MAP_SHAPES = ['rect', 'rounded', 'circle', 'heart', 'arch'] as const;
export type MapShape = (typeof MAP_SHAPES)[number];

export const FRAME_STYLES = ['none', 'thin-line', 'double-line', 'thick-line', 'airmail'] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

/** `free`: placed anywhere on the page (`freePosition`), dragged in the editor. */
export const TEXT_SLOTS = ['top', 'bottom', 'map-top', 'map-bottom', 'free'] as const;
export type TextSlot = (typeof TEXT_SLOTS)[number];

export const TEXT_ROLES = ['title', 'subtitle', 'date', 'coordinates', 'custom'] as const;
export type TextRole = (typeof TEXT_ROLES)[number];

export const LABEL_LANGUAGES = ['local', 'en', 'de', 'fr', 'es', 'pt', 'it', 'nl'] as const;
export type LabelLanguage = (typeof LABEL_LANGUAGES)[number];

export const ROUTE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type RouteStyle = (typeof ROUTE_STYLES)[number];

export const PHOTO_FRAMES = ['none', 'border', 'polaroid', 'circle'] as const;
export type PhotoFrame = (typeof PHOTO_FRAMES)[number];

/** Sport legs: each one gets its own map panel on a race poster. */
export const DISCIPLINES = ['swim', 'bike', 'run'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** Race formats; they set the default legs and distances of a race poster. */
export const SPORT_EVENTS = ['triathlon', 'duathlon', 'aquathlon', 'run', 'ride', 'swim'] as const;
export type SportEvent = (typeof SPORT_EVENTS)[number];

/** How the panels of a race poster share the map area. `hero`: the longest leg large, the others below it. */
export const PANEL_LAYOUTS = ['columns', 'rows', 'hero'] as const;
export type PanelLayout = (typeof PANEL_LAYOUTS)[number];

export const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
export type Corner = (typeof CORNERS)[number];

export const MOODS = [
  'romantic',
  'nostalgic',
  'adventurous',
  'celebratory',
  'calm',
  'bittersweet',
  'neutral',
] as const;
export type Mood = (typeof MOODS)[number];

export interface PaperSize {
  id: string;
  label: string;
  /** Portrait trim size in millimetres. */
  w: number;
  h: number;
  /** Highest DPI offered by default for this size (plan §7.3). */
  maxRecommendedDpi: 150 | 200 | 300;
}

export const PAPER_SIZES = {
  A4: { id: 'A4', label: 'A4 (21 × 29.7 cm)', w: 210, h: 297, maxRecommendedDpi: 300 },
  A3: { id: 'A3', label: 'A3 (29.7 × 42 cm)', w: 297, h: 420, maxRecommendedDpi: 300 },
  A2: { id: 'A2', label: 'A2 (42 × 59.4 cm)', w: 420, h: 594, maxRecommendedDpi: 300 },
  A1: { id: 'A1', label: 'A1 (59.4 × 84.1 cm)', w: 594, h: 841, maxRecommendedDpi: 200 },
  A0: { id: 'A0', label: 'A0 (84.1 × 118.9 cm)', w: 841, h: 1189, maxRecommendedDpi: 200 },
  LETTER: { id: 'LETTER', label: 'US Letter (8.5 × 11 in)', w: 215.9, h: 279.4, maxRecommendedDpi: 300 },
  '30x40': { id: '30x40', label: '30 × 40 cm', w: 300, h: 400, maxRecommendedDpi: 300 },
  '40x50': { id: '40x50', label: '40 × 50 cm', w: 400, h: 500, maxRecommendedDpi: 300 },
  '50x70': { id: '50x70', label: '50 × 70 cm', w: 500, h: 700, maxRecommendedDpi: 300 },
  '61x91': { id: '61x91', label: '61 × 91 cm', w: 610, h: 910, maxRecommendedDpi: 200 },
} as const satisfies Record<string, PaperSize>;

export type PaperId = keyof typeof PAPER_SIZES | 'custom';
export const PAPER_IDS = [...(Object.keys(PAPER_SIZES) as (keyof typeof PAPER_SIZES)[]), 'custom'] as const;

export const CUSTOM_PAPER_LIMITS_MM = { min: 100, max: 1200 } as const;

export const EXPORT_FORMATS = ['pdf', 'png', 'jpeg', 'tiff'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const EXPORT_DPIS = [150, 200, 300] as const;
export const BLEED_OPTIONS_MM = [0, 3, 5] as const;
export const COLOR_PROFILES = ['srgb', 'cmyk-fogra39'] as const;
export type ColorProfile = (typeof COLOR_PROFILES)[number];

/** Longest side of any rendered raster (GL renderbuffer limit, plan §7.3). */
export const MAX_RENDER_PX = 16384;
/** Slug area added around the bleed when crop marks are requested. */
export const CROP_MARK_SLUG_MM = 8;
