# 0002 — Render size limits and worker sizing (Spike S2)

**Status:** Accepted · 2026-10-22

## Measurements
Machine: Apple Silicon (14 cores, 24 GB), MapLibre Native (Metal backend), Paris fixture, labels on.
`apps/renderer/test/bench.ts` (formerly `spike-s2.ts`).

| Paper / DPI | Map raster | Map render | Peak RSS |
|---|---|---|---|
| A4 / 150 | 1091 × 1307 (1.4 Mpx) | 0.5 s | 196 MB |
| A2 / 300 | 4365 × 5228 (22.8 Mpx) | 0.3 s | 298 MB |
| A1 / 200 | 4115 × 4939 (20.3 Mpx) | 0.1 s | 285 MB |
| 50×70 / 300 | 5196 × 6141 (31.9 Mpx) | 0.3 s | 435 MB |
| A0 / 300 | 8741 × 10469 (91.5 Mpx) | 0.6 s | 883 MB |

Full A3 export through the queue (map + Chromium composition + PDF boxes + upload): **≈ 2 s** for PDF, **≈ 3 s** for PNG at 300 DPI.

PDF checks (`pdfimages -list`): Chromium embeds the map image **at the full 300 ppi, Flate (lossless)** — it does not
downsample. TrimBox/BleedBox are set by `pdf-lib` after composition.

## Findings
- MapLibre Native floors the framebuffer size (`floor(width × ratio)`); the renderer accounts for this.
- A0 at 300 DPI (full page 10004 × 14114 px) is below the 16384 px cap, so tiled rendering is not needed.
- Chromium embedded the variable poster fonts as **Type 3** fonts, and poppler dropped them at 300 DPI (missing
  titles in PNG exports). **Fixed:** `packages/fonts/scripts/build-static.py` (fontTools) generates static
  instances per weight, which Chromium embeds as **CID TrueType** subsets (`pdffonts` verified).
- poppler's cairo backend (`pdftocairo`) clipped the glyphs of those fonts at print resolutions. The
  Splash backend (`pdftoppm -aa yes -aaVector yes`) renders them correctly, so raster formats are derived with it.
- Linux workers use Mesa (llvmpipe) instead of a GPU, which is much slower. Benchmark on the production host before
  setting autoscaling thresholds. Until then the plan's sizing (8 vCPU / 16 GB, concurrency 1, 5-minute timeout) stands.

## Decision
- Hard cap: 16384 px on the longest side (`MAX_RENDER_PX`), validated by the API and again by the worker.
- Queues `export-small` (≤ A3) and `export-large` (A2 and up), one job per worker process.
