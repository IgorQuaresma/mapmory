import '@mapmory/poster-react/fonts.css';
import { computeLayout } from '@mapmory/poster-core';
import { Poster, loadDesignFonts } from '@mapmory/poster-react';
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PrintPayload } from './contract';

const CSS_PX_PER_MM = 96 / 25.4;

function PrintApp({ payload }: { payload: PrintPayload }) {
  const layout = computeLayout(payload.design, { bleedDu: payload.bleedDu, slugDu: payload.slugDu });
  const pageWidthPx = payload.pageMm.w * CSS_PX_PER_MM;
  const scale = pageWidthPx / layout.outer.w;
  // Every map panel (one per leg on a race poster) must be decoded before the page is ready.
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set());
  const mapReady = loaded.size === layout.panels.length;
  const markLoaded = useCallback((i: number) => setLoaded((s) => new Set(s).add(i)), []);

  useEffect(() => {
    let cancelled = false;
    loadDesignFonts(payload.design.texts.concat([{ fontId: 'inter', weight: 400, italic: false } as never]))
      // Photos must be decoded before Chromium prints, or the PDF can capture an empty frame.
      .then(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))))
      .then(() => {
        if (!cancelled && mapReady) window.__MAPMORY_READY__ = true;
      })
      .catch((e: Error) => (window.__MAPMORY_ERROR__ = e.message));
    return () => {
      cancelled = true;
    };
  }, [payload, mapReady]);

  return (
    <div style={{ width: `${payload.pageMm.w}mm`, height: `${payload.pageMm.h}mm`, overflow: 'hidden' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: layout.outer.w }}>
        <Poster
          design={payload.design}
          layout={layout}
          showCropMarks={payload.cropMarks}
          photoSrc={(photoId) => `/__photo/${encodeURIComponent(photoId)}`}
          renderMap={(rect, panel) =>
            payload.mode === 'live' ? (
              <LiveMap payload={payload} panel={panel.index} width={rect.w} height={rect.h} onReady={markLoaded} />
            ) : (
              <img
                src={payload.mapImageUrls?.[panel.index]}
                alt=""
                style={{ display: 'block', width: rect.w, height: rect.h }}
                onLoad={(e) => void e.currentTarget.decode().then(() => markLoaded(panel.index))}
                onError={() => (window.__MAPMORY_ERROR__ = 'Map image failed to load')}
              />
            )
          }
        />
      </div>
    </div>
  );
}

/** Parity-test mode: the same style drawn by MapLibre GL JS, to compare with the native raster. */
function LiveMap({
  payload,
  panel,
  width,
  height,
  onReady,
}: {
  payload: PrintPayload;
  panel: number;
  width: number;
  height: number;
  onReady: (panel: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: { remove(): void } | undefined;
    void Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')]).then(([{ Map, setWorkerUrl }, worker]) => {
      setWorkerUrl(worker.default);
      if (!ref.current || !payload.style) return;
      const { viewport } = computeLayout(payload.design, { bleedDu: payload.bleedDu, slugDu: payload.slugDu }).panels[panel]!;
      const m = new Map({
        container: ref.current,
        style: payload.style,
        center: viewport.center,
        zoom: viewport.zoom,
        bearing: viewport.bearing,
        interactive: false,
        attributionControl: false,
        pixelRatio: payload.pixelRatio ?? 1,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
        fadeDuration: 0,
      });
      m.once('idle', () => onReady(panel));
      m.on('error', (e) => {
        const message = String(e.error?.message ?? e);
        console.error(`map error: ${message}`);
        window.__MAPMORY_ERROR__ = message;
      });
      map = m;
    });
    return () => map?.remove();
  }, [payload, panel, onReady]);
  return <div ref={ref} style={{ width: Math.round(width), height: Math.round(height) }} />;
}

const payload = window.__MAPMORY_PRINT__;
const root = document.getElementById('root')!;
if (!payload) {
  window.__MAPMORY_ERROR__ = 'Missing print payload';
} else {
  const style = document.createElement('style');
  style.textContent = `@page { size: ${payload.pageMm.w}mm ${payload.pageMm.h}mm; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;
  document.head.appendChild(style);
  createRoot(root).render(
    <StrictMode>
      <PrintApp payload={payload} />
    </StrictMode>,
  );
}
