import type { Theme } from '@mapmory/themes';
import { FONT_CATALOG } from '@mapmory/fonts';

/** A small illustrative poster in the theme's colours (not a real map) for the theme gallery. */
export function ThemeSwatch({ theme }: { theme: Theme }) {
  const p = theme.palette;
  return (
    <svg viewBox="0 0 60 80" className="h-auto w-full rounded-md" aria-hidden>
      <rect width="60" height="80" fill={theme.pageBackground} />
      <g>
        <clipPath id={`sw-${theme.id}`}>
          {theme.shape === 'circle' ? <circle cx="30" cy="30" r="24" /> : <rect x="5" y="5" width="50" height="52" rx={theme.shape === 'rounded' ? 4 : 0} />}
        </clipPath>
        <g clipPath={`url(#sw-${theme.id})`}>
          <rect x="0" y="0" width="60" height="60" fill={p.land} />
          <path d="M0 34 C14 28 24 40 36 33 S54 26 60 30 V40 C50 36 40 44 30 42 S10 38 0 44Z" fill={p.water} />
          <path d="M8 10h12v9H8z M40 44h10v8H40z" fill={p.parks} />
          <path d="M5 20 L55 14 M12 5 L22 57 M38 5 L44 57 M5 50 L55 46" stroke={p.roads} strokeWidth="1.4" fill="none" />
          <path d="M5 28 L55 25 M28 5 L31 57 M5 10 L40 52 M48 5 L18 57" stroke={p.roadsMinor} strokeWidth="0.6" fill="none" />
        </g>
      </g>
      <text x="30" y="68" textAnchor="middle" fontSize="6" fill={theme.textColor} fontFamily={`'${FONT_CATALOG[theme.typography.title.fontId].family}'`}>
        Aa
      </text>
      <rect x="20" y="72" width="20" height="1.2" fill={theme.textColor} opacity="0.6" />
    </svg>
  );
}
