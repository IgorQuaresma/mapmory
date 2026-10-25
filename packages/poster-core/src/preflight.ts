import { PAPER_SIZES, type Design, type ExportOptions } from '@mapmory/design-schema';
import { contrastRatio } from './color';
import { computeLayout, type LaidOutText } from './layout';
import { duToMm, duToPt, exportGeometry } from './units';

export type PreflightSeverity = 'error' | 'warning' | 'info';
export interface PreflightIssue {
  code:
    | 'text-outside-safe-zone'
    | 'text-too-wide'
    | 'low-contrast'
    | 'text-too-small'
    | 'low-dpi'
    | 'exceeds-max-size'
    | 'empty-title'
    | 'marker-outside-map'
    | 'photo-low-resolution'
    | 'leg-without-route'
    | 'stats-too-wide';
  severity: PreflightSeverity;
  target?: string;
  message: string;
}

/** Measures a text's width in design units; the browser passes a real measurement. */
export type MeasureText = (t: LaidOutText) => number;

/** Conservative estimate when no font metrics are available (server side). */
export const estimateTextWidth: MeasureText = (t) => {
  const chars = [...t.text];
  const upper = chars.filter((c) => c !== c.toLowerCase()).length;
  const glyphs = (chars.length - upper) * 0.55 + upper * 0.72;
  return t.sizeDu * (glyphs + t.letterSpacingEm * Math.max(0, chars.length - 1));
};

export function preflight(
  design: Design,
  options?: Pick<ExportOptions, 'dpi' | 'bleedMm' | 'cropMarks'>,
  measure: MeasureText = estimateTextWidth,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const layout = computeLayout(design);
  const safe = layout.safeZone;

  const title = design.texts.find((t) => t.role === 'title');
  if (!title || !title.visible || title.content.trim() === '') {
    issues.push({ code: 'empty-title', severity: 'info', target: 'title', message: 'The poster has no title.' });
  }

  for (const t of layout.texts) {
    const width = measure(t);
    const left = t.align === 'left' ? t.x : t.align === 'right' ? t.x - width : t.x - width / 2;
    const right = left + width;
    const top = t.y;
    const bottom = t.y + t.lineHeightDu;
    if (width > t.maxWidth + 1) {
      issues.push({ code: 'text-too-wide', severity: 'warning', target: t.id, message: 'This text is wider than the available space.' });
    }
    if (left < safe.x || right > safe.x + safe.w || top < safe.y || bottom > safe.y + safe.h) {
      issues.push({ code: 'text-outside-safe-zone', severity: 'warning', target: t.id, message: 'Text is close to the edge and may be cut off when trimmed.' });
    }
    const overMap = design.texts.find((x) => x.id === t.id)?.slot.startsWith('map');
    const bg = overMap ? design.map.palette.land : design.page.background;
    const ratio = contrastRatio(t.color, bg);
    const large = duToPt(design.page, t.sizeDu) >= 18;
    if (ratio < (large ? 3 : 4.5)) {
      issues.push({ code: 'low-contrast', severity: 'warning', target: t.id, message: `Low contrast (${ratio.toFixed(1)}:1) between text and background.` });
    }
    if (duToPt(design.page, t.sizeDu) < 6) {
      issues.push({ code: 'text-too-small', severity: 'warning', target: t.id, message: 'Text is smaller than 6 pt and may be hard to read in print.' });
    }
  }

  // Photos: effective print resolution from the stored image's pixel width and the photo's printed width.
  for (const p of design.photos) {
    const printedInches = duToMm(design.page, p.widthDu) / 25.4;
    const ppi = p.pxWidth / printedInches;
    if (ppi < 150) {
      issues.push({ code: 'photo-low-resolution', severity: 'warning', target: p.id, message: `This photo prints at about ${Math.round(ppi)} pixels per inch and may look soft. Make it smaller or use a larger image.` });
    }
  }

  // Race posters: every leg should show its route, and the figures must fit under their panel.
  for (const p of layout.panels) {
    if (p.leg && !p.leg.routeId) {
      issues.push({ code: 'leg-without-route', severity: 'info', target: p.leg.id, message: `The ${p.leg.label} panel has no route yet. Import your activity to draw it.` });
    }
    const s = p.stats;
    if (s && s.lines.some((line) => estimateTextWidth({ text: line, sizeDu: s.sizeDu, letterSpacingEm: 0 } as never) > s.w)) {
      issues.push({ code: 'stats-too-wide', severity: 'warning', target: p.leg!.id, message: 'The figures are wider than their panel. Make the stats text smaller or use fewer panels side by side.' });
    }
  }

  for (const m of layout.markers) {
    if (!m.insideMap) {
      issues.push({ code: 'marker-outside-map', severity: 'info', target: m.id, message: 'A marker is outside the visible map area.' });
    }
  }

  if (options) {
    const geometry = exportGeometry(design, options);
    if (geometry.exceedsLimit) {
      issues.push({ code: 'exceeds-max-size', severity: 'error', message: 'This size and resolution is too large to render. Choose a lower DPI.' });
    }
    const recommended = design.page.paper === 'custom' ? 300 : PAPER_SIZES[design.page.paper].maxRecommendedDpi;
    if (options.dpi < Math.min(recommended, 200)) {
      issues.push({ code: 'low-dpi', severity: 'info', message: `${options.dpi} DPI may look soft up close. ${recommended} DPI is recommended for this size.` });
    }
  }
  return issues;
}
