import type { Design, DesignText, Photo, Route } from '@mapmory/design-schema';
import { pageHeightDu } from '@mapmory/poster-core';
import type { MapView } from '../../components/MapCanvas';
import { useEditor } from '../../store/editor';

/** Typed editor actions. Every change goes through `update`, which validates against the schema. */
const update = (recipe: (d: Design) => Design) => useEditor.getState().update(recipe);
export const gesture = {
  start: () => useEditor.getState().beginGesture(),
  end: () => useEditor.getState().endGesture(),
};

const round = (v: number, digits: number) => Number(v.toFixed(digits));

export function setView(view: Partial<MapView>) {
  return update((d) => ({
    ...d,
    map: {
      ...d.map,
      ...(view.center && { center: [round(view.center[0], 7), round(view.center[1], 7)] as [number, number] }),
      ...(view.zoom !== undefined && { zoom: round(Math.min(18, Math.max(1, view.zoom)), 4) }),
      ...(view.bearing !== undefined && { bearing: round(Math.min(180, Math.max(-180, view.bearing)), 2) }),
    },
  }));
}

export function updateMap(patch: Partial<Design['map']>) {
  return update((d) => ({ ...d, map: { ...d.map, ...patch } }));
}

export function updatePage(patch: Partial<Design['page']>) {
  return update((d) => ({ ...d, page: { ...d.page, ...patch } }));
}

export function updateText(id: string, patch: Partial<Design['texts'][number]>) {
  return update((d) => ({ ...d, texts: d.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function updateMarker(id: string, patch: Partial<Design['markers'][number]>) {
  return update((d) => ({ ...d, markers: d.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}

export function replaceDesign(recipe: (d: Design) => Design) {
  return update(recipe);
}

export function nextId(prefix: string, existing: { id: string }[]) {
  let i = existing.length + 1;
  while (existing.some((e) => e.id === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function setPaletteColor(key: keyof Design['map']['palette'], hex: string) {
  return update((d) => ({ ...d, map: { ...d.map, palette: { ...d.map.palette, [key]: hex } } }));
}

export function setLayer(key: keyof Design['map']['layers'], visible: boolean) {
  return update((d) => ({ ...d, map: { ...d.map, layers: { ...d.map.layers, [key]: visible } } }));
}

export function addRoute(route: Route) {
  return update((d) => ({ ...d, routes: [...d.routes, route] }));
}

export function updateRoute(id: string, patch: Partial<Route>) {
  return update((d) => ({ ...d, routes: d.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
}

export function removeRoute(id: string) {
  return update((d) => ({ ...d, routes: d.routes.filter((r) => r.id !== id) }));
}

export function addPhoto(photo: Photo) {
  return update((d) => ({ ...d, photos: [...d.photos, photo] }));
}

export function updatePhoto(id: string, patch: Partial<Photo>) {
  return update((d) => ({ ...d, photos: d.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
}

export function removePhoto(id: string) {
  return update((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));
}

/** Keeps a page position inside the page (design units). */
export function clampToPage(d: Design, [x, y]: [number, number]): [number, number] {
  const h = pageHeightDu(d.page);
  return [Math.round(Math.min(1000, Math.max(0, x)) * 10) / 10, Math.round(Math.min(h, Math.max(0, y)) * 10) / 10];
}

/** A custom text placed freely at the centre of the page. Returns its id, or null when the text limit is reached. */
export function addFreeText(base: Omit<DesignText, 'id' | 'role' | 'slot' | 'order' | 'offsetDu' | 'freePosition' | 'rotationDeg' | 'visible'>): string | null {
  const d = useEditor.getState().design;
  if (!d) return null;
  const id = nextId('text', d.texts);
  const ok = update((x) => ({
    ...x,
    texts: [
      ...x.texts,
      { ...base, id, role: 'custom', slot: 'free', order: 0, offsetDu: [0, 0], visible: true, freePosition: [500, Math.round(pageHeightDu(x.page) / 2)], rotationDeg: 0 },
    ],
  }));
  return ok ? id : null;
}
