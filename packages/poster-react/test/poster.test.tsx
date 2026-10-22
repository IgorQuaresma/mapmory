import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateDraft, computeLayout, applyTheme } from '@mapmory/poster-core';
import { Poster } from '../src';

const draft = generateDraft({
  places: [{ id: 'W1', name: 'Pont des Arts', label: 'Pont des Arts, Paris, France', lngLat: [2.33753, 48.85826], bbox: null, type: 'poi', city: 'Paris', country: 'France' }],
  title: 'Where it all began',
  subtitle: null,
  date: { iso: '2019-06-14', precision: 'day' },
  mood: 'neutral',
  locale: 'en',
});
const render = (design = draft, opts: { bleedDu?: number; slugDu?: number; cropMarks?: boolean } = {}) =>
  renderToStaticMarkup(
    <Poster
      design={design}
      layout={computeLayout(design, opts)}
      showCropMarks={opts.cropMarks}
      renderMap={() => <div data-testid="map-slot" />}
    />,
  );

describe('Poster', () => {
  it('always prints the OpenStreetMap attribution', () => {
    expect(render()).toContain('© OpenStreetMap contributors');
  });

  it('renders the texts and a marker per place', () => {
    const html = render();
    expect(html).toContain('Where it all began');
    expect(html).toContain('data-testid="marker-m1"');
    expect(html).toContain('data-testid="map-slot"');
  });

  it('escapes user text instead of rendering markup (XSS)', () => {
    const evil = { ...draft, texts: draft.texts.map((t, i) => (i === 0 ? { ...t, content: '<img src=x onerror=alert(1)>' } : t)) };
    const html = render(evil);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('draws the airmail frame of the Old Letter theme', () => {
    const html = render(applyTheme(draft, 'old-letter'));
    expect(html).toContain('data-testid="frame-airmail"');
    expect(html).toMatch(/stroke="url\(#mm-airmail-[^)]+\)"/);
  });

  it('draws crop marks only in the slug area', () => {
    expect(render(draft, { bleedDu: 10, slugDu: 27, cropMarks: true })).toContain('data-testid="crop-marks"');
    expect(render(draft)).not.toContain('data-testid="crop-marks"');
  });
});
