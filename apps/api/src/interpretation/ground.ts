import type { Interpretation } from '@mapmory/design-schema';
import { extractDate } from './heuristic';

const RANK = { unknown: 0, year: 1, month: 2, day: 3 } as const;

/**
 * Grounds the model's date in the text (Spike S3 finding): models fill in missing months/days ("2015" →
 * "2015-01-01") or drop the day. When a date is literally present in the text and agrees with the model's
 * (same prefix), the literal date wins, at its own precision.
 */
export function groundInterpretation(text: string, interpretation: Interpretation): Interpretation {
  const literal = extractDate(text);
  const model = interpretation.date;
  if (!literal.iso) return interpretation;
  if (!model.iso) return { ...interpretation, date: literal };
  const agree = model.iso.startsWith(literal.iso) || literal.iso.startsWith(model.iso);
  if (agree && RANK[literal.precision] !== RANK[model.precision]) return { ...interpretation, date: literal };
  return interpretation;
}
