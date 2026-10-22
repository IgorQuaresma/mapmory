import type { Design, PaperId } from '@mapmory/design-schema';
import { pageHeightDu, resolveTrim } from './units';

const MIN_MAP_DU = 120;

/**
 * Changes paper size / orientation. Because everything is in design units, sizes with the same aspect
 * ratio scale proportionally; other aspect ratios re-flow around the map insets (plan §4.1).
 */
export function changePaper(
  design: Design,
  paper: PaperId,
  orientation: 'portrait' | 'landscape',
  custom?: { w: number; h: number },
): Design {
  const trimMm = resolveTrim(paper, orientation, custom);
  const H = pageHeightDu({ trimMm });
  const { insetDu } = design.map;
  let { top, bottom } = insetDu;
  const available = H - MIN_MAP_DU;
  if (top + bottom > available) {
    const scale = available / (top + bottom);
    top = Math.floor(top * scale);
    bottom = Math.floor(bottom * scale);
  }
  return {
    ...design,
    page: { ...design.page, paper, orientation, trimMm },
    map: { ...design.map, insetDu: { ...insetDu, top, bottom } },
  };
}
