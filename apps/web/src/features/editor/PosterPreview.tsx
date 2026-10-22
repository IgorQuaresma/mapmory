import type { Design } from '@mapmory/design-schema';
import { buildStyle, computeLayout, fromScreen, mmToDu, styleUpdates, type PosterLayout, type Rect } from '@mapmory/poster-core';
import { Poster } from '@mapmory/poster-react';
import { Maximize, Minus, Plus, ScanLine } from '../../components/icons';
import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { MapCanvas, type MovePhase, type MapView } from '../../components/MapCanvas';
import { IconButton, cx } from '../../components/ui';
import { useElementSize } from '../../lib/hooks';
import type { MapLibreMap } from '../../lib/maplibre';
import { useCatalog } from '../../lib/queries';
import { useDesign, useEditor } from '../../store/editor';
import { gesture, setView, updateMarker } from './actions';

const PREVIEW_PADDING = 32;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];
export const GUIDE_BLEED_MM = 3;

/**
 * The editor preview: the poster at 1000 logical CSS px, scaled with a CSS transform (plan §6.4).
 * Only `pixelRatio` adapts to the scale, so the map matches the export renderer.
 */
export function PosterPreview() {
  const { t } = useTranslation();
  const design = useDesign();
  const ui = useEditor((s) => s.ui);
  const setUi = useEditor((s) => s.setUi);
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  const posterRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => computeLayout(design), [design]);

  const fit = area.width > 0 ? Math.min((area.width - 2 * PREVIEW_PADDING) / layout.outer.w, (area.height - 2 * PREVIEW_PADDING) / layout.outer.h) : 0;
  const scale = Math.max(0.05, fit * ui.previewZoom);

  const onMarkerPointerDown = useMarkerDrag(posterRef, layout, scale);

  const zoomBy = (dir: 1 | -1) => {
    const i = ZOOM_STEPS.findIndex((z) => z >= ui.previewZoom - 1e-6);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i === -1 ? 2 : i) + dir))]!;
    setUi({ previewZoom: next });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-lav">
      <div ref={areaRef} className={cx('checker relative min-h-0 flex-1', ui.previewZoom > 1 ? 'overflow-auto' : 'overflow-hidden')}>
        {fit > 0 && (
          <div
            className="flex min-h-full min-w-full items-center justify-center"
            style={{ padding: PREVIEW_PADDING, width: ui.previewZoom > 1 ? layout.outer.w * scale + 2 * PREVIEW_PADDING : undefined }}
          >
            <div
              ref={posterRef}
              className="relative shrink-0 shadow-[var(--shadow-poster)]"
              style={{ width: layout.outer.w * scale, height: layout.outer.h * scale }}
              data-testid="poster-preview"
              data-scale={scale.toFixed(4)}
            >
              <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: layout.outer.w, height: layout.outer.h }}>
                <Poster
                  design={design}
                  layout={layout}
                  renderMap={(rect) => <EditorMap rect={rect} scale={scale} />}
                  onMarkerPointerDown={onMarkerPointerDown}
                  selectedMarkerId={ui.panel === 'markers' ? ui.selectedMarkerId : null}
                />
                {ui.showGuides && <Guides design={design} layout={layout} />}
              </div>
            </div>
          </div>
        )}
        {fit === 0 && <div className="skeleton absolute inset-12 rounded" />}
      </div>
      <div className="pointer-events-none absolute right-3 top-3 flex gap-1 md:bottom-3 md:top-auto">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-line bg-white/95 p-1 shadow-sm">
          <IconButton size="sm" label={t('editor.preview.zoomOut')} onClick={() => zoomBy(-1)} disabled={ui.previewZoom <= ZOOM_STEPS[0]!}>
            <Minus aria-hidden className="size-4" />
          </IconButton>
          <IconButton size="sm" label={t('editor.preview.fit')} onClick={() => setUi({ previewZoom: 1 })}>
            <Maximize aria-hidden className="size-4" />
          </IconButton>
          <IconButton size="sm" label={t('editor.preview.zoomIn')} onClick={() => zoomBy(1)} disabled={ui.previewZoom >= ZOOM_STEPS.at(-1)!}>
            <Plus aria-hidden className="size-4" />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-line" />
          <IconButton
            size="sm"
            label={ui.showGuides ? t('editor.preview.hideGuides') : t('editor.preview.showGuides')}
            aria-pressed={ui.showGuides}
            onClick={() => setUi({ showGuides: !ui.showGuides })}
            className={cx(ui.showGuides && 'bg-brand text-white hover:bg-brand')}
          >
            <ScanLine aria-hidden className="size-4" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

/** The live map inside the poster's map rect. */
function EditorMap({ rect, scale }: { rect: Rect; scale: number }) {
  const { t } = useTranslation();
  const design = useDesign();
  const locked = useEditor((s) => s.ui.mapLocked);
  const tiles = useCatalog().data!.tiles;
  const { themeId, palette, layers, roadWeight, labelLanguage } = design.map;
  // buildStyle only depends on the map's style fields; keep the style stable during pans.
  const styleSpec = useMemo(
    () => buildStyle(design, tiles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles, themeId, palette, layers, roadWeight, labelLanguage],
  );
  const applied = useRef<Design>(design);

  const view = useMemo<MapView>(
    () => ({ center: design.map.center, zoom: design.map.zoom, bearing: design.map.bearing }),
    [design.map.center, design.map.zoom, design.map.bearing],
  );

  const applyStyle = useCallback(
    (map: MapLibreMap) => {
      const next = useEditor.getState().design!;
      const ops = styleUpdates(applied.current, next);
      applied.current = next;
      if (!ops || !map.isStyleLoaded()) return false;
      for (const op of ops) {
        // styleUpdates only emits colour and visibility values for known layers.
        if (op.kind === 'paint') (map.setPaintProperty as (l: string, p: string, v: unknown) => void).call(map, op.layer, op.property, op.value);
        else (map.setLayoutProperty as (l: string, p: string, v: unknown) => void).call(map, op.layer, op.property, op.value);
      }
      return true;
    },
    [],
  );

  const onUserMove = useCallback((phase: MovePhase, v: MapView) => {
    if (phase === 'start') gesture.start();
    setView(v);
    if (phase === 'end') gesture.end();
  }, []);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  return (
    <MapCanvas
      styleSpec={styleSpec}
      view={view}
      onUserMove={onUserMove}
      applyStyle={applyStyle}
      interactive={!locked}
      pixelRatio={Math.min(3, Math.max(1, dpr * scale))}
      ariaLabel={t('editor.preview.mapLabel')}
      style={{ width: Math.round(rect.w), height: Math.round(rect.h) }}
    />
  );
}

/** Pointer-drag for markers: page coordinates are divided by the preview scale, then unprojected. */
function useMarkerDrag(posterRef: RefObject<HTMLDivElement | null>, layout: PosterLayout, scale: number) {
  const setUi = useEditor((s) => s.setUi);
  const latest = useRef({ layout, scale });
  latest.current = { layout, scale };
  return useCallback(
    (id: string, e: ReactPointerEvent<SVGGElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setUi({ selectedMarkerId: id, panel: 'markers' });
      const el = posterRef.current;
      if (!el) return;
      gesture.start();
      const move = (ev: PointerEvent) => {
        const { layout: l, scale: s } = latest.current;
        const box = el.getBoundingClientRect();
        const x = (ev.clientX - box.left) / s + l.outer.x - l.map.rect.x;
        const y = (ev.clientY - box.top) / s + l.outer.y - l.map.rect.y;
        const cx = Math.min(l.map.rect.w, Math.max(0, x));
        const cy = Math.min(l.map.rect.h, Math.max(0, y));
        const [lng, lat] = fromScreen([cx, cy], l.map.viewport);
        updateMarker(id, { lngLat: [Number(lng.toFixed(7)), Number(lat.toFixed(7))] });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        gesture.end();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [posterRef, setUi],
  );
}

/** Print safety overlay: trim, 3 mm bleed and the 5 mm safe zone (plan §7.4). */
function Guides({ design, layout }: { design: Design; layout: PosterLayout }) {
  const { t } = useTranslation();
  const b = mmToDu(design.page, GUIDE_BLEED_MM);
  const { w, h } = layout.page;
  const s = layout.safeZone;
  const label = Math.max(9, w * 0.012);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      data-testid="guides"
    >
      <path d={`M${-b} ${-b}H${w + b}V${h + b}H${-b}Z M0 0V${h}H${w}V0Z`} fill="#c42b4b33" fillRule="evenodd" />
      <rect x={-b} y={-b} width={w + 2 * b} height={h + 2 * b} fill="none" stroke="#c42b4b" strokeWidth={1.5} strokeDasharray="6 4" />
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="#1b1a33" strokeWidth={1} />
      <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="#2e3fd6" strokeWidth={1.5} strokeDasharray="4 4" />
      <text x={s.x + 4} y={s.y + label + 2} fontSize={label} fill="#2e3fd6" fontFamily="sans-serif">
        {t('editor.preview.safeZone')}
      </text>
      <text x={-b + 2} y={-b - 4} fontSize={label} fill="#c42b4b" fontFamily="sans-serif">
        {t('editor.preview.bleed', { mm: GUIDE_BLEED_MM })}
      </text>
    </svg>
  );
}
