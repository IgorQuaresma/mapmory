import { describe, expect, it } from 'vitest';
import { InterpretationSchema } from '@mapmory/design-schema';
import { detectMood, extractDate, findPlaces, heuristicInterpretation } from './heuristics';

describe('mock interpretation heuristics', () => {
  it('extracts dates in several formats', () => {
    expect(extractDate('on 14 June 2019')).toEqual({ iso: '2019-06-14', precision: 'day' });
    expect(extractDate('June 14, 2019')).toEqual({ iso: '2019-06-14', precision: 'day' });
    expect(extractDate('am 14.06.2019')).toEqual({ iso: '2019-06-14', precision: 'day' });
    expect(extractDate('August 2022')).toEqual({ iso: '2022-08', precision: 'month' });
    expect(extractDate('back in 1998')).toEqual({ iso: '1998', precision: 'year' });
    expect(extractDate('no date here')).toEqual({ iso: null, precision: 'unknown' });
  });

  it('prefers specific places over their city', () => {
    expect(findPlaces('engaged on the Pont des Arts in Paris').map((p) => p.name)).toEqual(['Pont des Arts']);
    expect(findPlaces('we moved to Lisbon').map((p) => p.name)).toEqual(['Lisbon']);
  });

  it('detects moods and returns schema-valid output', () => {
    expect(detectMood('the night we got engaged')).toBe('romantic');
    const r = heuristicInterpretation('Our trip to the Belém Tower, August 2022', 'en');
    expect(InterpretationSchema.safeParse(r).success).toBe(true);
    expect(r.mood).toBe('adventurous');
  });
});
