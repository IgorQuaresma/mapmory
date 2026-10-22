import type { DraftInput } from '@mapmory/design-schema';
import { applyTheme, generateDraft } from '@mapmory/poster-core';
import { Poster } from '@mapmory/poster-react';
import type { ThemeId } from '@mapmory/design-schema';
import { useMemo } from 'react';

/** A static illustrated poster for the landing page (no map tiles needed). */
export function ExamplePoster({ input, themeId, width }: { input: DraftInput; themeId: ThemeId; width: number }) {
  const design = useMemo(() => applyTheme(generateDraft(input), themeId), [input, themeId]);
  const scale = width / 1000;
  const p = design.map.palette;
  return (
    <div style={{ width, height: 1414 * scale }} className="overflow-hidden shadow-[var(--shadow-poster)]" aria-hidden>
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: 1000 }}>
        <Poster
          design={design}
          renderMap={(rect) => (
            <svg width={rect.w} height={rect.h} viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect width="100" height="100" fill={p.land} />
              <path d="M0 52 C18 44 30 60 48 52 S80 40 100 47 V60 C82 54 66 66 50 63 S18 58 0 66Z" fill={p.water} />
              <path d="M10 12h16v12H10z M64 70h14v12H64z M70 16h18v10H70z" fill={p.parks} />
              <g stroke={p.roadsMinor} strokeWidth="0.35" fill="none">
                {Array.from({ length: 14 }, (_, i) => <path key={`h${i}`} d={`M0 ${i * 7 + 3} L100 ${i * 7 + 1 + (i % 3)}`} />)}
                {Array.from({ length: 12 }, (_, i) => <path key={`v${i}`} d={`M${i * 9 + 2} 0 L${i * 9 + 5 - (i % 4)} 100`} />)}
              </g>
              <g stroke={p.roads} strokeWidth="1.1" fill="none" strokeLinecap="round">
                <path d="M0 30 L100 22" />
                <path d="M18 0 L34 100" />
                <path d="M72 0 L60 100" />
                <path d="M0 86 C30 80 60 90 100 78" />
              </g>
            </svg>
          )}
        />
      </div>
    </div>
  );
}
