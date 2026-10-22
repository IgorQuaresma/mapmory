import {
  BLEED_OPTIONS_MM,
  EXPORT_DPIS,
  EXPORT_FORMATS,
  FRAME_STYLES,
  LABEL_LANGUAGES,
  MAP_SHAPES,
  MARKER_ICONS,
  MAX_RENDER_PX,
  PAPER_SIZES,
} from '@mapmory/design-schema';
import { FONT_CATALOG } from '@mapmory/fonts';
import { THEME_LIST } from '@mapmory/themes';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppDeps } from '../app';

export const catalogRoutes = (deps: AppDeps): FastifyPluginAsyncZod => async (app) => {
  const tiles = deps.config.TILES_PUBLIC_URL.replace(/\/$/, '');
  const catalog = {
    themes: THEME_LIST,
    fonts: Object.values(FONT_CATALOG).map(({ id, family, weights, category }) => ({ id, family, weights, category })),
    papers: Object.values(PAPER_SIZES),
    markerIcons: MARKER_ICONS,
    mapShapes: MAP_SHAPES,
    frameStyles: FRAME_STYLES,
    labelLanguages: LABEL_LANGUAGES,
    exportFormats: EXPORT_FORMATS,
    dpis: EXPORT_DPIS,
    bleeds: BLEED_OPTIONS_MM,
    tiles: { tilesUrl: `${tiles}/basemap/{z}/{x}/{y}`, glyphsUrl: `${tiles}/font/{fontstack}/{range}`, maxzoom: 15 },
    maxRenderPx: MAX_RENDER_PX,
  };
  app.get('/catalog', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600');
    return catalog;
  });
};
