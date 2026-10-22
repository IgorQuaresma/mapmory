# 0004 — Tiles, glyphs and fonts (Spike S4)

**Status:** Accepted · 2026-10-22

## Tiles
- Source: Protomaps basemap daily planet build (schema v4.15, **~139 GB** as of 2026-10-22, ODbL).
- Dev: `pnpm setup:tiles` extracts Paris, Münster, Lisbon and Manhattan at z0–15 with `pmtiles extract --region`
  (≈ 78 MB, about 35 s).
- Served by **Martin** as standard XYZ tiles to both renderers (`/basemap/{z}/{x}/{y}`).
- The style targets the actual `kind` values in the data (sampled with `@mapbox/vector-tile`): `roads.kind` ∈
  {highway, major_road, minor_road, path, other, rail, aeroway, ferry}, `landuse.kind` for parks, `water` polygons/lines.

## Glyphs and fonts
- Martin generates label glyph PBFs **on the fly from the same OFL TTF files** used for poster text
  (`packages/fonts/ttf`), so no prebuilt glyph sets are needed.
- Variable fonts expose their default instance to Martin (e.g. "Montserrat Thin"). Themes therefore use
  Inter Regular, Playfair Display Regular or Cormorant Garamond Light for labels, with Noto Sans Regular as the
  fallback for other scripts.

## Attribution
The poster overlay always prints "© OpenStreetMap contributors". The tile metadata asks for OSM attribution only.
