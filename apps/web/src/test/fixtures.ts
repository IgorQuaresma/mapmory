import type { Design } from '@mapmory/design-schema';
import { generateDraft } from '@mapmory/poster-core';
import { FIXTURE_PLACES, toResult } from '../api/fixtures';

export const sampleDesign = (): Design =>
  generateDraft({
    places: [toResult(FIXTURE_PLACES[0]!)],
    title: 'Where it all began',
    subtitle: null,
    date: { iso: '2019-06-14', precision: 'day' },
    mood: 'romantic',
    locale: 'en',
  });
