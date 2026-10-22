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
| On | 1.2 – 2.8 % |

With labels on, the *set* of labels is identical; only road names are anchored at slightly different
positions along their lines. Place labels match exactly.

## Decision
- Keep MapLibre Native as the exporter. The headless-Chromium fallback renderer is not needed.
- CI runs `pnpm --filter @mapmory/renderer parity` with a 0.5 % threshold (labels off) and 3 % (labels on).
- The editor shows a small note in the Style panel when labels are enabled: "Street names may shift slightly in the print."

## Consequences
- Preview fidelity relies on both renderers implementing the same style spec. Pin both versions together and re-run
  parity on every upgrade (Renovate groups them).
