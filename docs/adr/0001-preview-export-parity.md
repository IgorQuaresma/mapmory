# 0001 — Preview/export parity (Spike S1)

**Status:** Accepted · 2026-10-22

## Question
Do MapLibre GL JS (editor preview) and MapLibre Native (exporter) produce matching maps when they share
the same style, logical viewport and zoom, with only `pixelRatio` differing? (Plan §7.1, §12 S1.)

## Experiment
`apps/renderer/test/parity.ts` renders the fixture design in all 8 themes:
- **Native:** `@maplibre/maplibre-gl-native` 6.4.1 at pixel ratio 1.
- **Preview:** MapLibre GL JS 6.15 inside headless Chromium, using the print page in `live` mode (same
  `poster-react` components the editor uses), screenshot of the map rect.
Pixels are compared with `pixelmatch` (threshold 0.15, anti-aliasing ignored).

## Results (Paris fixture, 880×1054 logical px)

| Labels | Mismatch (all themes) |
|---|---|
| Off (poster default) | **0.00 %** |
| On, road names repeated along lines (`symbol-placement: line`) | 1.2 – 2.8 % |
| On, one road name per segment at its centre (`line-center`, since 2026-10-23) | **0.56 – 0.77 %** |

With repeated labels, the two renderers spaced road names differently along their lines. With `line-center`
nearly every label lands in the same place; the remainder is a handful of names that one renderer drops where
labels collide. Place labels match exactly.

## Decision
- Keep MapLibre Native as the exporter. The headless-Chromium fallback renderer is not needed.
- CI runs `pnpm --filter @mapmory/renderer parity` with a 0.5 % threshold (labels off) and 1.5 % (labels on).
- The editor shows a small note in the Style panel when labels are enabled: "Street names may shift slightly in the print."

## Consequences
- Preview fidelity relies on both renderers implementing the same style spec. Pin both versions together and re-run
  parity on every upgrade (Renovate groups them).
