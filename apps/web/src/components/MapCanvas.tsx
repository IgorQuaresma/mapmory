import type { StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, type CSSProperties } from 'react';
import { maplibregl, type MapLibreMap } from '../lib/maplibre';

export interface MapView {
  center: [number, number];
  zoom: number;
  bearing: number;
}

export type MovePhase = 'start' | 'move' | 'end';

export interface MapCanvasProps {
  styleSpec: StyleSpecification;
  view: MapView;
  /** Called for user-initiated camera changes only (drag, wheel, keyboard, touch). */
  onUserMove?: (phase: MovePhase, view: MapView) => void;
  onMapClick?: (lngLat: [number, number]) => void;
  /** Called when the style must be updated; return true if handled incrementally. */
  applyStyle?: (map: MapLibreMap, next: StyleSpecification, prev: StyleSpecification) => boolean;
  onReady?: (map: MapLibreMap) => void;
  interactive?: boolean;
  pixelRatio?: number;
  ariaLabel: string;
  showAttribution?: boolean;
  className?: string;
  style?: CSSProperties;
  minZoom?: number;
  maxZoom?: number;
}

const EPS = { center: 1e-7, zoom: 1e-4, bearing: 1e-2 };

const differs = (map: MapLibreMap, v: MapView) => {
  const c = map.getCenter();
  return (
    Math.abs(c.lng - v.center[0]) > EPS.center ||
    Math.abs(c.lat - v.center[1]) > EPS.center ||
    Math.abs(map.getZoom() - v.zoom) > EPS.zoom ||
    Math.abs(map.getBearing() - v.bearing) > EPS.bearing
  );
};

/** A controlled MapLibre GL JS map: the camera follows `view`; user moves are reported, not applied. */
export function MapCanvas({
  styleSpec,
  view,
  onUserMove,
  onMapClick,
  applyStyle,
  onReady,
  interactive = true,
  pixelRatio,
  ariaLabel,
  showAttribution = false,
  className,
  style,
  minZoom = 1,
  maxZoom = 18,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleRef = useRef(styleSpec);
  const cb = useRef({ onUserMove, onMapClick, onReady, applyStyle });
  cb.current = { onUserMove, onMapClick, onReady, applyStyle };

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: styleSpec,
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing,
      pitch: 0,
      maxPitch: 0,
      minZoom,
      maxZoom,
      interactive,
      pitchWithRotate: false,
      dragRotate: true,
      touchPitch: false,
      attributionControl: showAttribution ? { compact: true, customAttribution: '© OpenStreetMap contributors' } : false,
      pixelRatio: pixelRatio ?? window.devicePixelRatio,
      fadeDuration: 0,
      renderWorldCopies: false,
      cancelPendingTileRequestsWhileZooming: true,
    });
    mapRef.current = map;
    map.getCanvas().setAttribute('aria-label', ariaLabel);
    map.getCanvas().setAttribute('role', 'application');

    const current = (): MapView => {
      const c = map.getCenter();
      let bearing = map.getBearing();
      if (bearing > 180) bearing -= 360;
      if (bearing < -180) bearing += 360;
      return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing };
    };
    let userMoving = false;
    map.on('movestart', (e) => {
      if (!e.originalEvent) return;
      userMoving = true;
      cb.current.onUserMove?.('start', current());
    });
    map.on('move', (e) => {
      if (!userMoving && !e.originalEvent) return;
      if (!userMoving) {
        userMoving = true;
        cb.current.onUserMove?.('start', current());
      }
      cb.current.onUserMove?.('move', current());
    });
    map.on('moveend', () => {
      if (!userMoving) return;
      userMoving = false;
      cb.current.onUserMove?.('end', current());
    });
    map.on('click', (e) => cb.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]));
    map.once('load', () => cb.current.onReady?.(map));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; props are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && differs(map, view)) map.jumpTo({ center: view.center, zoom: view.zoom, bearing: view.bearing });
  }, [view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === styleSpec) return;
    const prev = styleRef.current;
    styleRef.current = styleSpec;
    if (!cb.current.applyStyle?.(map, styleSpec, prev)) map.setStyle(styleSpec, { diff: true });
  }, [styleSpec]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && pixelRatio && map.getPixelRatio() !== pixelRatio) map.setPixelRatio(pixelRatio);
  }, [pixelRatio]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers = [map.dragPan, map.scrollZoom, map.boxZoom, map.dragRotate, map.keyboard, map.doubleClickZoom, map.touchZoomRotate];
    for (const h of handlers) {
      if (interactive) h.enable();
      else h.disable();
    }
  }, [interactive]);

  return <div ref={containerRef} className={className} style={style} data-testid="map-canvas" />;
}
