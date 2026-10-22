import type { Interpretation } from '@mapmory/design-schema';

export type CoordinateFormat = 'decimal' | 'dms';

export function formatCoordinates([lng, lat]: [number, number], format: CoordinateFormat = 'decimal'): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  if (format === 'decimal') {
    return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
  }
  const dms = (v: number) => {
    const a = Math.abs(v);
    let d = Math.floor(a);
    let m = Math.floor((a - d) * 60);
    let s = Math.round(((a - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; d += 1; }
    return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
  };
  return `${dms(lat)} ${ns}  ${dms(lng)} ${ew}`;
}

/** Formats an interpreted date for the poster in the user's locale. Dates are calendar dates (UTC). */
export function formatDate(date: Interpretation['date'], locale: string): string {
  if (!date.iso || date.precision === 'unknown') return '';
  const [y, m = '01', d = '01'] = date.iso.split('-');
  const value = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(value.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions =
    date.precision === 'day'
      ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : date.precision === 'month'
        ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
        : { year: 'numeric', timeZone: 'UTC' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(value);
  } catch {
    return new Intl.DateTimeFormat('en', opts).format(value);
  }
}
