import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import type { Design, LayerKey, PaletteKey } from '@mapmory/design-schema';
import { FONT_CATALOG, LABEL_FALLBACK_FONTSTACK } from '@mapmory/fonts';
import { getTheme } from '@mapmory/themes';
import { panelRoutes } from './sport';

export interface StyleEndpoints {
  /** XYZ tile URL template served by Martin, e.g. https://tiles.example.com/basemap/{z}/{x}/{y} */
  tilesUrl: string;
  /** Glyph URL template, e.g. https://tiles.example.com/font/{fontstack}/{range} */
  glyphsUrl: string;
  maxzoom?: number;
}

const SOURCE = 'basemap';
const ROUTES = 'routes';
const DASHES = { dashed: [2.5, 1.6], dotted: [0.1, 1.8] } as const;

/**
 * Routes are drawn by the map renderers themselves (not the overlay), so preview and print match exactly like
 * the streets do. Widths are in logical pixels, which equal design units (plan §7.1).
 */
function routesGeoJson(design: Design, legId: string | null) {
  const features = panelRoutes(design, legId).flatMap((r) => {
    const props = { id: r.id, color: r.color, width: r.widthDu, style: r.style };
    const line = { type: 'Feature' as const, properties: props, geometry: { type: 'LineString' as const, coordinates: r.points } };
    if (!r.endpoints) return [line];
    const dot = (c: [number, number]) => ({ type: 'Feature' as const, properties: { ...props, endpoint: true }, geometry: { type: 'Point' as const, coordinates: c } });
    return [line, dot(r.points[0]!), dot(r.points.at(-1)!)];
  });
  return { type: 'FeatureCollection' as const, features };
}

function routeLayers(design: Design): LayerSpecification[] {
  const line = (style: 'solid' | 'dashed' | 'dotted'): LayerSpecification => ({
    id: `routes-${style}`,
    type: 'line',
    source: ROUTES,
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'style'], style]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['get', 'width'],
      ...(style === 'solid' ? {} : { 'line-dasharray': [...DASHES[style]] }),
    },
  });
  return [
    {
      id: 'routes-casing',
      type: 'line',
      source: ROUTES,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': design.map.palette.land, 'line-width': ['+', ['get', 'width'], 3], 'line-opacity': 0.85 },
    },
    line('solid'),
    line('dashed'),
    line('dotted'),
    {
      id: 'routes-endpoints',
      type: 'circle',
      source: ROUTES,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['*', ['get', 'width'], 1.4],
        'circle-stroke-color': design.map.palette.land,
        'circle-stroke-width': 1.5,
      },
    },
  ];
}

/** Map layers belonging to each user-facing layer toggle (used for incremental preview updates). */
export const LAYER_GROUPS: Record<LayerKey, string[]> = {
  water: ['water-fill', 'water-line'],
  parks: ['landcover-parks', 'parks'],
  buildings: ['buildings'],
  paths: ['roads-path'],
  roads: ['roads-minor', 'roads-major', 'roads-highway'],
  railways: ['rail'],
  labels: ['labels-roads', 'labels-places'],
};

/** Paint properties driven by each palette entry. */
export const PALETTE_TARGETS: Record<PaletteKey, { layer: string; property: string }[]> = {
  land: [
    { layer: 'earth', property: 'fill-color' },
    { layer: 'labels-places', property: 'text-halo-color' },
    { layer: 'labels-roads', property: 'text-halo-color' },
  ],
  water: [
    { layer: 'water-fill', property: 'fill-color' },
    { layer: 'water-line', property: 'line-color' },
  ],
  parks: [
    { layer: 'landcover-parks', property: 'fill-color' },
    { layer: 'parks', property: 'fill-color' },
  ],
  roads: [
    { layer: 'roads-major', property: 'line-color' },
    { layer: 'roads-highway', property: 'line-color' },
  ],
  roadsMinor: [
    { layer: 'roads-minor', property: 'line-color' },
    { layer: 'roads-path', property: 'line-color' },
  ],
  buildings: [{ layer: 'buildings', property: 'fill-color' }],
  rail: [{ layer: 'rail', property: 'line-color' }],
  labels: [
    { layer: 'labels-places', property: 'text-color' },
    { layer: 'labels-roads', property: 'text-color' },
  ],
};

const PARK_KINDS = [
  'park', 'garden', 'grass', 'forest', 'wood', 'meadow', 'nature_reserve', 'cemetery', 'golf_course',
  'pitch', 'playground', 'allotments', 'grassland', 'scrub', 'village_green', 'recreation_ground', 'zoo',
];

const widths = (stops: [number, number][], weight: number): ExpressionSpecification =>
  ['interpolate', ['exponential', 1.6], ['zoom'], ...stops.flatMap(([z, w]) => [z, w * weight])] as ExpressionSpecification;

const kindIs = (...kinds: string[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', kinds]];
const notTunnel: ExpressionSpecification = ['!=', ['get', 'is_tunnel'], true];

/** The background is water when water is shown, so coastline/ocean areas read as water. */
export function backgroundColor(design: Design): string {
  return design.map.layers.water ? design.map.palette.water : design.map.palette.land;
}

export function nameExpression(language: Design['map']['labelLanguage']): ExpressionSpecification {
  return language === 'local'
    ? ['coalesce', ['get', 'name'], '']
    : ['coalesce', ['get', `name:${language}`], ['get', 'name'], ''];
}

export function labelFontstack(design: Design): string[] {
  const theme = getTheme(design.map.themeId);
  return [FONT_CATALOG[theme.labelFont].labelFontstack, LABEL_FALLBACK_FONTSTACK];
}

/**
 * Builds the MapLibre style for a design. Used unchanged by the browser preview (MapLibre GL JS) and the
 * export renderer (MapLibre Native), so both draw the same map (plan §2, §7.1).
 * The style uses no raster sprites or patterns so it stays sharp at any pixel ratio.
 */
export function buildStyle(
  design: Design,
  endpoints: StyleEndpoints,
  /** On a race poster, the leg whose panel this style draws: only its route (and unassigned ones) are shown. */
  legId: string | null = null,
): StyleSpecification {
  const { palette, layers, roadWeight, labelLanguage } = design.map;
  const theme = getTheme(design.map.themeId);
  const vis = (key: LayerKey) => ({ visibility: layers[key] ? ('visible' as const) : ('none' as const) });
  const font = labelFontstack(design);

  const styleLayers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': backgroundColor(design) } },
    { id: 'earth', type: 'fill', source: SOURCE, 'source-layer': 'earth', paint: { 'fill-color': palette.land } },
    {
      id: 'landcover-parks',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: kindIs('forest', 'grassland', 'scrub'),
      layout: vis('parks'),
      paint: { 'fill-color': palette.parks, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 7, 0.7] },
    },
    {
      id: 'parks',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landuse',
      filter: kindIs(...PARK_KINDS),
      layout: vis('parks'),
      paint: { 'fill-color': palette.parks },
    },
    {
      id: 'water-fill',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: vis('water'),
      paint: { 'fill-color': palette.water },
    },
    {
      id: 'water-line',
      type: 'line',
      source: SOURCE,
      'source-layer': 'water',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], kindIs('river', 'canal', 'stream')],
      layout: { ...vis('water'), 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.water,
        'line-width': widths([[9, 0.5], [13, 1.5], [16, 4], [18, 10]], 1),
      },
    },
    {
      id: 'buildings',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'buildings',
      minzoom: 13,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: vis('buildings'),
      paint: {
        'fill-color': palette.buildings,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, theme.buildingOpacity],
      },
    },
    {
      id: 'roads-path',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      minzoom: 13,
      filter: ['all', kindIs('path'), notTunnel],
      layout: { ...vis('paths'), 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.roadsMinor,
        'line-width': widths([[13, 0.25], [15, 0.5], [17, 1.1], [18, 1.6]], roadWeight),
        'line-opacity': 0.85,
      },
    },
    {
      id: 'roads-minor',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      minzoom: 11,
      filter: kindIs('minor_road', 'other'),
      layout: { ...vis('roads'), 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.roadsMinor,
        'line-width': widths([[11, 0.2], [13, 0.5], [15, 1.3], [17, 3.5], [18, 6]], roadWeight),
      },
    },
    {
      id: 'roads-major',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      filter: kindIs('major_road'),
      layout: { ...vis('roads'), 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.roads,
        'line-width': widths([[7, 0.2], [10, 0.5], [13, 1.3], [15, 2.8], [17, 7], [18, 11]], roadWeight),
      },
    },
    {
      id: 'roads-highway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      filter: kindIs('highway'),
      layout: { ...vis('roads'), 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.roads,
        'line-width': widths([[5, 0.4], [10, 1], [13, 2], [15, 4.2], [17, 10], [18, 16]], roadWeight),
      },
    },
    {
      id: 'rail',
      type: 'line',
      source: SOURCE,
      'source-layer': 'roads',
      minzoom: 10,
      filter: ['all', kindIs('rail'), notTunnel, ['!=', ['get', 'kind_detail'], 'subway']],
      layout: { ...vis('railways'), 'line-join': 'round' },
      paint: {
        'line-color': palette.rail,
        'line-width': widths([[10, 0.4], [14, 0.9], [17, 2], [18, 2.6]], 1),
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'labels-roads',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'roads',
      minzoom: 13,
      filter: ['all', kindIs('major_road', 'minor_road', 'highway'), ['has', 'name']],
      layout: {
        ...vis('labels'),
        // One label per road segment, at its centre: repeated labels spaced along a line are placed slightly
        // differently by GL JS (preview) and Native (print); a single centred label is stable (ADR 0001).
        'symbol-placement': 'line-center',
        'text-field': nameExpression(labelLanguage),
        'text-font': font,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 8, 17, 12],
        'text-letter-spacing': 0.05,
        'text-max-angle': 30,
      },
      paint: { 'text-color': palette.labels, 'text-halo-color': palette.land, 'text-halo-width': 1.2 },
    },
    {
      id: 'labels-places',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'places',
      filter: kindIs('locality', 'neighbourhood', 'macrohood'),
      layout: {
        ...vis('labels'),
        'text-field': nameExpression(labelLanguage),
        'text-font': font,
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          6, ['match', ['get', 'kind'], 'locality', 10, 8],
          14, ['match', ['get', 'kind'], 'locality', 16, 11],
          16, ['match', ['get', 'kind'], 'locality', 18, 12],
        ],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.12,
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'min_zoom'], 10],
      },
      paint: { 'text-color': palette.labels, 'text-halo-color': palette.land, 'text-halo-width': 1.4 },
    },
  ];

  styleLayers.splice(styleLayers.findIndex((l) => l.id === 'labels-roads'), 0, ...routeLayers(design));

  return {
    version: 8,
    name: `mapmory-${design.map.themeId}`,
    glyphs: endpoints.glyphsUrl,
    sources: {
      [SOURCE]: {
        type: 'vector',
        tiles: [endpoints.tilesUrl],
        minzoom: 0,
        maxzoom: endpoints.maxzoom ?? 15,
        // Attribution is rendered by the poster overlay so it is always printed (plan §7.5).
        attribution: '',
      },
      [ROUTES]: { type: 'geojson', data: routesGeoJson(design, legId) },
    },
    layers: styleLayers,
  };
}
