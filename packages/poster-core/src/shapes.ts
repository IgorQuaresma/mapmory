import type { MapShape } from '@mapmory/design-schema';

const f = (n: number) => Number(n.toFixed(3));

/**
 * SVG path (in a w×h box) used both as the preview `clip-path` and as the export mask, so the
 * shape is identical in both (plan §7.2 step 4).
 */
export function shapePath(shape: MapShape, w: number, h: number): string {
  switch (shape) {
    case 'rect':
      return `M0 0H${f(w)}V${f(h)}H0Z`;
    case 'rounded': {
      const r = Math.min(w, h) * 0.06;
      return [
        `M${f(r)} 0H${f(w - r)}`,
        `A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)}V${f(h - r)}`,
        `A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)}H${f(r)}`,
        `A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)}V${f(r)}`,
        `A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0Z`,
      ].join('');
    }
    case 'circle': {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
    }
    case 'heart': {
      const s = Math.min(w, h);
      const ox = (w - s) / 2;
      const oy = (h - s) / 2;
      const p = (x: number, y: number) => `${f(ox + x * s)} ${f(oy + y * s)}`;
      return [
        `M${p(0.5, 0.96)}`,
        `C${p(0.2, 0.74)} ${p(0, 0.52)} ${p(0, 0.3)}`,
        `C${p(0, 0.13)} ${p(0.13, 0.02)} ${p(0.29, 0.02)}`,
        `C${p(0.39, 0.02)} ${p(0.46, 0.07)} ${p(0.5, 0.15)}`,
        `C${p(0.54, 0.07)} ${p(0.61, 0.02)} ${p(0.71, 0.02)}`,
        `C${p(0.87, 0.02)} ${p(1, 0.13)} ${p(1, 0.3)}`,
        `C${p(1, 0.52)} ${p(0.8, 0.74)} ${p(0.5, 0.96)}Z`,
      ].join('');
    }
    case 'arch': {
      const r = w / 2;
      const top = Math.min(r, h);
      return `M0 ${f(h)}V${f(top)}A${f(r)} ${f(top)} 0 0 1 ${f(w)} ${f(top)}V${f(h)}Z`;
    }
  }
}

/** Shapes that never extend into the bleed (only full rectangles can bleed off the page). */
export const canBleed = (shape: MapShape) => shape === 'rect';
