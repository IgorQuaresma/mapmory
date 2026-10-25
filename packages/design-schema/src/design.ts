import { z } from 'zod';
import {
  CORNERS,
  CUSTOM_PAPER_LIMITS_MM,
  FONT_IDS,
  FRAME_STYLES,
  LABEL_LANGUAGES,
  MAP_SHAPES,
  MARKER_ICONS,
  PHOTO_FRAMES,
  ROUTE_STYLES,
  PAPER_IDS,
  TEXT_ROLES,
  TEXT_SLOTS,
  THEME_IDS,
} from './catalog';

export const SCHEMA_VERSION = 3 as const;
/** The trim width of every page, in design units (plan §4.1). */
export const PAGE_WIDTH_DU = 1000;
/** Routes carry coordinates, so designs may be larger than plain layouts. */
export const MAX_DESIGN_BYTES = 192 * 1024;
export const MAX_MARKERS = 20;
export const MAX_TEXTS = 12;
export const MAX_ROUTES = 5;
export const MAX_ROUTE_POINTS = 1000;
export const MAX_PHOTOS = 4;

/** Plain text only: no control characters (C0/C1) or lone surrogates. */
const plainText = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\p{Cc}\p{Cs}]*$/u, 'Text must not contain control characters');

export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a #RRGGBB colour');
export const Longitude = z.number().min(-180).max(180);
export const Latitude = z.number().min(-85.05112878).max(85.05112878);
export const LngLat = z.tuple([Longitude, Latitude]);
const du = (min: number, max: number) => z.number().min(min).max(max);

export const FrameSchema = z.object({
  style: z.enum(FRAME_STYLES),
  color: HexColor,
  widthDu: du(0.5, 20),
  insetDu: du(0, 200),
});

export const PageSchema = z.object({
  paper: z.enum(PAPER_IDS),
  orientation: z.enum(['portrait', 'landscape']),
  /** Resolved trim size after orientation is applied. */
  trimMm: z.object({
    w: z.number().min(CUSTOM_PAPER_LIMITS_MM.min).max(CUSTOM_PAPER_LIMITS_MM.max),
    h: z.number().min(CUSTOM_PAPER_LIMITS_MM.min).max(CUSTOM_PAPER_LIMITS_MM.max),
  }),
  marginDu: du(0, 250),
  background: HexColor,
  frame: FrameSchema,
});

export const PaletteSchema = z.object({
  land: HexColor,
  water: HexColor,
  parks: HexColor,
  roads: HexColor,
  roadsMinor: HexColor,
  buildings: HexColor,
  rail: HexColor,
  labels: HexColor,
});
export const PALETTE_KEYS = PaletteSchema.keyof().options;

export const LayersSchema = z.object({
  roads: z.boolean(),
  paths: z.boolean(),
  buildings: z.boolean(),
  water: z.boolean(),
  parks: z.boolean(),
  railways: z.boolean(),
  labels: z.boolean(),
});
export const LAYER_KEYS = LayersSchema.keyof().options;

export const InsetSchema = z.object({
  top: du(0, 1200),
  right: du(0, 500),
  bottom: du(0, 1200),
  left: du(0, 500),
});

export const MapSchema = z.object({
  /** Distance of the map viewport from the trim edges; 0 means the map bleeds off that edge. */
  insetDu: InsetSchema,
  center: LngLat,
  zoom: z.number().min(1).max(18),
  bearing: z.number().min(-180).max(180),
  shape: z.enum(MAP_SHAPES),
  outline: z.object({ widthDu: du(0, 20), color: HexColor }),
  themeId: z.enum(THEME_IDS),
  palette: PaletteSchema,
  layers: LayersSchema,
  labelLanguage: z.enum(LABEL_LANGUAGES),
  /** Scales road widths relative to the theme default. */
  roadWeight: z.number().min(0.25).max(3),
});

export const MarkerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  lngLat: LngLat,
  icon: z.enum(MARKER_ICONS),
  color: HexColor,
  sizeDu: du(8, 160),
});

export const TextSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  role: z.enum(TEXT_ROLES),
  content: plainText(200),
  fontId: z.enum(FONT_IDS),
  weight: z.number().int().min(100).max(900).multipleOf(100),
  italic: z.boolean(),
  sizeDu: du(6, 200),
  letterSpacing: z.number().min(-0.1).max(1),
  uppercase: z.boolean(),
  color: HexColor,
  align: z.enum(['left', 'center', 'right']),
  slot: z.enum(TEXT_SLOTS),
  order: z.number().int().min(0).max(20),
  offsetDu: z.tuple([du(-500, 500), du(-500, 500)]),
  visible: z.boolean(),
  /** Centre of the line box in page coordinates, used when `slot` is `free`. */
  freePosition: z.tuple([du(-200, 1200), du(-200, 2400)]).nullable(),
  rotationDeg: z.number().min(-90).max(90),
});

/** A track drawn on the map: an imported GPX/GeoJSON route or a line connecting the places. */
export const RouteSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  name: plainText(60),
  points: z.array(LngLat).min(2).max(MAX_ROUTE_POINTS),
  color: HexColor,
  widthDu: du(1, 24),
  style: z.enum(ROUTE_STYLES),
  /** Dots at the start and the end of the route. */
  endpoints: z.boolean(),
});

/**
 * A user photo placed on the page. `photoId` names an uploaded, re-encoded image owned by the project; the design
 * never holds a URL (plan §4.1). `aspect` (height / width) and `pxWidth` come from the stored image.
 */
export const PhotoSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  photoId: z.uuid(),
  /** Centre of the photo in page coordinates. */
  center: z.tuple([du(-200, 1200), du(-200, 2400)]),
  widthDu: du(40, 1000),
  aspect: z.number().min(0.2).max(5),
  pxWidth: z.number().int().min(1).max(20000),
  rotationDeg: z.number().min(-180).max(180),
  frame: z.enum(PHOTO_FRAMES),
  frameColor: HexColor,
});

export const DesignSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    page: PageSchema,
    map: MapSchema,
    markers: z.array(MarkerSchema).max(MAX_MARKERS),
    texts: z.array(TextSchema).max(MAX_TEXTS),
    routes: z.array(RouteSchema).max(MAX_ROUTES),
    photos: z.array(PhotoSchema).max(MAX_PHOTOS),
    attribution: z.object({ corner: z.enum(CORNERS) }),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const [i, t] of d.texts.entries()) {
      if (t.role === 'title' && t.content.length > 120) {
        ctx.addIssue({ code: 'custom', path: ['texts', i, 'content'], message: 'Title is limited to 120 characters' });
      }
      if (ids.has(t.id)) ctx.addIssue({ code: 'custom', path: ['texts', i, 'id'], message: 'Duplicate text id' });
      ids.add(t.id);
    }
    for (const [key, list] of [['routes', d.routes], ['photos', d.photos]] as const) {
      const seen = new Set<string>();
      for (const [i, item] of list.entries()) {
        if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: [key, i, 'id'], message: `Duplicate ${key} id` });
        seen.add(item.id);
      }
    }
    for (const [i, t] of d.texts.entries()) {
      if (t.slot === 'free' && !t.freePosition) {
        ctx.addIssue({ code: 'custom', path: ['texts', i, 'freePosition'], message: 'A freely placed text needs a position' });
      }
    }
    const markerIds = new Set<string>();
    for (const [i, m] of d.markers.entries()) {
      if (markerIds.has(m.id)) ctx.addIssue({ code: 'custom', path: ['markers', i, 'id'], message: 'Duplicate marker id' });
      markerIds.add(m.id);
    }
    const pageHeightDu = (PAGE_WIDTH_DU * d.page.trimMm.h) / d.page.trimMm.w;
    const { insetDu } = d.map;
    if (insetDu.left + insetDu.right > PAGE_WIDTH_DU - 100) {
      ctx.addIssue({ code: 'custom', path: ['map', 'insetDu'], message: 'Map is too narrow' });
    }
    if (insetDu.top + insetDu.bottom > pageHeightDu - 100) {
      ctx.addIssue({ code: 'custom', path: ['map', 'insetDu'], message: 'Map is too short' });
    }
  });

export type Design = z.infer<typeof DesignSchema>;
export type DesignPage = z.infer<typeof PageSchema>;
export type DesignMap = z.infer<typeof MapSchema>;
export type Palette = z.infer<typeof PaletteSchema>;
export type PaletteKey = keyof Palette;
export type Layers = z.infer<typeof LayersSchema>;
export type LayerKey = keyof Layers;
export type Marker = z.infer<typeof MarkerSchema>;
export type DesignText = z.infer<typeof TextSchema>;
export type Inset = z.infer<typeof InsetSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type Photo = z.infer<typeof PhotoSchema>;

/** Validates a design and its serialized size. Throws a ZodError on failure. */
export function parseDesign(input: unknown): Design {
  const json = JSON.stringify(input);
  if (json === undefined || utf8Length(json) > MAX_DESIGN_BYTES) {
    throw new Error(`Design exceeds ${MAX_DESIGN_BYTES} bytes`);
  }
  return DesignSchema.parse(input);
}

function utf8Length(value: string): number {
  let n = 0;
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Removes characters the schema rejects. Used on user input before validation. */
export function sanitizePlainText(value: string, max: number): string {
  return value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cs}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}
