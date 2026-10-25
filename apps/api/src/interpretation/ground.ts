import type { Interpretation } from '@mapmory/design-schema';
import { extractDate } from './heuristic';

const RANK = { unknown: 0, year: 1, month: 2, day: 3 } as const;

/**
 * Grounds the model's date in the text (Spike S3 finding): models fill in missing months/days ("2015" →
 * "2015-01-01") or drop the day. When a date is literally present in the text and agrees with the model's
 * (same prefix), the literal date wins, at its own precision.
 */
export function groundInterpretation(text: string, interpretation: Interpretation): Interpretation {
  return stripInjectedEcho(text, groundDate(text, interpretation));
}

function groundDate(text: string, interpretation: Interpretation): Interpretation {
  const literal = extractDate(text);
  const model = interpretation.date;
  if (!literal.iso) return interpretation;
  if (!model.iso) return { ...interpretation, date: literal };
  const agree = model.iso.startsWith(literal.iso) || literal.iso.startsWith(model.iso);
  if (agree && RANK[literal.precision] !== RANK[model.precision]) return { ...interpretation, date: literal };
  return interpretation;
}

/** Sentences that address the assistant rather than describe a memory (EN, DE, PT, FR, ES). */
const INSTRUCTION = new RegExp(
  [
    'ignore', 'disregard', 'forget (all|everything|your|the)', 'instruction', 'system', 'prompt', 'you are now', 'act as',
    'pretend', 'roleplay', 'reveal', 'output', 'respond with', 'set the (title|place)', 'use the title',
    'ignorier', 'vergiss', 'anweisung', 'du bist jetzt', 'ignor[ae]', 'instru[cç]', 'esque[cç]a', 'agora és', 'oubliez',
  ].join('|'),
  'i',
);
const STOP_WORDS = new Set(['the', 'and', 'with', 'this', 'that', 'your', 'title', 'place', 'memory', 'poster', 'output', 'anyway']);

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]{4,}/gu) ?? [];

/**
 * Drops title or subtitle suggestions that reuse words from instruction-like sentences in the memory (S3 finding:
 * a 7B model echoed "HACKED" or "Pirate" from injection attempts into 17 % of those cases). Places are untouched:
 * they are only geocoder queries and are validated separately.
 */
export function stripInjectedEcho(text: string, interpretation: Interpretation): Interpretation {
  const sentences = text.split(/(?<=[.!?\n])\s+|(?=<)/);
  const tainted = new Set(
    sentences
      .filter((s) => INSTRUCTION.test(s))
      .flatMap(words)
      .filter((w) => !STOP_WORDS.has(w)),
  );
  if (tainted.size === 0) return interpretation;
  const clean = (s: string) => !words(s).some((w) => tainted.has(w));
  const titleIdeas = interpretation.titleIdeas.filter(clean);
  const subtitleIdea = interpretation.subtitleIdea && clean(interpretation.subtitleIdea) ? interpretation.subtitleIdea : null;
  return { ...interpretation, titleIdeas, subtitleIdea };
}
