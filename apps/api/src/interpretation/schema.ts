import { MOODS, InterpretationSchema, sanitizePlainText, type Interpretation } from '@mapmory/design-schema';
import { z } from 'zod';

/**
 * Shape requested from the model (structured output). Deliberately loose — only types and enums —
 * because the authoritative validation is `InterpretationSchema` after `normalizeInterpretation`.
 * There is no field for coordinates, URLs or style data (plan §8.1, §9).
 */
export const LlmOutputSchema = z.object({
  language: z.string().describe('ISO 639-1 code of the language the memory is written in'),
  places: z
    .array(
      z.object({
        query: z.string().describe('A geocoder search query for one place, e.g. "Pont des Arts, Paris, France"'),
        role: z.enum(['primary', 'secondary']),
        confidence: z.number().describe('0..1'),
      }),
    )
    .describe('Places mentioned, most important first. Empty if none.'),
  date: z.object({
    iso: z.string().nullable().describe('YYYY, YYYY-MM or YYYY-MM-DD, or null'),
    precision: z.enum(['day', 'month', 'year', 'unknown']),
  }),
  mood: z.enum(MOODS),
  titleIdeas: z.array(z.string()).describe('Up to 3 short poster titles (max 6 words) in the memory language'),
  subtitleIdea: z.string().nullable(),
});
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

const URL_LIKE = /(https?:\/\/|www\.|\.[a-z]{2,}\/)/i;
const COORD_LIKE = /-?\d{1,3}\.\d{2,}\s*[,;\s]\s*-?\d{1,3}\.\d{2,}/;

/** Clamps, sanitizes and validates model output. Anything suspicious is dropped, never trusted. */
export function normalizeInterpretation(raw: unknown, locale: string): Interpretation {
  const parsed = LlmOutputSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Model output did not match the schema');
  const o = parsed.data;
  const localeLang = locale.slice(0, 2).toLowerCase();
  const language = /^[a-z]{2}$/.test(o.language.toLowerCase()) ? o.language.toLowerCase() : localeLang;

  const seen = new Set<string>();
  const places = o.places
    .map((p) => ({ ...p, query: sanitizePlainText(p.query, 200).trim() }))
    .filter((p) => p.query.length > 1 && !URL_LIKE.test(p.query) && !COORD_LIKE.test(p.query))
    .filter((p) => (seen.has(p.query.toLowerCase()) ? false : (seen.add(p.query.toLowerCase()), true)))
    .slice(0, 5)
    .map((p, i) => ({ query: p.query, role: i === 0 ? ('primary' as const) : ('secondary' as const), confidence: Math.min(1, Math.max(0, p.confidence || 0)) }));

  const RANK = { unknown: 0, year: 1, month: 2, day: 3 } as const;
  let iso = o.date.iso && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(o.date.iso) ? o.date.iso : null;
  let precision: Interpretation['date']['precision'] = 'unknown';
  if (iso) {
    const parts = iso.split('-');
    const [y, m = '01', d = '01'] = parts;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d) || Number(y) < 1000 || Number(y) > 2200) {
      iso = null;
    } else {
      const fromIso = parts.length === 3 ? 'day' : parts.length === 2 ? 'month' : 'year';
      // A lower stated precision means padded parts ("2015-01-01" for "2015"): keep only what was stated.
      precision = RANK[o.date.precision] > 0 && RANK[o.date.precision] < RANK[fromIso] ? o.date.precision : fromIso;
      iso = parts.slice(0, RANK[precision]).join('-');
    }
  }

  const clean = (s: string, max: number) => sanitizePlainText(s, max).trim();
  const titleIdeas = o.titleIdeas.map((t) => clean(t, 80)).filter((t) => t.length > 0 && !URL_LIKE.test(t)).slice(0, 3);
  const subtitle = o.subtitleIdea ? clean(o.subtitleIdea, 120) : '';

  return InterpretationSchema.parse({
    language,
    places,
    date: { iso, precision },
    mood: o.mood,
    titleIdeas,
    subtitleIdea: subtitle && !URL_LIKE.test(subtitle) ? subtitle : null,
  });
}
