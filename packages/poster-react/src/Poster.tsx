import type { Design } from '@mapmory/design-schema';
import {
  DISCIPLINE_ICONS,
  MARKER_ICON_PATHS,
  computeLayout,
  type LaidOutPanel,
  type LaidOutStats,
  type PosterLayout,
  type Rect,
} from '@mapmory/poster-core';
import { useId, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { cssFontFamily } from './fonts';

export interface PosterProps {
  design: Design;
  /** Pre-computed layout (pass when bleed/slug are needed); defaults to the trim-only layout. */
  layout?: PosterLayout;
  /**
   * Content drawn inside a map panel: a live MapLibre map (preview) or the rendered raster (print). Called once per
   * panel: once on a single-map poster, once per leg on a race poster.
   */
  renderMap: (rect: Rect, panel: LaidOutPanel) => ReactNode;
  /** Extra overlay (e.g. safe-zone guides) drawn above the poster in page coordinates. */
  guides?: ReactNode;
  showCropMarks?: boolean;
  /** Pointer handlers for interactive marker dragging in the editor. */
  onMarkerPointerDown?: (id: string, event: PointerEvent<SVGGElement>) => void;
  selectedMarkerId?: string | null;
  /** Image URL for an uploaded photo id: the API in the editor, a local route in the print page. */
  photoSrc?: (photoId: string) => string;
  /** Drag handlers for photos and freely placed texts in the editor. */
  onPhotoPointerDown?: (id: string, event: PointerEvent<HTMLDivElement>) => void;
  onTextPointerDown?: (id: string, event: PointerEvent<HTMLDivElement>) => void;
  selectedPhotoId?: string | null;
  selectedTextId?: string | null;
  className?: string;
}

/**
 * The poster drawn in design units (1 du = 1 CSS px). Callers scale it with a CSS transform.
 * Used unchanged by the editor preview and the print page, so text, frame and markers match exactly.
 */
export function Poster({
  design,
  layout: given,
  renderMap,
  guides,
  showCropMarks,
  onMarkerPointerDown,
  selectedMarkerId,
  photoSrc,
  onPhotoPointerDown,
  onTextPointerDown,
  selectedPhotoId,
  selectedTextId,
  className,
}: PosterProps) {
  const layout = given ?? computeLayout(design);
  const { outer, panels } = layout;
  const clipBase = `mm-map-clip-${useId().replace(/:/g, '')}`;
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
      {panels.map((p) => (
        <div
          key={p.index}
          style={{ ...abs(p.rect), clipPath: `path('${p.clipPath}')`, overflow: 'hidden' }}
          data-testid={p.leg ? `poster-panel-${p.leg.id}` : 'poster-map'}
        >
          {renderMap(p.rect, p)}
        </div>
      ))}

      <svg
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
        width={outer.w}
        height={outer.h}
        viewBox={`0 0 ${outer.w} ${outer.h}`}
        aria-hidden="true"
      >
        <defs>
          {panels.map((p) => (
            <clipPath key={p.index} id={`${clipBase}-${p.index}`}>
              <rect x={p.trimRect.x + ox} y={p.trimRect.y + oy} width={p.trimRect.w} height={p.trimRect.h} />
            </clipPath>
          ))}
        </defs>
        {panels.map(
          (p) =>
            p.outline && (
              <path
                key={p.index}
                d={p.outline.path}
                transform={`translate(${p.trimRect.x + ox} ${p.trimRect.y + oy})`}
                fill="none"
                stroke={p.outline.color}
                strokeWidth={p.outline.widthDu}
              />
            ),
        )}
        {panels.map((p) => p.stats && <StatsIcon key={p.index} stats={p.stats} ox={ox} oy={oy} />)}
        {panels.map((p) => (
          <g key={p.index} clipPath={`url(#${clipBase}-${p.index})`}>
            {layout.markers.filter((m) => m.panel === p.index).map((m) => {
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
        ))}
        {layout.frame && <Frame layout={layout} ox={ox} oy={oy} />}
        {showCropMarks && layout.slugDu > 0 && <CropMarks layout={layout} ox={ox} oy={oy} />}
      </svg>

      {layout.photos.map((p) => (
        <div
          key={p.id}
          data-testid={`photo-${p.id}`}
          onPointerDown={onPhotoPointerDown ? (e) => onPhotoPointerDown(p.id, e) : undefined}
          style={{
            position: 'absolute',
            left: p.x + ox - p.framePad,
            top: p.y + oy - p.framePad,
            width: p.w + 2 * p.framePad,
            height: p.h + p.framePad + p.framePadBottom,
            transform: p.rotationDeg ? `rotate(${p.rotationDeg}deg)` : undefined,
            transformOrigin: `${p.framePad + p.w / 2}px ${p.framePad + p.h / 2}px`,
            background: p.frame === 'border' || p.frame === 'polaroid' ? p.frameColor : undefined,
            padding: `${p.framePad}px ${p.framePad}px ${p.framePadBottom}px`,
            boxSizing: 'border-box',
            boxShadow: p.frame === 'polaroid' ? '0 2px 6px rgba(0, 0, 0, 0.18)' : undefined,
            borderRadius: p.frame === 'circle' ? '50%' : undefined,
            outline: selectedPhotoId === p.id ? '2px dashed #3B82F6' : undefined,
            outlineOffset: 4,
            cursor: onPhotoPointerDown ? 'move' : undefined,
            touchAction: onPhotoPointerDown ? 'none' : undefined,
          }}
        >
          {/* A neutral placeholder shows through if the image cannot be loaded. */}
          <div style={{ width: p.w, height: p.h, background: '#E6E4EE', borderRadius: p.frame === 'circle' ? '50%' : undefined, overflow: 'hidden' }}>
            {photoSrc && (
              <img
                src={photoSrc(p.photoId)}
                alt=""
                draggable={false}
                onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                style={{ display: 'block', width: p.w, height: p.h, objectFit: 'cover', pointerEvents: 'none' }}
              />
            )}
          </div>
        </div>
      ))}

      {panels.map((p) => p.stats && <StatsText key={p.index} stats={p.stats} ox={ox} oy={oy} />)}

      {layout.texts.map((t) => (
        <div
          key={t.id}
          data-testid={`text-${t.id}`}
          onPointerDown={t.free && onTextPointerDown ? (e) => onTextPointerDown(t.id, e) : undefined}
          style={{
            position: 'absolute',
            left: t.x + ox,
            top: t.y + oy,
            transform:
              [t.align === 'center' ? 'translateX(-50%)' : t.align === 'right' ? 'translateX(-100%)' : '', t.rotationDeg ? `rotate(${t.rotationDeg}deg)` : '']
                .filter(Boolean)
                .join(' ') || undefined,
            transformOrigin: t.align === 'center' ? '50% 50%' : t.align === 'right' ? '100% 50%' : '0 50%',
            whiteSpace: 'pre',
            // Slotted texts must not block map dragging; free texts are dragged themselves in the editor.
            pointerEvents: t.free && onTextPointerDown ? 'auto' : 'none',
            cursor: t.free && onTextPointerDown ? 'move' : undefined,
            touchAction: t.free && onTextPointerDown ? 'none' : undefined,
            outline: selectedTextId === t.id && t.free ? '2px dashed #3B82F6' : undefined,
            outlineOffset: 4,
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

/** Geometry of the stats block: icon and label on the first line, figures below (all in design units). */
function statsMetrics(s: LaidOutStats) {
  const iconSize = s.sizeDu * 1.35;
  const labelSize = s.sizeDu * 1.05;
  const lineHeight = s.sizeDu * 1.3;
  return { iconSize, labelSize, lineHeight, firstLine: Math.max(iconSize, labelSize * 1.2) };
}

/** Width estimate of the label, so the icon and label are centred together. Matches preflight's average. */
const labelWidth = (s: LaidOutStats) => s.label.length * s.sizeDu * 1.05 * 0.62 * 1.1;

function StatsIcon({ stats: s, ox, oy }: { stats: LaidOutStats; ox: number; oy: number }) {
  const { iconSize, firstLine } = statsMetrics(s);
  const gap = s.sizeDu * 0.45;
  const left = s.x - (iconSize + gap + labelWidth(s)) / 2;
  const icon = DISCIPLINE_ICONS[s.discipline];
  const k = iconSize / 24;
  return (
    <g
      transform={`translate(${left + ox} ${s.y + oy + (firstLine - iconSize) / 2}) scale(${k})`}
      fill="none"
      stroke={s.color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-testid={`stats-icon-${s.discipline}`}
    >
      <path d={icon.d} />
      {icon.circles.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

function StatsText({ stats: s, ox, oy }: { stats: LaidOutStats; ox: number; oy: number }) {
  const { iconSize, labelSize, lineHeight, firstLine } = statsMetrics(s);
  const gap = s.sizeDu * 0.45;
  const left = s.x - (iconSize + gap + labelWidth(s)) / 2;
  const font = {
    fontFamily: cssFontFamily(s.fontId),
    color: s.color,
    whiteSpace: 'pre' as const,
    pointerEvents: 'none' as const,
  };
  return (
    <>
      <div
        style={{
          ...font,
          position: 'absolute',
          left: left + iconSize + gap + ox,
          top: s.y + oy,
          height: firstLine,
          lineHeight: `${firstLine}px`,
          fontSize: labelSize,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {s.label}
      </div>
      {s.lines.map((line, i) => (
        <div
          key={i}
          data-testid="stats-line"
          style={{
            ...font,
            position: 'absolute',
            left: s.x + ox,
            top: s.y + oy + firstLine + s.sizeDu * 0.2 + i * lineHeight,
            transform: 'translateX(-50%)',
            fontSize: s.sizeDu,
            lineHeight: `${lineHeight}px`,
            fontWeight: i === 0 ? 600 : 400,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {line}
        </div>
      ))}
    </>
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
