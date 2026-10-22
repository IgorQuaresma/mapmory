import {
  CROP_MARK_SLUG_MM,
  MAX_RENDER_PX,
  PAGE_WIDTH_DU,
  PAPER_SIZES,
  type Design,
  type DesignPage,
  type ExportOptions,
  type PaperId,
} from '@mapmory/design-schema';

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const CSS_PX_PER_INCH = 96;

export function pageHeightDu(page: Pick<DesignPage, 'trimMm'>): number {
  return (PAGE_WIDTH_DU * page.trimMm.h) / page.trimMm.w;
}

export function mmPerDu(page: Pick<DesignPage, 'trimMm'>): number {
  return page.trimMm.w / PAGE_WIDTH_DU;
}

export const duToMm = (page: Pick<DesignPage, 'trimMm'>, du: number) => du * mmPerDu(page);
export const mmToDu = (page: Pick<DesignPage, 'trimMm'>, mm: number) => mm / mmPerDu(page);
export const duToPt = (page: Pick<DesignPage, 'trimMm'>, du: number) =>
  (duToMm(page, du) / MM_PER_INCH) * PT_PER_INCH;
export const ptToDu = (page: Pick<DesignPage, 'trimMm'>, pt: number) =>
  mmToDu(page, (pt / PT_PER_INCH) * MM_PER_INCH);

export const mmToPx = (mm: number, dpi: number) => (mm / MM_PER_INCH) * dpi;

/** Resolves a paper id + orientation to a trim size in mm. */
export function resolveTrim(
  paper: PaperId,
  orientation: 'portrait' | 'landscape',
  custom?: { w: number; h: number },
): { w: number; h: number } {
  const base = paper === 'custom' ? custom : PAPER_SIZES[paper];
  if (!base) throw new Error('Custom paper requires dimensions');
  const short = Math.min(base.w, base.h);
  const long = Math.max(base.w, base.h);
  return orientation === 'portrait' ? { w: short, h: long } : { w: long, h: short };
}

export interface ExportGeometry {
  trimMm: { w: number; h: number };
  bleedMm: number;
  slugMm: number;
  /** Full output page, including bleed and slug. */
  pageMm: { w: number; h: number };
  pagePx: { w: number; h: number };
  dpi: number;
  /** Output pixels per design unit — the MapLibre `pixelRatio` (plan §7.1). */
  pxPerDu: number;
  bleedDu: number;
  slugDu: number;
  exceedsLimit: boolean;
  megapixels: number;
}

export function exportGeometry(
  design: Pick<Design, 'page'>,
  options: Pick<ExportOptions, 'dpi' | 'bleedMm' | 'cropMarks'>,
): ExportGeometry {
  const { trimMm } = design.page;
  const slugMm = options.cropMarks ? CROP_MARK_SLUG_MM : 0;
  const pageMm = {
    w: trimMm.w + 2 * (options.bleedMm + slugMm),
    h: trimMm.h + 2 * (options.bleedMm + slugMm),
  };
  const pagePx = {
    w: Math.round(mmToPx(pageMm.w, options.dpi)),
    h: Math.round(mmToPx(pageMm.h, options.dpi)),
  };
  const pxPerDu = mmToPx(mmPerDu(design.page), options.dpi);
  return {
    trimMm,
    bleedMm: options.bleedMm,
    slugMm,
    pageMm,
    pagePx,
    dpi: options.dpi,
    pxPerDu,
    bleedDu: mmToDu(design.page, options.bleedMm),
    slugDu: mmToDu(design.page, slugMm),
    exceedsLimit: Math.max(pagePx.w, pagePx.h) > MAX_RENDER_PX,
    megapixels: (pagePx.w * pagePx.h) / 1e6,
  };
}

/** Rough uncompressed→compressed size estimate shown in the export step (plan §7.3). */
export function estimateFileSizeMb(geometry: ExportGeometry, format: ExportOptions['format']): number {
  const factor = { pdf: 0.6, png: 1.1, jpeg: 0.35, tiff: 1.6 }[format];
  return Math.max(1, Math.round(geometry.megapixels * factor));
}
