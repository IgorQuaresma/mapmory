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

## Known limitation: headless software WebGL on x86-64 (2026-10-23)
On GitHub's x86-64 runners, and reproduced locally under x86-64 emulation, the *preview* side of the label
comparison (MapLibre GL JS in headless Chromium, software WebGL via SwiftShader) leaves most map tiles undrawn for
the themes whose labels use Bricolage Grotesque or DM Mono (Riviera, Lavender Field: 70–80 % mismatch; Night Train,
Old Letter: 4–6 %), varying between runs and without any error event. Checked and ruled out:

- The glyph data: Martin's arm64 and x86-64 builds return byte-identical PBFs for every label font.
- The print side: MapLibre Native renders every theme completely on x86-64.
- Timing: a second attempt per theme fails the same way; Chromium's Mesa backend (`--use-angle=gl`) does not
  render at all, and an explicit SwiftShader setup behaves identically.
- Labels off: all eight themes match at 0.00 % on x86-64 as well.

So this affects headless Chromium's software renderer, not prints and not browsers with hardware graphics (all themes
pass at < 0.8 % on Apple GPUs and in the Linux arm64 container). CI therefore keeps the label-free comparison
blocking and runs the label comparison as informational. Follow-up: report to MapLibre GL JS with the x86-64 repro
(`PARITY_DEBUG=1 PARITY_THEMES=riviera`, `CHROMIUM_EXTRA_ARGS`), and check whether desktop Chrome's own software
fallback (used when a GPU is blocklisted) is affected.

## Consequences
- Preview fidelity relies on both renderers implementing the same style spec. Pin both versions together and re-run
  parity on every upgrade (Renovate groups them).
