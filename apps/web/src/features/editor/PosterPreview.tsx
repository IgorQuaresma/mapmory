import type { Design } from '@mapmory/design-schema';
import { buildStyle, computeLayout, fromScreen, mmToDu, styleUpdates, type LaidOutPanel, type PosterLayout, type Rect } from '@mapmory/poster-core';
import { Poster } from '@mapmory/poster-react';
import { Maximize, Minus, Plus, ScanLine } from '../../components/icons';
import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { MapCanvas, type MovePhase, type MapView } from '../../components/MapCanvas';
import { IconButton, cx } from '../../components/ui';
import { useElementSize } from '../../lib/hooks';
import type { MapLibreMap } from '../../lib/maplibre';
import { useCatalog } from '../../lib/queries';
import { api } from '../../api';
import { useDesign, useEditor } from '../../store/editor';
import { clampToPage, gesture, setLegView, setView, updateMarker, updatePhoto, updateText } from './actions';

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
  const onPhotoPointerDown = useElementDrag(scale, 'photo');
  const onTextPointerDown = useElementDrag(scale, 'text');

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
                  renderMap={(rect, panel) => <EditorMap rect={rect} panel={panel} scale={scale} />}
                  onMarkerPointerDown={onMarkerPointerDown}
                  selectedMarkerId={ui.panel === 'markers' ? ui.selectedMarkerId : null}
                  photoSrc={(id) => api.photoUrl(id)}
                  onPhotoPointerDown={onPhotoPointerDown}
                  onTextPointerDown={onTextPointerDown}
                  selectedPhotoId={ui.panel === 'photos' ? ui.selectedPhotoId : null}
                  selectedTextId={ui.panel === 'text' ? ui.selectedTextId : null}
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

/**
 * The live map inside one map panel: the whole map of a single-map poster, or one leg of a race poster. Moving a leg
 * panel changes only that leg's view.
 */
function EditorMap({ rect, panel, scale }: { rect: Rect; panel: LaidOutPanel; scale: number }) {
  const { t } = useTranslation();
  const design = useDesign();
  const locked = useEditor((s) => s.ui.mapLocked);
  const highlighted = useEditor((s) => s.ui.panel === 'race' && s.ui.selectedLegId !== null && s.ui.selectedLegId === panel.leg?.id);
  const setUi = useEditor((s) => s.setUi);
  const tiles = useCatalog().data!.tiles;
  const legId = panel.leg?.id ?? null;
  const { themeId, palette, layers, roadWeight, labelLanguage } = design.map;
  const routes = design.routes;
  // Which route each panel shows; a change rebuilds the style like a route change does.
  const legRoutes = design.sport?.legs.map((l) => `${l.id}:${l.routeId}`).join() ?? '';
  // buildStyle only depends on the map's style fields and routes; keep the style stable during pans.
  const styleSpec = useMemo(
    () => buildStyle(design, tiles, legId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles, themeId, palette, layers, roadWeight, labelLanguage, routes, legRoutes, legId],
  );
  const applied = useRef<Design>(design);

  const source = panel.leg ?? design.map;
  const view = useMemo<MapView>(
    () => ({ center: source.center, zoom: source.zoom, bearing: source.bearing }),
    [source.center, source.zoom, source.bearing],
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

  const onUserMove = useCallback(
    (phase: MovePhase, v: MapView) => {
      if (phase === 'start') {
        gesture.start();
        if (legId) setUi({ selectedLegId: legId });
      }
      if (legId) setLegView(legId, v);
      else setView(v);
      if (phase === 'end') gesture.end();
    },
    [legId, setUi],
  );

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const map = (
    <MapCanvas
      styleSpec={styleSpec}
      view={view}
      onUserMove={onUserMove}
      applyStyle={applyStyle}
      interactive={!locked}
      pixelRatio={Math.min(3, Math.max(1, dpr * scale))}
      ariaLabel={panel.leg ? t('editor.preview.legMapLabel', { leg: panel.leg.label || t(`race.disciplines.${panel.leg.discipline}`) }) : t('editor.preview.mapLabel')}
      style={{ width: Math.round(rect.w), height: Math.round(rect.h) }}
    />
  );
  if (!panel.leg) return map;
  return (
    <div className="relative" style={{ width: Math.round(rect.w), height: Math.round(rect.h) }} data-testid={`leg-map-${panel.leg.id}`}>
      {map}
      {highlighted && <div aria-hidden className="pointer-events-none absolute inset-0 border-[4px] border-dashed border-focus" data-testid="leg-highlight" />}
    </div>
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
      // On a race poster a marker can show in several panels: drag it in the panel where the drag started.
      const toPage = (ev: { clientX: number; clientY: number }, l: PosterLayout, s: number) => {
        const box = el.getBoundingClientRect();
        return [(ev.clientX - box.left) / s + l.outer.x, (ev.clientY - box.top) / s + l.outer.y] as const;
      };
      const [px, py] = toPage(e, latest.current.layout, latest.current.scale);
      const panelIndex =
        latest.current.layout.panels.find((p) => px >= p.rect.x && px <= p.rect.x + p.rect.w && py >= p.rect.y && py <= p.rect.y + p.rect.h)?.index ?? 0;
      const move = (ev: PointerEvent) => {
        const { layout: l, scale: s } = latest.current;
        const panel = l.panels[panelIndex] ?? l.panels[0]!;
        const [pageX, pageY] = toPage(ev, l, s);
        const cx = Math.min(panel.rect.w, Math.max(0, pageX - panel.rect.x));
        const cy = Math.min(panel.rect.h, Math.max(0, pageY - panel.rect.y));
        const [lng, lat] = fromScreen([cx, cy], panel.viewport);
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

/**
 * Pointer-drag for photos and free texts: the pointer delta divided by the preview scale moves the
 * element's centre in design units, clamped to the page. One drag is one undo step.
 */
function useElementDrag(scale: number, kind: 'photo' | 'text') {
  const setUi = useEditor((s) => s.setUi);
  const latest = useRef(scale);
  latest.current = scale;
  return useCallback(
    (id: string, e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const d = useEditor.getState().design!;
      const start = kind === 'photo' ? d.photos.find((p) => p.id === id)?.center : d.texts.find((x) => x.id === id)?.freePosition;
      setUi(kind === 'photo' ? { selectedPhotoId: id, panel: 'photos' } : { selectedTextId: id, panel: 'text' });
      if (!start) return;
      const [sx, sy] = [e.clientX, e.clientY];
      let started = false;
      const move = (ev: PointerEvent) => {
        if (!started) {
          started = true;
          gesture.start();
        }
        const s = latest.current;
        const next = clampToPage(useEditor.getState().design!, [start[0] + (ev.clientX - sx) / s, start[1] + (ev.clientY - sy) / s]);
        if (kind === 'photo') updatePhoto(id, { center: next });
        else updateText(id, { freePosition: next });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (started) gesture.end();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [kind, setUi],
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
      <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="#1a61b9" strokeWidth={1.5} strokeDasharray="4 4" />
      <text x={s.x + 4} y={s.y + label + 2} fontSize={label} fill="#1a61b9" fontFamily="sans-serif">
        {t('editor.preview.safeZone')}
      </text>
      <text x={-b + 2} y={-b - 4} fontSize={label} fill="#c42b4b" fontFamily="sans-serif">
        {t('editor.preview.bleed', { mm: GUIDE_BLEED_MM })}
      </text>
    </svg>
  );
}
