import type { DesignText, FontId } from '@mapmory/design-schema';
import { FONT_CATALOG } from '@mapmory/fonts';
import type { LaidOutText, MeasureText } from '@mapmory/poster-core';

export const cssFontFamily = (id: FontId) => `'${FONT_CATALOG[id].family}', serif`;

/** Waits for every catalog font a design uses to be loaded (prevents fallback fonts in previews/PDFs). */
export async function loadDesignFonts(texts: Pick<DesignText, 'fontId' | 'weight' | 'italic'>[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(
    texts.map((t) =>
      document.fonts.load(`${t.italic ? 'italic ' : ''}${t.weight} 32px '${FONT_CATALOG[t.fontId].family}'`).catch(() => []),
    ),
  );
  await document.fonts.ready;
}

/** Real text measurement with canvas metrics, for preflight checks in the browser. */
export function createCanvasMeasure(): MeasureText {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return (t: LaidOutText) => {
    if (!ctx) return t.text.length * t.sizeDu * 0.56;
    ctx.font = `${t.italic ? 'italic ' : ''}${t.weight} ${t.sizeDu}px '${FONT_CATALOG[t.fontId].family}'`;
    return ctx.measureText(t.text).width + t.letterSpacingEm * t.sizeDu * Math.max(0, [...t.text].length - 1);
  };
}
