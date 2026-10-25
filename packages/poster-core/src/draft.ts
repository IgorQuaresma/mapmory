import {
  LABEL_LANGUAGES,
  SCHEMA_VERSION,
  parseDesign,
  sanitizePlainText,
  type Design,
  type DesignText,
  type DraftInput,
  type DraftSport,
  type LabelLanguage,
  type Sport,
} from '@mapmory/design-schema';
import { clampWeight } from '@mapmory/fonts';
import { MOOD_MARKER, MOOD_THEME, SPORT_THEME, disciplineColor, getTheme, type Theme } from '@mapmory/themes';
import { formatCoordinates, formatDate } from './format';
import { boundsOf, fitBounds, zoomForPlaceType } from './geo';
import { panelTrimRects } from './layout';
import { estimateTextWidth } from './preflight';
import { defaultLegView, formatDuration, legLabel } from './sport';
import { pageHeightDu, resolveTrim } from './units';

export const DEFAULT_PAPER = 'A3' as const;
const MARGIN_DU = 60;
const TEXT_BAND_DU = 300;
const AREA_TYPES = new Set(['district', 'city', 'county', 'state', 'country']);

/**
 * Deterministic first draft (plan §9). The LLM only supplies a mood and text ideas; every layout,
 * zoom and style decision is made here so drafts are reproducible and testable.
 */
export function generateDraft(input: DraftInput): Design {
  if (input.sport) return generateRaceDraft(input, input.sport);
  const theme = getTheme(MOOD_THEME[input.mood]);
  const trimMm = resolveTrim(DEFAULT_PAPER, 'portrait');
  const page = { trimMm };
  const H = pageHeightDu(page);
  const insetDu = { top: MARGIN_DU, right: MARGIN_DU, bottom: TEXT_BAND_DU, left: MARGIN_DU };
  const mapW = 1000 - insetDu.left - insetDu.right;
  const mapH = H - insetDu.top - insetDu.bottom;

  const primary = input.places[0]!;
  let center: [number, number] = primary.lngLat;
  let zoom = zoomForPlaceType(primary.type);
  if (input.places.length > 1) {
    const fit = fitBounds(boundsOf(input.places.map((p) => p.lngLat)), mapW, mapH, {
      padding: Math.min(mapW, mapH) * 0.18,
      maxZoom: 15.5,
    });
    center = fit.center;
    zoom = fit.zoom;
  } else if (primary.bbox && AREA_TYPES.has(primary.type)) {
    const fit = fitBounds(primary.bbox, mapW, mapH, { padding: 20, maxZoom: 15, minZoom: 3 });
    center = fit.center;
    zoom = fit.zoom;
  }

  const lang = input.locale.slice(0, 2) as LabelLanguage;
  const labelLanguage: LabelLanguage = (LABEL_LANGUAGES as readonly string[]).includes(lang) ? lang : 'local';

  const title = sanitizePlainText(input.title?.trim() || primary.name, 120);
  const subtitle = sanitizePlainText(
    input.subtitle?.trim() || [primary.name !== primary.city ? primary.city : null, primary.country].filter(Boolean).join(', '),
    200,
  );

  const design: Design = {
    schemaVersion: SCHEMA_VERSION,
    page: {
      paper: DEFAULT_PAPER,
      orientation: 'portrait',
      trimMm,
      marginDu: MARGIN_DU,
      background: theme.pageBackground,
      frame: { style: theme.frame.style, color: theme.frame.color, widthDu: 2, insetDu: 30 },
    },
    map: {
      insetDu,
      center: [round(center[0], 6), round(center[1], 6)],
      zoom: round(Math.min(18, Math.max(1, zoom)), 2),
      bearing: 0,
      shape: theme.shape,
      outline: { widthDu: 0, color: theme.textColor },
      themeId: theme.id,
      palette: { ...theme.palette },
      layers: { ...theme.layers },
      labelLanguage,
      roadWeight: theme.roadWeight,
    },
    markers: input.places.map((p, i) => ({
      id: `m${i + 1}`,
      lngLat: [round(p.lngLat[0], 6), round(p.lngLat[1], 6)] as [number, number],
      icon: MOOD_MARKER[input.mood],
      color: theme.accent,
      sizeDu: i === 0 ? 40 : 30,
    })),
    texts: fitAll(
      defaultTexts(theme, {
        title,
        subtitle,
        date: formatDate(input.date, input.locale),
        coordinates: formatCoordinates(primary.lngLat),
      }),
      MARGIN_DU,
    ),
    routes: [],
    photos: [],
    sport: null,
    attribution: { corner: 'bottom-right' },
  };
  return parseDesign(design);
}

const RACE_BAND_TOP_DU = 250;
const RACE_BAND_BOTTOM_DU = 270;

/**
 * First draft of a race poster: the event name on top, one map panel per leg centred on the venue and zoomed to
 * the typical size of that course, the stats under each panel and the finish time at the bottom. Importing the
 * athlete's activity later replaces the views with the real routes.
 */
function generateRaceDraft(input: DraftInput, race: DraftSport): Design {
  const theme = getTheme(SPORT_THEME);
  const trimMm = resolveTrim(DEFAULT_PAPER, 'portrait');
  const primary = input.places[0]!;
  const lang = input.locale.slice(0, 2) as LabelLanguage;
  const labelLanguage: LabelLanguage = (LABEL_LANGUAGES as readonly string[]).includes(lang)
    ? lang
    : 'local';
  const venue: [number, number] = [round(primary.lngLat[0], 6), round(primary.lngLat[1], 6)];

  const title = sanitizePlainText(input.title?.trim() || race.name?.trim() || primary.name, 120);
  const subtitle = sanitizePlainText(
    [primary.city ?? primary.name, primary.country].filter(Boolean).join(', '),
    200,
  );
  const texts = defaultTexts(theme, {
    title,
    subtitle,
    date: formatDate(input.date, input.locale),
    coordinates: formatCoordinates(primary.lngLat),
  }).map((t): DesignText => {
    if (t.role === 'title') return { ...t, slot: 'top', sizeDu: 72 };
    if (t.role === 'subtitle') return { ...t, slot: 'top' };
    if (t.role === 'coordinates') return { ...t, visible: false };
    return { ...t, order: 2 };
  });
  if (race.finishTimeS) {
    const { title: tt } = theme.typography;
    texts.push({
      ...texts.find((t) => t.role === 'date')!,
      id: 'finish',
      role: 'custom',
      content: formatDuration(race.finishTimeS),
      fontId: tt.fontId,
      weight: clampWeight(tt.fontId, tt.weight),
      sizeDu: 76,
      letterSpacing: 0.02,
      uppercase: false,
      order: 1,
      visible: true,
    });
  }

  const sport: Sport = {
    event: race.event,
    layout: 'columns',
    gapDu: 24,
    legs: race.legs.map((l, i) => ({
      id: `leg${i + 1}`,
      discipline: l.discipline,
      label: legLabel(l.discipline, input.locale),
      center: venue,
      zoom: 12,
      bearing: 0,
      routeId: null,
      distanceKm: l.distanceKm,
      timeS: l.timeS,
    })),
    showStats: true,
    statsFontId: theme.typography.body.fontId,
    statsSizeDu: 15,
    statsColor: theme.textColor,
    units: input.locale === 'en-US' ? 'imperial' : 'metric',
    finishTimeS: race.finishTimeS,
  };
  const design: Design = {
    schemaVersion: SCHEMA_VERSION,
    page: {
      paper: DEFAULT_PAPER,
      orientation: 'portrait',
      trimMm,
      marginDu: MARGIN_DU,
      background: theme.pageBackground,
      frame: { style: theme.frame.style, color: theme.frame.color, widthDu: 2, insetDu: 30 },
    },
    map: {
      insetDu: {
        top: RACE_BAND_TOP_DU,
        right: MARGIN_DU,
        bottom: RACE_BAND_BOTTOM_DU,
        left: MARGIN_DU,
      },
      center: venue,
      zoom: 12,
      bearing: 0,
      shape: theme.shape,
      outline: { widthDu: 0, color: theme.textColor },
      themeId: theme.id,
      palette: { ...theme.palette },
      layers: { ...theme.layers },
      labelLanguage,
      roadWeight: theme.roadWeight,
    },
    markers: [],
    texts: fitAll(texts, MARGIN_DU),
    routes: [],
    photos: [],
    sport,
    attribution: { corner: 'bottom-right' },
  };
  return parseDesign(withLegViews(design));
}

/** Gives every leg without a route the default view for its discipline and panel size. */
export function withLegViews(design: Design, only?: string[]): Design {
  if (!design.sport) return design;
  const H = pageHeightDu(design.page);
  const { insetDu } = design.map;
  const area = {
    x: insetDu.left,
    y: insetDu.top,
    w: 1000 - insetDu.left - insetDu.right,
    h: H - insetDu.top - insetDu.bottom,
  };
  const rects = panelTrimRects(design, area);
  const legs = design.sport.legs.map((leg, i) => {
    if (leg.routeId || (only && !only.includes(leg.id))) return leg;
    const r = rects[i]!;
    return { ...leg, ...defaultLegView(leg.center, leg.discipline, leg.distanceKm, r.w, r.h) };
  });
  return { ...design, sport: { ...design.sport, legs } };
}

/**
 * Turns a single-map poster into a race poster (the editor's "race poster" switch). The place, theme, texts and
 * routes stay; the panels start on the current map centre.
 */
export function makeRacePoster(design: Design, race: DraftSport, locale: string): Design {
  const theme = getTheme(design.map.themeId);
  const center: [number, number] = [round(design.map.center[0], 6), round(design.map.center[1], 6)];
  const sport: Sport = {
    event: race.event,
    layout: 'columns',
    gapDu: 24,
    legs: race.legs.map((l, i) => ({
      id: `leg${i + 1}`,
      discipline: l.discipline,
      label: legLabel(l.discipline, locale),
      center,
      zoom: design.map.zoom,
      bearing: 0,
      routeId: null,
      distanceKm: l.distanceKm,
      timeS: l.timeS,
    })),
    showStats: true,
    statsFontId: theme.typography.body.fontId,
    statsSizeDu: 15,
    statsColor: theme.textColor,
    units: locale === 'en-US' ? 'imperial' : 'metric',
    finishTimeS: race.finishTimeS,
  };
  return withLegViews({ ...design, sport });
}

/** Back to a single map showing the first leg's view. */
export function makeSingleMapPoster(design: Design): Design {
  const first = design.sport?.legs[0];
  if (!first) return design;
  return {
    ...design,
    sport: null,
    map: { ...design.map, center: first.center, zoom: first.zoom, bearing: first.bearing },
  };
}


export function defaultTexts(
  theme: Theme,
  content: { title: string; subtitle: string; date: string; coordinates: string },
): DesignText[] {
  const { title: tt, body } = theme.typography;
  const base = { italic: false, align: 'center' as const, slot: 'bottom' as const, offsetDu: [0, 0] as [number, number], visible: true, color: theme.textColor, freePosition: null, rotationDeg: 0 };
  const titleSize = tt.fontId === 'great-vibes' ? 84 : 64;
  return [
    { ...base, id: 'title', role: 'title', content: content.title, fontId: tt.fontId, weight: clampWeight(tt.fontId, tt.weight), sizeDu: titleSize, letterSpacing: tt.letterSpacing, uppercase: tt.uppercase, order: 0 },
    { ...base, id: 'subtitle', role: 'subtitle', content: content.subtitle, fontId: body.fontId, weight: clampWeight(body.fontId, body.weight), sizeDu: 22, letterSpacing: body.letterSpacing, uppercase: body.uppercase, order: 1 },
    { ...base, id: 'date', role: 'date', content: content.date, fontId: body.fontId, weight: clampWeight(body.fontId, body.weight), sizeDu: 20, letterSpacing: body.letterSpacing, uppercase: body.uppercase, order: 2, visible: content.date.length > 0 },
    { ...base, id: 'coords', role: 'coordinates', content: content.coordinates, fontId: body.fontId, weight: clampWeight(body.fontId, body.weight), sizeDu: 15, letterSpacing: 0.15, uppercase: false, order: 3 },
  ];
}

/**
 * Applies a theme to an existing design: map palette, layers, page colours and text styling change,
 * while the place, texts' content, layout and paper stay as the user set them.
 */
export function applyTheme(design: Design, themeId: Design['map']['themeId']): Design {
  const theme = getTheme(themeId);
  const { title, body } = theme.typography;
  return {
    ...design,
    page: { ...design.page, background: theme.pageBackground, frame: { ...design.page.frame, style: theme.frame.style, color: theme.frame.color } },
    map: {
      ...design.map,
      themeId,
      palette: { ...theme.palette },
      layers: { ...theme.layers, labels: design.map.layers.labels },
      roadWeight: theme.roadWeight,
      outline: { ...design.map.outline, color: theme.textColor },
    },
    markers: design.markers.map((m) => ({ ...m, color: theme.accent })),
    // Routes shown as race legs take the theme's leg colours.
    routes: design.routes.map((r) => {
      const leg = design.sport?.legs.find((l) => l.routeId === r.id);
      return leg ? { ...r, color: disciplineColor(themeId, leg.discipline) } : r;
    }),
    sport: design.sport && { ...design.sport, statsColor: theme.textColor, statsFontId: body.fontId },
    texts: fitAll(
      design.texts.map((t) => {
        // A race poster's finish time is display type like the title, but never uppercased or widely spaced.
        const finish = t.id === 'finish';
        const typo = t.role === 'title' || finish ? title : body;
        return {
          ...t,
          fontId: typo.fontId,
          weight: clampWeight(typo.fontId, typo.weight),
          uppercase: t.role === 'coordinates' || finish ? false : typo.uppercase,
          letterSpacing: t.role === 'coordinates' ? 0.15 : finish ? 0.02 : typo.letterSpacing,
          color: theme.textColor,
        };
      }),
      design.page.marginDu,
    ),
  };
}

const round = (v: number, digits: number) => Number(v.toFixed(digits));

/** Shrinks a text so its estimated width fits the available width (never grows it). */
export function fitTextSize(t: DesignText, maxWidthDu: number, minSizeDu = 18): DesignText {
  const text = t.uppercase ? t.content.toLocaleUpperCase() : t.content;
  const width = estimateTextWidth({ text, sizeDu: t.sizeDu, letterSpacingEm: t.letterSpacing } as never);
  if (width <= maxWidthDu) return t;
  return { ...t, sizeDu: Math.max(minSizeDu, Math.floor((t.sizeDu * maxWidthDu) / width)) };
}

const fitAll = (texts: DesignText[], marginDu: number) =>
  texts.map((t) => (t.role === 'title' || t.role === 'subtitle' ? fitTextSize(t, 1000 - 2 * marginDu - 20) : t));
