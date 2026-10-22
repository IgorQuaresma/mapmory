import type { Interpretation, Mood } from '@mapmory/design-schema';
import { FIXTURE_PLACES, normalize, type FixturePlace } from './fixtures';

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, januar: 1, february: 2, feb: 2, februar: 2, march: 3, mar: 3, marz: 3, april: 4, apr: 4,
  may: 5, mai: 5, june: 6, jun: 6, juni: 6, july: 7, jul: 7, juli: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12, dezember: 12, dez: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Extracts a calendar date from free text (EN/DE/ISO). Used by the mock and the manual fallback. */
export function extractDate(text: string): Interpretation['date'] {
  const t = normalize(text);
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, precision: 'day' };
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\.? (?:of )?([a-z]+)\.?,? (\d{4})\b/);
  if (m && MONTHS[m[2]!]) return { iso: `${m[3]}-${pad(MONTHS[m[2]!]!)}-${pad(Number(m[1]))}`, precision: 'day' };
  m = t.match(/\b([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/);
  if (m && MONTHS[m[1]!]) return { iso: `${m[3]}-${pad(MONTHS[m[1]!]!)}-${pad(Number(m[2]))}`, precision: 'day' };
  m = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (m) return { iso: `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`, precision: 'day' };
  m = t.match(/\b([a-z]+) (\d{4})\b/);
  if (m && MONTHS[m[1]!]) return { iso: `${m[2]}-${pad(MONTHS[m[1]!]!)}`, precision: 'month' };
  m = t.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return { iso: m[1]!, precision: 'year' };
  return { iso: null, precision: 'unknown' };
}

const MOOD_WORDS: [Mood, string[]][] = [
  ['romantic', ['engaged', 'proposed', 'proposal', 'wedding', 'married', 'love', 'kiss', 'first date', 'honeymoon', 'verlobt', 'hochzeit', 'liebe']],
  ['celebratory', ['birthday', 'graduat', 'celebrat', 'party', 'won', 'promotion', 'geburtstag', 'feier']],
  ['adventurous', ['hike', 'trip', 'travel', 'road', 'climb', 'backpack', 'adventure', 'reise', 'wander']],
  ['bittersweet', ['passed away', 'miss ', 'last time', 'goodbye', 'farewell', 'abschied', 'vermisse']],
  ['nostalgic', ['childhood', 'grew up', 'grandparents', 'grandma', 'grandpa', 'kindheit', 'aufgewachsen', 'years ago']],
  ['calm', ['quiet', 'calm', 'peaceful', 'sunset', 'sunrise', 'ruhig', 'sonnenuntergang']],
];

export function detectMood(text: string): Mood {
  const t = ` ${normalize(text)} `;
  for (const [mood, words] of MOOD_WORDS) if (words.some((w) => t.includes(w))) return mood;
  return 'neutral';
}

const TITLES: Record<Mood, string[]> = {
  romantic: ['Where it all began', 'Our forever starts here', 'The night we said yes'],
  celebratory: ['A day to remember', 'Cheers to this place', 'The best day'],
  adventurous: ['Where the adventure began', 'Wander often', 'Not all who wander are lost'],
  bittersweet: ['Forever in our hearts', 'Where we last met', 'Always with us'],
  nostalgic: ['Where I grew up', 'Home, always', 'The good old days'],
  calm: ['Our quiet place', 'Breathe here', 'Still waters'],
  neutral: ['A place to remember', 'Our place', 'Where it happened'],
};

/** Finds fixture places mentioned in the text; specific places beat the city they are in. */
export function findPlaces(text: string): FixturePlace[] {
  const t = ` ${normalize(text)} `;
  const hits = FIXTURE_PLACES.filter((p) =>
    p.aliases.some((a) => new RegExp(`[^\\p{L}]${escape(normalize(a))}[^\\p{L}]`, 'u').test(t)),
  );
  const specific = hits.filter((p) => p.type !== 'city');
  const cities = hits.filter((p) => p.type === 'city' && !specific.some((s) => s.city === p.name));
  return [...specific, ...cities].slice(0, 5);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function heuristicInterpretation(text: string, locale: string): Interpretation {
  const places = findPlaces(text);
  const mood = detectMood(text);
  return {
    language: locale.slice(0, 2),
    places: places.map((p, i) => ({ query: p.label, role: i === 0 ? 'primary' : 'secondary', confidence: 0.6 })),
    date: extractDate(text),
    mood,
    titleIdeas: TITLES[mood],
    subtitleIdea: null,
  };
}
