import type { Design, LayerKey, PaletteKey } from '@mapmory/design-schema';
import { LAYER_GROUPS, PALETTE_TARGETS, backgroundColor } from './style';

export type StyleUpdate =
  | { kind: 'paint'; layer: string; property: string; value: unknown }
  | { kind: 'layout'; layer: string; property: string; value: unknown };

/**
 * Computes the cheap incremental style changes between two designs, or `null` when the style must be
 * rebuilt (theme, label language, road weight). Used by the preview for fast palette edits (plan §6.4).
 */
export function styleUpdates(prev: Design, next: Design): StyleUpdate[] | null {
  const a = prev.map;
  const b = next.map;
  if (a.themeId !== b.themeId || a.labelLanguage !== b.labelLanguage || a.roadWeight !== b.roadWeight) return null;
  // Route data lives in a GeoJSON source; any change rebuilds the style (setStyle with diff).
  if (JSON.stringify(prev.routes) !== JSON.stringify(next.routes)) return null;
  const updates: StyleUpdate[] = [];
  for (const key of Object.keys(PALETTE_TARGETS) as PaletteKey[]) {
    if (a.palette[key] === b.palette[key]) continue;
    for (const t of PALETTE_TARGETS[key]) {
      updates.push({ kind: 'paint', layer: t.layer, property: t.property, value: b.palette[key] });
    }
  }
  for (const key of Object.keys(LAYER_GROUPS) as LayerKey[]) {
    if (a.layers[key] === b.layers[key]) continue;
    for (const layer of LAYER_GROUPS[key]) {
      updates.push({ kind: 'layout', layer, property: 'visibility', value: b.layers[key] ? 'visible' : 'none' });
    }
  }
  if (backgroundColor(prev) !== backgroundColor(next)) {
    updates.push({ kind: 'paint', layer: 'background', property: 'background-color', value: backgroundColor(next) });
  }
  return updates;
}
