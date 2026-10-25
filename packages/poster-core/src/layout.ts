import type { Design, DesignText, FontId, MarkerIcon, PhotoFrame } from '@mapmory/design-schema';
import { readableInk } from './color';
import { offsetCenter, toScreen, type Viewport } from './geo';
import { canBleed, shapePath } from './shapes';
import { mmToDu, pageHeightDu } from './units';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidOutText {
  id: string;
  text: string;
  fontId: FontId;
  weight: number;
  italic: boolean;
  sizeDu: number;
  lineHeightDu: number;
  letterSpacingEm: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** Horizontal anchor: left edge, centre or right edge depending on `align`. */
  x: number;
  /** Top of the line box. */
  y: number;
  /** Available width for the slot (for overflow checks). */
  maxWidth: number;
  /** Rotation in degrees around the text's anchor point. */
  rotationDeg: number;
  /** True for freely placed texts (draggable in the editor). */
  free: boolean;
}

export interface LaidOutPhoto {
  id: string;
  photoId: string;
  /** Top-left corner and size of the photo itself, in page design units (before rotation). */
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
  frame: PhotoFrame;
  frameColor: string;
  /** Frame thickness: border on every side; a polaroid adds `framePadBottom` below. */
  framePad: number;
  framePadBottom: number;
}

export interface LaidOutMarker {
  id: string;
  icon: MarkerIcon;
  color: string;
  sizeDu: number;
  /** Coordinate position in page design units. */
  x: number;
  y: number;
  insideMap: boolean;
}

export interface PosterLayout {
  page: { w: number; h: number };
  bleedDu: number;
  slugDu: number;
  /** The whole output surface (trim + bleed + slug), in page coordinates. */
  outer: Rect;
  background: string;
  map: {
    /** Where the map raster is drawn (may extend into the bleed). */
    rect: Rect;
    /** The map area as designed, inside the trim. */
    trimRect: Rect;
    viewport: Viewport;
    /** Clip path relative to `rect`. */
    clipPath: string;
    outline: { widthDu: number; color: string; path: string } | null;
  };
  markers: LaidOutMarker[];
  texts: LaidOutText[];
  photos: LaidOutPhoto[];
  frame: { rect: Rect; style: Design['page']['frame']['style']; color: string; widthDu: number } | null;
  safeZone: Rect;
  attribution: { text: string; x: number; y: number; anchor: 'start' | 'end'; sizeDu: number; color: string };
}

export const ATTRIBUTION_TEXT = '© OpenStreetMap contributors';
export const SAFE_ZONE_MM = 5;
export const LINE_HEIGHT = 1.25;
const OVER_MAP_PADDING_DU = 36;

const textGap = (t: DesignText) => Math.max(6, t.sizeDu * 0.3);

export function computeLayout(design: Design, opts: { bleedDu?: number; slugDu?: number } = {}): PosterLayout {
  const bleedDu = opts.bleedDu ?? 0;
  const slugDu = opts.slugDu ?? 0;
  const W = 1000;
  const H = pageHeightDu(design.page);
  const { insetDu, shape } = design.map;

  const trimRect: Rect = {
    x: insetDu.left,
    y: insetDu.top,
    w: W - insetDu.left - insetDu.right,
    h: H - insetDu.top - insetDu.bottom,
  };

  // A rectangular map that touches a trim edge extends into the bleed on that side.
  const ext = { l: 0, r: 0, t: 0, b: 0 };
  if (bleedDu > 0 && canBleed(shape)) {
    if (insetDu.left === 0) ext.l = bleedDu;
    if (insetDu.right === 0) ext.r = bleedDu;
    if (insetDu.top === 0) ext.t = bleedDu;
    if (insetDu.bottom === 0) ext.b = bleedDu;
  }
  const rect: Rect = {
    x: trimRect.x - ext.l,
    y: trimRect.y - ext.t,
    w: trimRect.w + ext.l + ext.r,
    h: trimRect.h + ext.t + ext.b,
  };
  // Keep the geography of the trim area fixed when the render rect grows asymmetrically.
  const center = offsetCenter(design.map.center, design.map.zoom, design.map.bearing, [
    (ext.r - ext.l) / 2,
    (ext.b - ext.t) / 2,
  ]);
  const viewport: Viewport = {
    center,
    zoom: design.map.zoom,
    bearing: design.map.bearing,
    width: rect.w,
    height: rect.h,
  };

  const markers: LaidOutMarker[] = design.markers.map((m) => {
    const [sx, sy] = toScreen(m.lngLat, viewport);
    const x = rect.x + sx;
    const y = rect.y + sy;
    return {
      id: m.id,
      icon: m.icon,
      color: m.color,
      sizeDu: m.sizeDu,
      x,
      y,
      insideMap: x >= trimRect.x && x <= trimRect.x + trimRect.w && y >= trimRect.y && y <= trimRect.y + trimRect.h,
    };
  });

  const margin = design.page.marginDu;
  const texts = layoutTexts(design, { W, H, margin, mapRect: trimRect });

  const frameCfg = design.page.frame;
  const frame =
    frameCfg.style === 'none'
      ? null
      : {
          rect: { x: frameCfg.insetDu, y: frameCfg.insetDu, w: W - 2 * frameCfg.insetDu, h: H - 2 * frameCfg.insetDu },
          style: frameCfg.style,
          color: frameCfg.color,
          widthDu: frameCfg.widthDu,
        };

  const safe = mmToDu(design.page, SAFE_ZONE_MM);
  const safeZone: Rect = { x: safe, y: safe, w: W - 2 * safe, h: H - 2 * safe };

  const attrSize = Math.max(mmToDu(design.page, 2.2), 6);
  const corner = design.attribution.corner;
  const ax = corner.endsWith('right') ? W - safe : safe;
  const ay = corner.startsWith('bottom') ? H - safe - attrSize * 0.25 : safe + attrSize;
  const overMap = ax >= trimRect.x && ax <= trimRect.x + trimRect.w && ay >= trimRect.y && ay <= trimRect.y + trimRect.h;

  return {
    page: { w: W, h: H },
    bleedDu,
    slugDu,
    outer: { x: -bleedDu - slugDu, y: -bleedDu - slugDu, w: W + 2 * (bleedDu + slugDu), h: H + 2 * (bleedDu + slugDu) },
    background: design.page.background,
    map: {
      rect,
      trimRect,
      viewport,
      clipPath: shapePath(shape, rect.w, rect.h),
      outline:
        design.map.outline.widthDu > 0
          ? { widthDu: design.map.outline.widthDu, color: design.map.outline.color, path: shapePath(shape, trimRect.w, trimRect.h) }
          : null,
    },
    markers,
    texts,
    photos: layoutPhotos(design),
    frame,
    safeZone,
    attribution: {
      text: ATTRIBUTION_TEXT,
      x: ax,
      y: ay,
      anchor: corner.endsWith('right') ? 'end' : 'start',
      sizeDu: attrSize,
      color: readableInk(overMap ? design.map.palette.land : design.page.background),
    },
  };
}

function layoutTexts(
  design: Design,
  { W, H, margin, mapRect }: { W: number; H: number; margin: number; mapRect: Rect },
): LaidOutText[] {
  const visible = design.texts.filter((t) => t.visible && t.content.trim().length > 0);
  const out: LaidOutText[] = [];
  const base = (t: DesignText) => ({
    id: t.id,
    text: t.uppercase ? t.content.toLocaleUpperCase() : t.content,
    fontId: t.fontId,
    weight: t.weight,
    italic: t.italic,
    sizeDu: t.sizeDu,
    lineHeightDu: t.sizeDu * LINE_HEIGHT,
    letterSpacingEm: t.letterSpacing,
    color: t.color,
    align: t.align,
    rotationDeg: t.rotationDeg,
  });
  const bySlot = (slot: DesignText['slot']) =>
    visible.filter((t) => t.slot === slot).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const stackHeight = (items: DesignText[]) =>
    items.reduce((sum, t, i) => sum + t.sizeDu * LINE_HEIGHT + (i > 0 ? textGap(t) : 0), 0);

  const place = (items: DesignText[], startY: number, left: number, right: number) => {
    let y = startY;
    items.forEach((t, i) => {
      if (i > 0) y += textGap(t);
      const x = t.align === 'left' ? left : t.align === 'right' ? right : (left + right) / 2;
      out.push({ ...base(t), x: x + t.offsetDu[0], y: y + t.offsetDu[1], maxWidth: right - left, free: false });
      y += t.sizeDu * LINE_HEIGHT;
    });
  };

  const centered = (items: DesignText[], bandTop: number, bandBottom: number) => {
    const h = stackHeight(items);
    const space = bandBottom - bandTop;
    return h > space ? bandTop : bandTop + (space - h) / 2;
  };

  const top = bySlot('top');
  place(top, centered(top, margin, Math.max(margin, mapRect.y)), margin, W - margin);

  const bottom = bySlot('bottom');
  const mapBottom = mapRect.y + mapRect.h;
  place(bottom, centered(bottom, mapBottom, Math.max(mapBottom, H - margin)), margin, W - margin);

  const mapLeft = mapRect.x + OVER_MAP_PADDING_DU;
  const mapRight = mapRect.x + mapRect.w - OVER_MAP_PADDING_DU;
  place(bySlot('map-top'), mapRect.y + OVER_MAP_PADDING_DU, mapLeft, mapRight);
  const mapBottomItems = bySlot('map-bottom');
  place(mapBottomItems, mapBottom - OVER_MAP_PADDING_DU - stackHeight(mapBottomItems), mapLeft, mapRight);

  // Freely placed texts: `freePosition` is the centre of the line box; `align` picks the horizontal anchor.
  for (const t of visible.filter((x) => x.slot === 'free' && x.freePosition)) {
    const [cx, cy] = t.freePosition!;
    out.push({ ...base(t), x: cx, y: cy - (t.sizeDu * LINE_HEIGHT) / 2, maxWidth: W, free: true });
  }
  return out;
}

function layoutPhotos(design: Design): LaidOutPhoto[] {
  return design.photos.map((p) => {
    const w = p.widthDu;
    const h = p.frame === 'circle' ? w : w * p.aspect;
    const framePad = p.frame === 'none' || p.frame === 'circle' ? 0 : p.frame === 'border' ? w * 0.03 : w * 0.05;
    const framePadBottom = p.frame === 'polaroid' ? w * 0.18 : framePad;
    return {
      id: p.id,
      photoId: p.photoId,
      x: p.center[0] - w / 2,
      y: p.center[1] - h / 2,
      w,
      h,
      rotationDeg: p.rotationDeg,
      frame: p.frame,
      frameColor: p.frameColor,
      framePad,
      framePadBottom,
    };
  });
}
