import type { Design } from '@mapmory/design-schema';
import { MARKER_ICON_PATHS, computeLayout, type PosterLayout, type Rect } from '@mapmory/poster-core';
import { useId, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { cssFontFamily } from './fonts';

export interface PosterProps {
  design: Design;
  /** Pre-computed layout (pass when bleed/slug are needed); defaults to the trim-only layout. */
  layout?: PosterLayout;
  /** Content drawn inside the map rect: a live MapLibre map (preview) or the rendered raster (print). */
  renderMap: (rect: Rect) => ReactNode;
  /** Extra overlay (e.g. safe-zone guides) drawn above the poster in page coordinates. */
  guides?: ReactNode;
  showCropMarks?: boolean;
  /** Pointer handlers for interactive marker dragging in the editor. */
  onMarkerPointerDown?: (id: string, event: PointerEvent<SVGGElement>) => void;
  selectedMarkerId?: string | null;
  className?: string;
}

/**
 * The poster drawn in design units (1 du = 1 CSS px). Callers scale it with a CSS transform.
 * Used unchanged by the editor preview and the print page, so text, frame and markers match exactly.
 */
export function Poster({ design, layout: given, renderMap, guides, showCropMarks, onMarkerPointerDown, selectedMarkerId, className }: PosterProps) {
  const layout = given ?? computeLayout(design);
  const { outer, map } = layout;
  // Everything is positioned relative to the trim origin, offset by bleed+slug.
  const ox = -outer.x;
  const oy = -outer.y;
  const abs = (r: Rect): CSSProperties => ({ position: 'absolute', left: r.x + ox, top: r.y + oy, width: r.w, height: r.h });

  return (
    <div
      className={className}
      style={{ position: 'relative', width: outer.w, height: outer.h, overflow: 'hidden', background: '#FFFFFF' }}
      data-testid="poster"
    >
      {/* Background covers trim + bleed; the slug stays white for crop marks. */}
      <div
        style={{
          position: 'absolute',
          left: layout.slugDu,
          top: layout.slugDu,
          width: outer.w - 2 * layout.slugDu,
          height: outer.h - 2 * layout.slugDu,
          background: layout.background,
        }}
      />
      <div style={{ ...abs(map.rect), clipPath: `path('${map.clipPath}')`, overflow: 'hidden' }} data-testid="poster-map">
        {renderMap(map.rect)}
      </div>

      <svg
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
        width={outer.w}
        height={outer.h}
        viewBox={`0 0 ${outer.w} ${outer.h}`}
        aria-hidden="true"
      >
        <defs>
          <clipPath id="mm-map-clip">
            <rect x={map.trimRect.x + ox} y={map.trimRect.y + oy} width={map.trimRect.w} height={map.trimRect.h} />
          </clipPath>
        </defs>
        {map.outline && (
          <path
            d={map.outline.path}
            transform={`translate(${map.trimRect.x + ox} ${map.trimRect.y + oy})`}
            fill="none"
            stroke={map.outline.color}
            strokeWidth={map.outline.widthDu}
          />
        )}
        <g clipPath="url(#mm-map-clip)">
          {layout.markers.map((m) => {
            const icon = MARKER_ICON_PATHS[m.icon];
            const s = m.sizeDu / 24;
            const tx = m.x + ox - icon.anchor[0] * s;
            const ty = m.y + oy - icon.anchor[1] * s;
            return (
              <g
                key={m.id}
                transform={`translate(${tx} ${ty}) scale(${s})`}
                style={{ pointerEvents: onMarkerPointerDown ? 'auto' : 'none', cursor: onMarkerPointerDown ? 'grab' : undefined }}
                onPointerDown={onMarkerPointerDown ? (e) => onMarkerPointerDown(m.id, e) : undefined}
                data-testid={`marker-${m.id}`}
              >
                <path
                  d={icon.d}
                  fill={m.color}
                  fillRule={icon.evenOdd ? 'evenodd' : 'nonzero'}
                  stroke={design.map.palette.land}
                  strokeWidth={1.2}
                  paintOrder="stroke"
                />
                {selectedMarkerId === m.id && (
                  <rect x={-2} y={-2} width={28} height={28} fill="none" stroke="#3B82F6" strokeWidth={1.2 / s * 2} strokeDasharray="3 2" />
                )}
              </g>
            );
          })}
        </g>
        {layout.frame && <Frame layout={layout} ox={ox} oy={oy} />}
        {showCropMarks && layout.slugDu > 0 && <CropMarks layout={layout} ox={ox} oy={oy} />}
      </svg>

      {layout.texts.map((t) => (
        <div
          key={t.id}
          data-testid={`text-${t.id}`}
          style={{
            position: 'absolute',
            left: t.x + ox,
            top: t.y + oy,
            transform: t.align === 'center' ? 'translateX(-50%)' : t.align === 'right' ? 'translateX(-100%)' : undefined,
            whiteSpace: 'pre',
            // Texts over the map must not block map dragging in the editor.
            pointerEvents: 'none',
            fontFamily: cssFontFamily(t.fontId),
            fontWeight: t.weight,
            fontStyle: t.italic ? 'italic' : 'normal',
            fontSize: t.sizeDu,
            lineHeight: `${t.lineHeightDu}px`,
            letterSpacing: `${t.letterSpacingEm}em`,
            // Balance the trailing letter-spacing so centred text is optically centred.
            paddingLeft: t.align === 'center' ? `${t.letterSpacingEm}em` : undefined,
            color: t.color,
            fontKerning: 'normal',
            textRendering: 'geometricPrecision',
          }}
        >
          {t.text}
        </div>
      ))}

      <div
        data-testid="attribution"
        style={{
          position: 'absolute',
          left: layout.attribution.x + ox,
          top: layout.attribution.y + oy - layout.attribution.sizeDu,
          transform: layout.attribution.anchor === 'end' ? 'translateX(-100%)' : undefined,
          fontFamily: cssFontFamily('inter'),
          fontSize: layout.attribution.sizeDu,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          color: layout.attribution.color,
          opacity: 0.85,
        }}
      >
        {layout.attribution.text}
      </div>
      {guides && <div style={{ position: 'absolute', left: ox, top: oy, pointerEvents: 'none' }}>{guides}</div>}
    </div>
  );
}

/** Airmail envelope border: diagonal stripes in the frame colour and airmail blue. */
const AIRMAIL_BLUE = '#2E3FD6';

function Frame({ layout, ox, oy }: { layout: PosterLayout; ox: number; oy: number }) {
  const f = layout.frame!;
  const r = f.rect;
  const patternId = `mm-airmail-${useId().replace(/:/g, '')}`;
  if (f.style === 'airmail') {
    const band = f.widthDu * 6;
    const unit = band * 1.5;
    return (
      <g data-testid="frame-airmail">
        <defs>
          <pattern id={patternId} width={unit * 3} height={unit * 3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={unit} height={unit * 3} fill={f.color} />
            <rect x={unit} width={unit} height={unit * 3} fill="#FFFFFF" />
            <rect x={unit * 2} width={unit} height={unit * 3} fill={AIRMAIL_BLUE} />
          </pattern>
        </defs>
        <rect
          x={r.x + ox + band / 2}
          y={r.y + oy + band / 2}
          width={r.w - band}
          height={r.h - band}
          fill="none"
          stroke={`url(#${patternId})`}
          strokeWidth={band}
        />
      </g>
    );
  }
  const rect = (inset: number, width: number, key: string) => (
    <rect
      key={key}
      x={r.x + ox + inset + width / 2}
      y={r.y + oy + inset + width / 2}
      width={r.w - 2 * inset - width}
      height={r.h - 2 * inset - width}
      fill="none"
      stroke={f.color}
      strokeWidth={width}
    />
  );
  if (f.style === 'double-line') return <>{[rect(0, f.widthDu, 'a'), rect(f.widthDu * 3, f.widthDu * 0.6, 'b')]}</>;
  if (f.style === 'thick-line') return rect(0, f.widthDu * 3, 'a');
  return rect(0, f.widthDu, 'a');
}

function CropMarks({ layout, ox, oy }: { layout: PosterLayout; ox: number; oy: number }) {
  const { page, bleedDu, slugDu } = layout;
  const gap = bleedDu + slugDu * 0.15;
  const len = slugDu * 0.7;
  const stroke = Math.max(0.3, slugDu * 0.02);
  const lines: [number, number, number, number][] = [];
  for (const x of [0, page.w]) {
    for (const y of [0, page.h]) {
      const sx = x === 0 ? -1 : 1;
      const sy = y === 0 ? -1 : 1;
      lines.push([x + ox + sx * gap, y + oy, x + ox + sx * (gap + len), y + oy]);
      lines.push([x + ox, y + oy + sy * gap, x + ox, y + oy + sy * (gap + len)]);
    }
  }
  return (
    <g data-testid="crop-marks">
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000000" strokeWidth={stroke} />
      ))}
    </g>
  );
}
