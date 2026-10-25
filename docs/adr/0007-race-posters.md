# 0007 — Race posters: one map per leg (design schema v4)

**Status:** Accepted · 2026-10-25

## Context

Athletes want a poster of a race, not of a single place. A triathlon has three courses of very different sizes
(a 3.8 km swim loop, a 180 km bike course, a 42 km run), so one map can't show them well. The poster needs one map
per leg, each with its own route and figures (distance, time, pace), generated from the memory with no extra typing,
and refined with the athlete's own activity file.

## Decisions

**Design document**

- `design.sport` (null for a single-map poster) holds the race: event type, panel layout (`columns`, `rows`,
  `hero`), the gap, display options for the stats and up to **3 legs**. Each leg has its own map view (centre,
  zoom, bearing), an optional `routeId` into `design.routes`, a distance and a time (seconds).
- `map` keeps everything the panels share: theme, palette, layers, label language, shape, outline, and the overall
  map area (`insetDu`). Theme changes therefore apply to all panels at once, and leg routes take the theme's leg
  colours (`disciplineColors`).
- Schema v4; the v3 → v4 migration sets `sport: null`, so every saved poster opens unchanged.

**Layout and rendering**

- `computeLayout` returns `panels`: one for a single-map poster (identical to before), one per leg on a race
  poster, each with its own viewport, clip shape, bleed and stats block. The map shape applies to every panel.
- Each panel's style draws only that leg's route plus routes not assigned to any leg (`buildStyle(…, legId)`).
- The renderer draws **one MapLibre Native raster per panel** with the same logical viewport as the preview, so
  the preview-equals-print guarantee (ADR 0001) holds per panel. Panel rasters are smaller than a full-page map,
  so render time grows only modestly (three small renders instead of one large one).
- Icons, labels and figures are vector content of the print page (fonts embedded), like all other text.

**Generating the race**

- `detectRace` finds the race in the memory text **deterministically** (no LLM): event type and standard distances
  (full, 70.3, Olympic and sprint triathlon, duathlon, aquathlon, marathon, half marathon, gran fondo…), leg times
  after a discipline word ("swim 1:05:12", "Rad 5h40") and the finish time, in English, German, Portuguese, Spanish
  and French. It runs in the browser; the memory text is not sent anywhere new.
- Without an activity file, each panel is centred on the venue and zoomed to the typical size of that course.
- Activity files (FIT, GPX, TCX, GeoJSON) are parsed **in the browser**, as for routes (ADR 0006). A multisport
  file is split into legs by its own sport fields, or by speed when it has none; transitions are dropped. Each leg
  becomes a simplified route assigned to its panel, with distance and time taken from the file.

**Checks**

- Preflight reports legs without a route (`leg-without-route`, info) and figures wider than their panel
  (`stats-too-wide`, warning).

## Consequences

- A race poster carries up to three routes of 1,000 points; this fits the 192 KB design limit.
- Live (MapLibre GL JS) parity checks still cover single-map posters; race panels use the same style code path.
